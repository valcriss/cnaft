import { computed, reactive } from "vue";
import {
  type AnchorPosition,
  DEFAULT_TEXT_SIZE,
  createCanvasElement,
  type CanvasElement,
  type StrokeStyle,
  type EnvelopeType,
  type ElementType,
  type LineArrow,
  type LineArrowStyle,
  type LineRoute,
  type LineStyle,
  type ShadowType,
  type TextTransformMode,
  type TextAlign,
  type TextVerticalAlign,
  type Tool,
} from "../domain/elements";
import {
  DOCUMENT_SCHEMA,
  DOCUMENT_VERSION,
  type CanvasDocumentState,
  type VersionedCanvasDocument,
  isObject,
} from "../domain/documentSchema";
import { LocalLoopbackAdapter, type CollabAdapter } from "../collab/collabAdapter";
import { OP_SCHEMA_VERSION, OP_VERSION, isValidOperation, type Operation } from "../collab/operations";

type Snapshot = {
  elements: CanvasElement[];
  selectedIds: string[];
};

type OperationTransaction = {
  undoOps: Operation[];
  redoOps: Operation[];
};

export type {
  AnchorPosition,
  CanvasElement,
  StrokeStyle,
  EnvelopeType,
  ElementType,
  LineArrow,
  LineArrowStyle,
  LineRoute,
  LineStyle,
  TextAlign,
  TextVerticalAlign,
  ShadowType,
  TextTransformMode,
  Tool,
} from "../domain/elements";
export type { CanvasDocumentState, VersionedCanvasDocument } from "../domain/documentSchema";
export type { Operation } from "../collab/operations";

type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

type RemotePresence = {
  username: string;
  avatar: string;
  color: string;
  cursor: { x: number; y: number } | null;
  viewport: { x: number; y: number; zoom: number } | null;
  selectedIds: string[];
  editingElementId: string | null;
  online: boolean;
  lastSeenAt: number;
};

type LocalIdentity = {
  username: string;
  avatar: string;
  color: string;
};

type ElementLock = {
  lockId: string;
  clientId: string;
  username: string;
  expiresAt: number;
};

type CanvasState = {
  tool: Tool;
  elements: CanvasElement[];
  selectedIds: string[];
  viewport: Viewport;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
  timerRunning: boolean;
  timerRemainingSec: number;
  timerSoundEnabled: boolean;
  timerSoundMp3: string;
  timerSoundOgg: string;
  voteActive: boolean;
  voteElementIds: string[];
  voteCounts: Record<string, number>;
  voteParticipants: Record<string, { remaining: number; counts: Record<string, number> }>;
  voteRemaining: number;
  voteVotesPerParticipant: number;
  voteMaxPerObject: number;
  voteResultsVisible: boolean;
  voteResults: Array<{ elementId: string; votes: number }>;
  localIdentity: LocalIdentity;
  remotePresences: Record<string, RemotePresence>;
  elementLocks: Record<string, ElementLock>;
  presenceRevision: number;
  collabDebug: {
    sentCount: number;
    recvCount: number;
    gapCount: number;
    invalidCount: number;
    lastSentType: string;
    lastRecvType: string;
    lastSeq: number;
    recentOps: Array<{
      direction: "sent" | "recv" | "invalid" | "gap";
      type: string;
      clientId: string;
      seq: number | null;
      at: number;
    }>;
  };
  followTargetClientId: string | null;
  revision: number;
  clientId: string;
};

const state = reactive<CanvasState>({
  tool: "select",
  elements: [],
  selectedIds: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  gridSize: 24,
  showGrid: true,
  snapToGrid: false,
  timerRunning: false,
  timerRemainingSec: 0,
  timerSoundEnabled: true,
  timerSoundMp3: "",
  timerSoundOgg: "",
  voteActive: false,
  voteElementIds: [],
  voteCounts: {},
  voteParticipants: {},
  voteRemaining: 0,
  voteVotesPerParticipant: 0,
  voteMaxPerObject: 1,
  voteResultsVisible: false,
  voteResults: [],
  localIdentity: {
    username: "Utilisateur",
    avatar: "",
    color: "#1d4ed8",
  },
  remotePresences: {},
  elementLocks: {},
  followTargetClientId: null,
  presenceRevision: 0,
  collabDebug: {
    sentCount: 0,
    recvCount: 0,
    gapCount: 0,
    invalidCount: 0,
    lastSentType: "",
    lastRecvType: "",
    lastSeq: 0,
    recentOps: [],
  },
  revision: 0,
  clientId: crypto.randomUUID(),
});
state.localIdentity.color = hashColorFromClientId(state.clientId);

const history = reactive({
  undoStack: [] as Snapshot[],
  redoStack: [] as Snapshot[],
});
const opHistory = reactive({
  undoStack: [] as OperationTransaction[],
  redoStack: [] as OperationTransaction[],
});

let interactionSnapshot: Snapshot | null = null;
let clipboard: CanvasElement[] = [];
let timerIntervalId: number | null = null;
let timerEndAt = 0;
const appliedOperationIds = new Set<string>();
let collabAdapter: CollabAdapter = new LocalLoopbackAdapter();
let unsubscribeAdapter: (() => void) | null = null;
let localPresenceAnnounced = false;
let presenceHeartbeatIntervalId: number | null = null;
let presenceTimeoutIntervalId: number | null = null;
let localSequence = 0;
const maxSeqByClient = new Map<string, number>();
let lastResyncRequestAt = 0;
const RESYNC_DEBOUNCE_MS = 1200;
let interactionLockIds: string[] = [];
let interactionLockToken: string | null = null;
let isReplayingHistory = false;
let interactionUndoMap = new Map<string, Operation>();
let interactionRedoMap = new Map<string, Operation>();
const PRESENCE_HEARTBEAT_MS = 3000;
const PRESENCE_TIMEOUT_MS = 12000;
const LOCK_TTL_MS = 12000;
const OPPOSITE_ANCHOR: Record<AnchorPosition, AnchorPosition> = {
  top: "bottom",
  topRight: "bottomLeft",
  right: "left",
  bottomRight: "topLeft",
  bottom: "top",
  bottomLeft: "topRight",
  left: "right",
  topLeft: "bottomRight",
};

function cloneElement(element: CanvasElement): CanvasElement {
  return clonePlain(element);
}

function createSnapshot(): Snapshot {
  return {
    elements: state.elements.map(cloneElement),
    selectedIds: [...state.selectedIds],
  };
}

function applySnapshot(snapshot: Snapshot) {
  state.elements = snapshot.elements.map(cloneElement);
  state.selectedIds = [...snapshot.selectedIds];
  updatePresenceSelection(state.selectedIds);
}

function isSameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushUndoSnapshot(snapshot: Snapshot) {
  history.undoStack.push(snapshot);
  if (history.undoStack.length > 100) {
    history.undoStack.shift();
  }
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeHistoryOperation(
  operation: Operation["type"],
  payload: Operation["payload"],
): Operation {
  return {
    opId: "",
    clientId: state.clientId,
    type: operation,
    payload: clonePlain(payload),
  } as Operation;
}

function shouldTrackOperationForUndo(operation: Operation) {
  if (operation.clientId !== state.clientId) return false;
  if (operation.type.startsWith("presence.")) return false;
  if (operation.type.startsWith("document.")) return false;
  if (operation.type.startsWith("timer.")) return false;
  if (operation.type.startsWith("vote.")) return false;
  if (operation.type.startsWith("element.lock.")) return false;
  return (
    operation.type === "element.add" ||
    operation.type === "element.move" ||
    operation.type === "element.resize" ||
    operation.type === "element.updateText" ||
    operation.type === "element.patchStyle" ||
    operation.type === "line.patchStyle" ||
    operation.type === "line.setGeometry" ||
    operation.type === "text.patchStyle" ||
    operation.type === "elements.delete" ||
    operation.type === "element.patchData"
  );
}

function getTrackKey(operation: Operation) {
  if (operation.type === "element.add") return `element.add:${operation.payload.element.id}`;
  if (operation.type === "elements.delete") {
    const ids = [...operation.payload.ids].sort();
    return `elements.delete:${ids.join(",")}`;
  }
  if (
    operation.type === "element.move" ||
    operation.type === "element.resize" ||
    operation.type === "element.updateText" ||
    operation.type === "element.patchStyle" ||
    operation.type === "line.patchStyle" ||
    operation.type === "line.setGeometry" ||
    operation.type === "text.patchStyle" ||
    operation.type === "element.patchData"
  ) {
    return `${operation.type}:${operation.payload.id}`;
  }
  return null;
}

function buildInverseOperation(operation: Operation): Operation | null {
  if (operation.type === "element.add") {
    return makeHistoryOperation("elements.delete", { ids: [operation.payload.element.id] });
  }

  if (operation.type === "element.move") {
    const element = state.elements.find((item) => item.id === operation.payload.id);
    if (!element) return null;
    return makeHistoryOperation("element.move", {
      id: element.id,
      x: element.x,
      y: element.y,
    });
  }

  if (operation.type === "element.resize") {
    const element = state.elements.find((item) => item.id === operation.payload.id);
    if (!element) return null;
    const payload: Extract<Operation, { type: "element.resize" }>["payload"] = {
      id: element.id,
      width: element.width,
      height: element.height,
    };
    if (typeof operation.payload.nextX === "number") {
      payload.nextX = element.x;
    }
    if (typeof operation.payload.nextY === "number") {
      payload.nextY = element.y;
    }
    if (element.type === "text" && typeof operation.payload.nextFontSize === "number") {
      payload.nextFontSize = element.fontSize;
    }
    return makeHistoryOperation("element.resize", payload);
  }

  if (operation.type === "element.updateText") {
    const element = state.elements.find((item) => item.id === operation.payload.id);
    if (!element || (element.type !== "text" && element.type !== "note" && element.type !== "envelope")) return null;
    return makeHistoryOperation("element.updateText", {
      id: element.id,
      text: element.text ?? "",
    });
  }

  if (operation.type === "element.patchStyle") {
    const element = state.elements.find((item) => item.id === operation.payload.id);
    if (!element || element.type === "line") return null;
    const inversePatch: Extract<Operation, { type: "element.patchStyle" }>["payload"]["patch"] = {};
    if (typeof operation.payload.patch.fill !== "undefined") inversePatch.fill = element.fill;
    if (typeof operation.payload.patch.stroke !== "undefined") inversePatch.stroke = element.stroke;
    if (typeof operation.payload.patch.strokeStyle !== "undefined") inversePatch.strokeStyle = element.strokeStyle;
    if (typeof operation.payload.patch.shadowType !== "undefined") inversePatch.shadowType = element.shadowType;
    return makeHistoryOperation("element.patchStyle", { id: element.id, patch: inversePatch });
  }

  if (operation.type === "line.patchStyle") {
    const element = state.elements.find(
      (item): item is Extract<CanvasElement, { type: "line" }> => item.id === operation.payload.id && item.type === "line",
    );
    if (!element) return null;
    const inversePatch: Extract<Operation, { type: "line.patchStyle" }>["payload"]["patch"] = {};
    if (typeof operation.payload.patch.stroke !== "undefined") inversePatch.stroke = element.stroke;
    if (typeof operation.payload.patch.lineStyle !== "undefined") inversePatch.lineStyle = element.lineStyle;
    if (typeof operation.payload.patch.lineRoute !== "undefined") inversePatch.lineRoute = element.lineRoute;
    if (typeof operation.payload.patch.lineArrow !== "undefined") inversePatch.lineArrow = element.lineArrow;
    if (typeof operation.payload.patch.lineArrowStyle !== "undefined") inversePatch.lineArrowStyle = element.lineArrowStyle;
    if (typeof operation.payload.patch.label !== "undefined") inversePatch.label = element.label;
    if (typeof operation.payload.patch.labelColor !== "undefined") inversePatch.labelColor = element.labelColor;
    if (typeof operation.payload.patch.labelBg !== "undefined") inversePatch.labelBg = element.labelBg;
    if (typeof operation.payload.patch.labelSize !== "undefined") inversePatch.labelSize = element.labelSize;
    if (typeof operation.payload.patch.strokeWidth !== "undefined") inversePatch.strokeWidth = element.strokeWidth;
    return makeHistoryOperation("line.patchStyle", { id: element.id, patch: inversePatch });
  }

  if (operation.type === "line.setGeometry") {
    const element = state.elements.find(
      (item): item is Extract<CanvasElement, { type: "line" }> => item.id === operation.payload.id && item.type === "line",
    );
    if (!element) return null;
    return makeHistoryOperation("line.setGeometry", {
      id: element.id,
      x: element.x,
      y: element.y,
      x2: element.x2,
      y2: element.y2,
      startAnchor: element.startAnchor ? { ...element.startAnchor } : null,
      endAnchor: element.endAnchor ? { ...element.endAnchor } : null,
    });
  }

  if (operation.type === "text.patchStyle") {
    const element = state.elements.find(
      (item): item is Extract<CanvasElement, { type: "text" | "note" | "envelope" }> =>
        item.id === operation.payload.id && (item.type === "text" || item.type === "note" || item.type === "envelope"),
    );
    if (!element) return null;
    const inversePatch: Extract<Operation, { type: "text.patchStyle" }>["payload"]["patch"] = {};
    if (typeof operation.payload.patch.fontFamily !== "undefined") inversePatch.fontFamily = element.fontFamily;
    if (typeof operation.payload.patch.textAlign !== "undefined") inversePatch.textAlign = element.textAlign;
    if (typeof operation.payload.patch.textVerticalAlign !== "undefined") inversePatch.textVerticalAlign = element.textVerticalAlign;
    if (typeof operation.payload.patch.bold !== "undefined") inversePatch.bold = element.bold;
    if (typeof operation.payload.patch.italic !== "undefined") inversePatch.italic = element.italic;
    if (typeof operation.payload.patch.underline !== "undefined") inversePatch.underline = element.underline;
    if (typeof operation.payload.patch.fontSize !== "undefined") inversePatch.fontSize = element.fontSize;
    if (typeof operation.payload.patch.lineHeight !== "undefined") inversePatch.lineHeight = element.lineHeight;
    if (typeof operation.payload.patch.letterSpacing !== "undefined") inversePatch.letterSpacing = element.letterSpacing;
    if (typeof operation.payload.patch.textTransform !== "undefined") inversePatch.textTransform = element.textTransform;
    if (
      typeof operation.payload.patch.textColor !== "undefined" &&
      (element.type === "note" || element.type === "envelope")
    ) {
      inversePatch.textColor = element.textColor;
    }
    return makeHistoryOperation("text.patchStyle", { id: element.id, patch: inversePatch });
  }

  if (operation.type === "element.patchData") {
    const element = state.elements.find((item) => item.id === operation.payload.id);
    if (!element) return null;
    const inversePatch: Extract<Operation, { type: "element.patchData" }>["payload"]["patch"] = {};
    if (typeof operation.payload.patch.locked !== "undefined") {
      inversePatch.locked = element.locked;
    }
    if (element.type === "envelope") {
      if (typeof operation.payload.patch.envelopeType !== "undefined") {
        inversePatch.envelopeType = element.envelopeType;
      }
      if (typeof operation.payload.patch.titleOffsetX !== "undefined") {
        inversePatch.titleOffsetX = element.titleOffsetX;
      }
      if (typeof operation.payload.patch.titleOffsetY !== "undefined") {
        inversePatch.titleOffsetY = element.titleOffsetY;
      }
      if (typeof operation.payload.patch.memberIds !== "undefined") {
        inversePatch.memberIds = [...element.memberIds];
      }
    }
    return makeHistoryOperation("element.patchData", {
      id: element.id,
      patch: inversePatch,
    });
  }

  if (operation.type === "elements.delete") {
    return null;
  }

  return null;
}

function buildInverseOperations(operation: Operation): Operation[] {
  if (operation.type === "elements.delete") {
    const mapById = new Map(state.elements.map((element) => [element.id, element]));
    return operation.payload.ids
      .map((id) => mapById.get(id))
      .filter((element): element is CanvasElement => Boolean(element))
      .map((element) => makeHistoryOperation("element.add", { element: cloneElement(element) }));
  }
  const inverse = buildInverseOperation(operation);
  return inverse ? [inverse] : [];
}

function pushOperationTransaction(transaction: OperationTransaction) {
  if (transaction.undoOps.length === 0 || transaction.redoOps.length === 0) return;
  opHistory.undoStack.push(transaction);
  if (opHistory.undoStack.length > 100) {
    opHistory.undoStack.shift();
  }
  opHistory.redoStack = [];
}

function recordSnapshot() {
  pushUndoSnapshot(createSnapshot());
  history.redoStack = [];
  opHistory.redoStack = [];
  markDocumentChanged();
}

function nextOperationId() {
  return `${state.clientId}:${crypto.randomUUID()}`;
}

function hashColorFromClientId(clientId: string) {
  const palette = [
    "#1d4ed8",
    "#0f766e",
    "#b45309",
    "#be123c",
    "#6d28d9",
    "#0369a1",
    "#166534",
    "#a21caf",
  ] as const;
  let hash = 0;
  for (let i = 0; i < clientId.length; i += 1) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length] ?? "#1d4ed8";
}

function getDefaultPresenceUsername(clientId: string) {
  return `User ${clientId.slice(0, 4)}`;
}

function normalizeIdentityUsername(username: string) {
  const trimmed = username.trim();
  return trimmed.length > 0 ? trimmed : "Utilisateur";
}

function normalizeIdentityAvatar(avatar?: string) {
  const trimmed = (avatar ?? "").trim();
  return trimmed;
}

function markPresenceChanged() {
  state.presenceRevision += 1;
}

function isLockExpired(lock: ElementLock) {
  return lock.expiresAt <= Date.now();
}

function getElementLock(elementId: string) {
  const lock = state.elementLocks[elementId];
  if (!lock) return null;
  if (isLockExpired(lock)) {
    delete state.elementLocks[elementId];
    return null;
  }
  return lock;
}

function isElementLockedForClient(elementId: string, clientId: string) {
  const lock = getElementLock(elementId);
  if (!lock) return false;
  return lock.clientId !== clientId;
}

function getElementLockInfo(elementId: string) {
  return getElementLock(elementId);
}

function cleanupExpiredLocks() {
  let changed = false;
  const now = Date.now();
  for (const [elementId, lock] of Object.entries(state.elementLocks)) {
    if (lock.expiresAt > now) continue;
    delete state.elementLocks[elementId];
    changed = true;
  }
  if (changed) {
    markPresenceChanged();
  }
}

function bumpElementLock(elementId: string, clientId: string) {
  const lock = getElementLock(elementId);
  if (!lock || lock.clientId !== clientId) return;
  state.elementLocks[elementId] = {
    ...lock,
    expiresAt: Date.now() + LOCK_TTL_MS,
  };
}

function sendOperation(operation: Operation) {
  const candidate: unknown = operation;
  if (!isValidOperation(candidate)) {
    state.collabDebug.invalidCount += 1;
    pushCollabDebugEvent("invalid", operation.type ?? "unknown", operation.clientId ?? state.clientId, null);
    return;
  }
  const safeOperation: Operation = candidate;
  const withSeq: Operation = {
    ...safeOperation,
    seq: safeOperation.seq ?? ++localSequence,
    schemaVersion: OP_SCHEMA_VERSION,
    opVersion: OP_VERSION,
  };
  // BroadcastChannel requires structured-clonable payloads.
  const payload = clonePlain(withSeq);
  state.collabDebug.sentCount += 1;
  state.collabDebug.lastSentType = payload.type;
  if (typeof payload.seq === "number") {
    state.collabDebug.lastSeq = Math.max(state.collabDebug.lastSeq, payload.seq);
  }
  pushCollabDebugEvent("sent", payload.type, payload.clientId, payload.seq ?? null);
  collabAdapter.send(payload);
}

function maybeRequestResyncForGap(operation: Operation) {
  const seq = operation.seq;
  if (typeof seq !== "number" || seq <= 0) return;
  const prev = maxSeqByClient.get(operation.clientId) ?? 0;
  if (seq === prev + 1) {
    maxSeqByClient.set(operation.clientId, seq);
    return;
  }
  if (seq <= prev) return;

  maxSeqByClient.set(operation.clientId, seq);
  state.collabDebug.gapCount += 1;
  pushCollabDebugEvent("gap", operation.type, operation.clientId, seq);
  const now = Date.now();
  if (now - lastResyncRequestAt < RESYNC_DEBOUNCE_MS) return;
  lastResyncRequestAt = now;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.requestState",
      payload: { targetClientId: state.clientId },
    },
    false,
  );
}

function pushCollabDebugEvent(
  direction: "sent" | "recv" | "invalid" | "gap",
  type: string,
  clientId: string,
  seq: number | null,
) {
  state.collabDebug.recentOps = [
    {
      direction,
      type,
      clientId,
      seq,
      at: Date.now(),
    },
    ...state.collabDebug.recentOps,
  ].slice(0, 10);
}

function clearCollabDebugLog() {
  state.collabDebug.recentOps = [];
}

function isOperationStructurallyValid(operation: unknown) {
  return isValidOperation(operation);
}

function ensureRemotePresence(clientId: string) {
  const existing = state.remotePresences[clientId];
  if (existing) return existing;
  const created: RemotePresence = {
    username: getDefaultPresenceUsername(clientId),
    avatar: "",
    color: hashColorFromClientId(clientId),
    cursor: null,
    viewport: null,
    selectedIds: [],
    editingElementId: null,
    online: false,
    lastSeenAt: 0,
  };
  state.remotePresences[clientId] = created;
  return created;
}

function sendPresenceHeartbeat() {
  if (!localPresenceAnnounced) return;
  const heartbeatOperation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.heartbeat",
    payload: {},
  };
  sendOperation(heartbeatOperation);
}

function refreshPresenceTimeouts() {
  const now = Date.now();
  let changed = false;
  for (const [clientId, presence] of Object.entries(state.remotePresences)) {
    if (!presence.online) continue;
    if (now - presence.lastSeenAt <= PRESENCE_TIMEOUT_MS) continue;
    state.remotePresences[clientId] = {
      ...presence,
      online: false,
      cursor: null,
      viewport: null,
      selectedIds: [],
      editingElementId: null,
    };
    if (state.followTargetClientId === clientId) {
      state.followTargetClientId = null;
    }
    changed = true;
  }
  if (changed) {
    markPresenceChanged();
  }
  cleanupExpiredLocks();
}

function startPresenceMonitoring() {
  if (presenceHeartbeatIntervalId === null) {
    presenceHeartbeatIntervalId = window.setInterval(sendPresenceHeartbeat, PRESENCE_HEARTBEAT_MS);
  }
  if (presenceTimeoutIntervalId === null) {
    presenceTimeoutIntervalId = window.setInterval(refreshPresenceTimeouts, 1000);
  }
}

function stopPresenceMonitoring() {
  if (presenceHeartbeatIntervalId !== null) {
    window.clearInterval(presenceHeartbeatIntervalId);
    presenceHeartbeatIntervalId = null;
  }
  if (presenceTimeoutIntervalId !== null) {
    window.clearInterval(presenceTimeoutIntervalId);
    presenceTimeoutIntervalId = null;
  }
}

function dispatchBatch(operations: Operation[], recordHistory = true) {
  if (operations.length === 0) return;
  if (operations.length === 1) {
    dispatchOperation(operations[0] as Operation, recordHistory);
    return;
  }

  if (recordHistory && interactionSnapshot === null) {
    beginInteraction();
    for (const operation of operations) {
      dispatchOperation(operation, false);
    }
    commitInteraction();
    return;
  }

  for (const operation of operations) {
    dispatchOperation(operation, false);
  }
}

function bindCollabAdapter() {
  unsubscribeAdapter?.();
  unsubscribeAdapter = collabAdapter.subscribe((incomingOperation) => {
    const operationUnknown: unknown = incomingOperation;
    if (!isOperationStructurallyValid(operationUnknown)) {
      state.collabDebug.invalidCount += 1;
      pushCollabDebugEvent("invalid", "unknown", "unknown", null);
      return;
    }
    const operation: Operation = operationUnknown;
    state.collabDebug.recvCount += 1;
    state.collabDebug.lastRecvType = operation.type;
    if (typeof operation.seq === "number" && operation.seq > 0) {
      state.collabDebug.lastSeq = Math.max(state.collabDebug.lastSeq, operation.seq);
    }
    pushCollabDebugEvent("recv", operation.type, operation.clientId, operation.seq ?? null);
    maybeRequestResyncForGap(operation);
    applyOperation(operation, { recordHistory: false });
  });
}

function setCollabAdapter(adapter: CollabAdapter) {
  stopPresenceMonitoring();
  if (collabAdapter.dispose) {
    collabAdapter.dispose();
  }
  collabAdapter = adapter;
  bindCollabAdapter();
  state.remotePresences = {};
  state.elementLocks = {};
  state.followTargetClientId = null;
  markPresenceChanged();
  localPresenceAnnounced = false;
  interactionLockIds = [];
  interactionLockToken = null;
  maxSeqByClient.clear();
  lastResyncRequestAt = 0;
  localSequence = 0;
  state.collabDebug = {
    sentCount: 0,
    recvCount: 0,
    gapCount: 0,
    invalidCount: 0,
    lastSentType: "",
    lastRecvType: "",
    lastSeq: 0,
    recentOps: [],
  };
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.requestState",
      payload: { targetClientId: state.clientId },
    },
    false,
  );
}

function getCollabAdapterName() {
  return collabAdapter.name;
}

function setLocalIdentity(username: string, avatar?: string) {
  const nextUsername = normalizeIdentityUsername(username);
  const nextAvatar = normalizeIdentityAvatar(avatar);
  const nextColor = hashColorFromClientId(state.clientId);
  state.localIdentity = {
    username: nextUsername,
    avatar: nextAvatar,
    color: nextColor,
  };
  markPresenceChanged();
  if (localPresenceAnnounced) {
    const updateIdentityOperation: Operation = {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "presence.join",
      payload: {
        username: state.localIdentity.username,
        avatar: state.localIdentity.avatar || undefined,
        color: state.localIdentity.color,
      },
    };
    sendOperation(updateIdentityOperation);
  }
}

function announcePresenceJoin() {
  localPresenceAnnounced = true;
  startPresenceMonitoring();
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.join",
    payload: {
      username: state.localIdentity.username,
      avatar: state.localIdentity.avatar || undefined,
      color: state.localIdentity.color,
    },
  };
  sendOperation(operation);
  sendPresenceHeartbeat();
  publishPresenceView();
  updatePresenceSelection(state.selectedIds);
  updatePresenceEditing(null);
}

function announcePresenceLeave() {
  if (!localPresenceAnnounced) return;
  const ownedLocks = Object.entries(state.elementLocks)
    .filter(([, lock]) => lock.clientId === state.clientId)
    .map(([id]) => id);
  if (ownedLocks.length > 0) {
    releaseElementLocks(ownedLocks);
  }
  localPresenceAnnounced = false;
  stopPresenceMonitoring();
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.leave",
    payload: {},
  };
  sendOperation(operation);
  state.remotePresences = {};
  markPresenceChanged();
}

function updatePresenceCursor(x: number, y: number, visible = true) {
  if (!localPresenceAnnounced) return;
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.cursor",
    payload: { x, y, visible },
  };
  sendOperation(operation);
}

function publishPresenceView() {
  if (!localPresenceAnnounced) return;
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.view",
    payload: {
      viewport: { ...state.viewport },
    },
  };
  sendOperation(operation);
}

function stopFollowingUser() {
  if (!state.followTargetClientId) return;
  state.followTargetClientId = null;
  markPresenceChanged();
}

function startFollowingUser(targetClientId: string) {
  if (!targetClientId || targetClientId === state.clientId) return;
  const remote = ensureRemotePresence(targetClientId);
  state.followTargetClientId = targetClientId;
  if (remote?.viewport) {
    state.viewport = { ...remote.viewport };
    markDocumentChanged();
  }
  markPresenceChanged();
}

function forceFollowersToMe() {
  if (!localPresenceAnnounced) return;
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.follow.force",
    payload: {
      leaderClientId: state.clientId,
    },
  };
  sendOperation(operation);
}

function updatePresenceSelection(selectedIds: string[]) {
  if (!localPresenceAnnounced) return;
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.selection",
    payload: { selectedIds: [...new Set(selectedIds)] },
  };
  sendOperation(operation);
}

function updatePresenceEditing(elementId: string | null) {
  if (!localPresenceAnnounced) return;
  const operation: Operation = {
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "presence.editing",
    payload: { elementId },
  };
  sendOperation(operation);
}

function acquireElementLocks(ids: string[], ttlMs = LOCK_TTL_MS) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { lockId: null as string | null, acquiredIds: [] as string[] };
  const lockId = crypto.randomUUID();
  const acquiredIds: string[] = [];
  for (const id of unique) {
    if (isElementLockedForClient(id, state.clientId)) continue;
    dispatchOperation(
      {
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.lock.acquire",
        payload: { id, lockId, ttlMs },
      },
      false,
    );
    const lock = getElementLock(id);
    if (lock?.clientId === state.clientId && lock.lockId === lockId) {
      acquiredIds.push(id);
    }
  }
  if (acquiredIds.length === 0) {
    return { lockId: null as string | null, acquiredIds };
  }
  return { lockId, acquiredIds };
}

function releaseElementLocks(ids: string[], lockId?: string) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.lock.release",
      payload: { ids: unique, lockId },
    },
    false,
  );
}

function ensureVoteParticipant(participantId: string) {
  const existing = state.voteParticipants[participantId];
  if (existing) return existing;
  const counts: Record<string, number> = {};
  for (const elementId of state.voteElementIds) {
    counts[elementId] = 0;
  }
  const created = {
    remaining: state.voteVotesPerParticipant,
    counts,
  };
  state.voteParticipants[participantId] = created;
  return created;
}

function applyOperation(operation: Operation, options?: { recordHistory?: boolean }) {
  if (appliedOperationIds.has(operation.opId)) return false;
  appliedOperationIds.add(operation.opId);
  const recordHistory = options?.recordHistory ?? true;

  if (operation.type === "presence.join") {
    if (operation.clientId === state.clientId) return false;
    const now = Date.now();
    const known = state.remotePresences[operation.clientId];
    state.remotePresences[operation.clientId] = {
      username: normalizeIdentityUsername(operation.payload.username || getDefaultPresenceUsername(operation.clientId)),
      avatar: normalizeIdentityAvatar(operation.payload.avatar),
      color: operation.payload.color || hashColorFromClientId(operation.clientId),
      cursor: known?.cursor ?? null,
      viewport: known?.viewport ?? null,
      selectedIds: known?.selectedIds ?? [],
      editingElementId: known?.editingElementId ?? null,
      online: true,
      lastSeenAt: now,
    };
    markPresenceChanged();
    if (!known && localPresenceAnnounced) {
      const responseOperation: Operation = {
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "presence.join",
        payload: {
          username: state.localIdentity.username,
          avatar: state.localIdentity.avatar || undefined,
          color: state.localIdentity.color,
        },
      };
      sendOperation(responseOperation);
    }
    return false;
  }

  if (operation.type === "presence.leave") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      online: false,
      cursor: null,
      viewport: null,
      selectedIds: [],
      editingElementId: null,
      lastSeenAt: Date.now(),
    };
    if (state.followTargetClientId === operation.clientId) {
      state.followTargetClientId = null;
    }
    markPresenceChanged();
    return false;
  }

  if (operation.type === "presence.cursor") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      cursor: operation.payload.visible ? { x: operation.payload.x, y: operation.payload.y } : null,
      online: true,
      lastSeenAt: Date.now(),
    };
    markPresenceChanged();
    return false;
  }

  if (operation.type === "presence.view") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      viewport: {
        x: operation.payload.viewport.x,
        y: operation.payload.viewport.y,
        zoom: operation.payload.viewport.zoom,
      },
      online: true,
      lastSeenAt: Date.now(),
    };
    if (state.followTargetClientId === operation.clientId) {
      state.viewport = {
        x: operation.payload.viewport.x,
        y: operation.payload.viewport.y,
        zoom: operation.payload.viewport.zoom,
      };
      markDocumentChanged();
    }
    markPresenceChanged();
    return false;
  }

  if (operation.type === "presence.follow.force") {
    const leaderClientId = operation.payload.leaderClientId;
    if (!leaderClientId || leaderClientId === state.clientId) return false;
    startFollowingUser(leaderClientId);
    return false;
  }

  if (operation.type === "presence.selection") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      selectedIds: [...new Set(operation.payload.selectedIds)],
      online: true,
      lastSeenAt: Date.now(),
    };
    markPresenceChanged();
    return false;
  }

  if (operation.type === "presence.editing") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      editingElementId: operation.payload.elementId,
      online: true,
      lastSeenAt: Date.now(),
    };
    markPresenceChanged();
    return false;
  }

  if (operation.type === "presence.heartbeat") {
    if (operation.clientId === state.clientId) return false;
    const existing = ensureRemotePresence(operation.clientId);
    state.remotePresences[operation.clientId] = {
      ...existing,
      online: true,
      lastSeenAt: Date.now(),
    };
    markPresenceChanged();
    return false;
  }

  if (operation.type === "element.lock.acquire") {
    const { id, lockId, ttlMs } = operation.payload;
    const element = state.elements.find((item) => item.id === id);
    if (!element) return false;
    const existing = getElementLock(id);
    if (existing && existing.clientId !== operation.clientId) return false;
    state.elementLocks[id] = {
      lockId,
      clientId: operation.clientId,
      username:
        operation.clientId === state.clientId
          ? state.localIdentity.username
          : (state.remotePresences[operation.clientId]?.username ?? getDefaultPresenceUsername(operation.clientId)),
      expiresAt: Date.now() + Math.max(2000, Math.min(60000, ttlMs)),
    };
    markPresenceChanged();
    return false;
  }

  if (operation.type === "element.lock.release") {
    let changed = false;
    for (const id of operation.payload.ids) {
      const lock = getElementLock(id);
      if (!lock) continue;
      if (lock.clientId !== operation.clientId) continue;
      if (operation.payload.lockId && lock.lockId !== operation.payload.lockId) continue;
      delete state.elementLocks[id];
      changed = true;
    }
    if (changed) {
      markPresenceChanged();
    }
    return false;
  }

  if (operation.type === "document.requestState") {
    const requesterId = operation.payload.targetClientId;
    if (!requesterId || requesterId === state.clientId) return false;
    if (state.elements.length === 0) return false;

    sendOperation({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.replace",
      payload: {
        targetClientId: requesterId,
        documentState: createDocumentState(),
      },
    });
    return false;
  }

  if (operation.type === "document.replace") {
    const targetClientId = operation.payload.targetClientId;
    if (targetClientId && targetClientId !== state.clientId) return false;

    if (recordHistory) {
      recordSnapshot();
    }
    applyDocumentState(operation.payload.documentState);
    history.undoStack = [];
    history.redoStack = [];
    opHistory.undoStack = [];
    opHistory.redoStack = [];
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "document.patchView") {
    const { viewport, gridSize, showGrid, snapToGrid } = operation.payload;
    if (viewport) {
      state.viewport = {
        x: viewport.x,
        y: viewport.y,
        zoom: Math.min(4, Math.max(0.2, Math.round(viewport.zoom * 100) / 100)),
      };
    }
    if (typeof gridSize === "number") {
      state.gridSize = Math.max(4, Math.min(200, Math.round(gridSize / 4) * 4));
    }
    if (typeof showGrid === "boolean") {
      state.showGrid = showGrid;
      if (!state.showGrid) {
        state.snapToGrid = false;
      }
    }
    if (typeof snapToGrid === "boolean" && state.showGrid) {
      state.snapToGrid = snapToGrid;
    }
    markDocumentChanged();
    return true;
  }

  if (operation.type === "element.patchData") {
    const { id, patch } = operation.payload;
    const element = state.elements.find((el) => el.id === id);
    if (!element) return false;
    if (
      (typeof patch.envelopeType !== "undefined" ||
        typeof patch.titleOffsetX !== "undefined" ||
        typeof patch.titleOffsetY !== "undefined" ||
        typeof patch.memberIds !== "undefined") &&
      element.type !== "envelope"
    ) {
      return false;
    }
    if (isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    if (typeof patch.locked === "boolean") {
      element.locked = patch.locked;
    }
    if (element.type === "envelope") {
      if (typeof patch.envelopeType === "string") {
        element.envelopeType = patch.envelopeType;
      }
      if (typeof patch.titleOffsetX === "number") {
        element.titleOffsetX = patch.titleOffsetX;
      }
      if (typeof patch.titleOffsetY === "number") {
        element.titleOffsetY = patch.titleOffsetY;
      }
      if (Array.isArray(patch.memberIds)) {
        element.memberIds = [...new Set(patch.memberIds)];
      }
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "element.add") {
    const incoming = operation.payload.element;
    if (state.elements.some((element) => element.id === incoming.id)) return false;

    if (recordHistory) {
      recordSnapshot();
    }
    state.elements.push(cloneElement(incoming));
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "element.resize") {
    const { id, width, height, nextX, nextY, nextFontSize } = operation.payload;
    const element = state.elements.find((el) => el.id === id);
    if (!element || element.locked || isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }

    element.width = width;
    element.height = height;
    if (typeof nextX === "number") {
      element.x = nextX;
    }
    if (typeof nextY === "number") {
      element.y = nextY;
    }
    if (element.type === "text" && typeof nextFontSize === "number") {
      element.fontSize = nextFontSize;
    }
    if (element.type === "line") {
      element.x2 = element.x + width;
      element.y2 = element.y + height;
      element.startAnchor = null;
      element.endAnchor = null;
    } else {
      syncAnchoredLinesForElement(element.id);
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "element.move") {
    const { id, x, y } = operation.payload;
    const element = state.elements.find((el) => el.id === id);
    if (!element || element.locked || isElementLockedForClient(id, operation.clientId)) return false;

    if (recordHistory) {
      recordSnapshot();
    }

    if (element.type === "line") {
      const dx = x - element.x;
      const dy = y - element.y;
      element.x2 += dx;
      element.y2 += dy;
      element.startAnchor = null;
      element.endAnchor = null;
    }

    element.x = x;
    element.y = y;
    if (element.type !== "line") {
      syncAnchoredLinesForElement(element.id);
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "element.patchStyle") {
    const { id, patch } = operation.payload;
    const element = state.elements.find((el) => el.id === id);
    if (!element || element.locked || element.type === "line" || isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    if (typeof patch.fill === "string") element.fill = patch.fill;
    if (typeof patch.stroke === "string") element.stroke = patch.stroke;
    if (typeof patch.strokeStyle === "string") element.strokeStyle = patch.strokeStyle;
    if (typeof patch.shadowType === "string") element.shadowType = patch.shadowType;
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "line.patchStyle") {
    const { id, patch } = operation.payload;
    const line = state.elements.find(
      (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
    );
    if (!line || line.locked || isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    if (typeof patch.stroke === "string") line.stroke = patch.stroke;
    if (typeof patch.lineStyle === "string") line.lineStyle = patch.lineStyle;
    if (typeof patch.lineRoute === "string") line.lineRoute = patch.lineRoute;
    if (typeof patch.lineArrow === "string") line.lineArrow = patch.lineArrow;
    if (typeof patch.lineArrowStyle === "string") line.lineArrowStyle = patch.lineArrowStyle;
    if (typeof patch.label === "string") line.label = patch.label;
    if (typeof patch.labelColor === "string") line.labelColor = patch.labelColor;
    if (typeof patch.labelBg === "string") line.labelBg = patch.labelBg;
    if (typeof patch.labelSize === "number") line.labelSize = Math.max(10, Math.min(32, Math.round(patch.labelSize)));
    if (typeof patch.strokeWidth === "number") {
      line.strokeWidth = Math.max(1, Math.min(24, patch.strokeWidth));
    }
    if (typeof patch.lineRoute === "string") {
      optimizeLineAnchors(line.id);
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "line.setGeometry") {
    const { id, x, y, x2, y2, startAnchor, endAnchor } = operation.payload;
    const line = state.elements.find(
      (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
    );
    if (!line || line.locked || isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    line.x = x;
    line.y = y;
    line.x2 = x2;
    line.y2 = y2;
    if (typeof startAnchor !== "undefined") {
      line.startAnchor = startAnchor ?? null;
    }
    if (typeof endAnchor !== "undefined") {
      line.endAnchor = endAnchor ?? null;
    }
    if (line.startAnchor) {
      const startTarget = state.elements.find((item) => item.id === line.startAnchor?.elementId);
      if (startTarget) {
        const p = getAnchorPointForElement(startTarget, line.startAnchor.position);
        line.x = p.x;
        line.y = p.y;
      }
    }
    if (line.endAnchor) {
      const endTarget = state.elements.find((item) => item.id === line.endAnchor?.elementId);
      if (endTarget) {
        const p = getAnchorPointForElement(endTarget, line.endAnchor.position);
        line.x2 = p.x;
        line.y2 = p.y;
      }
    }
    optimizeLineAnchors(line.id);
    line.width = Math.max(1, Math.abs(line.x2 - line.x));
    line.height = Math.max(1, Math.abs(line.y2 - line.y));
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "element.updateText") {
    const { id, text } = operation.payload;
    const element = state.elements.find(
      (el): el is Extract<CanvasElement, { type: "text" | "note" | "envelope" }> =>
        el.id === id && (el.type === "text" || el.type === "note" || el.type === "envelope"),
    );
    if (!element || element.locked || isElementLockedForClient(id, operation.clientId)) return false;

    if (recordHistory) {
      recordSnapshot();
    }

    element.text = text;
    if (element.type === "text") {
      const fontSize = element.fontSize ?? DEFAULT_TEXT_SIZE;
      const minWidth = Math.max(120, text.length * fontSize * 0.55);
      element.width = Math.max(element.width, minWidth);
      element.height = Math.max(32, fontSize * 1.5);
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "text.patchStyle") {
    const { id, patch } = operation.payload;
    const element = state.elements.find(
      (el): el is Extract<CanvasElement, { type: "text" | "note" | "envelope" }> =>
        el.id === id && (el.type === "text" || el.type === "note" || el.type === "envelope"),
    );
    if (!element || element.locked || isElementLockedForClient(id, operation.clientId)) return false;
    if (recordHistory) {
      recordSnapshot();
    }

    if (typeof patch.fontFamily === "string") element.fontFamily = patch.fontFamily;
    if (typeof patch.textAlign === "string") element.textAlign = patch.textAlign;
    if (typeof patch.textVerticalAlign === "string") element.textVerticalAlign = patch.textVerticalAlign;
    if (typeof patch.bold === "boolean") element.bold = patch.bold;
    if (typeof patch.italic === "boolean") element.italic = patch.italic;
    if (typeof patch.underline === "boolean") element.underline = patch.underline;
    if (typeof patch.fontSize === "number") {
      const nextSize = Math.max(8, Math.min(96, patch.fontSize));
      element.fontSize = nextSize;
      if (element.type === "text") {
        element.height = Math.max(32, nextSize * 1.5);
      }
    }
    if (typeof patch.lineHeight === "number") element.lineHeight = Math.max(1, Math.min(2.4, patch.lineHeight));
    if (typeof patch.letterSpacing === "number") element.letterSpacing = Math.max(0, Math.min(12, patch.letterSpacing));
    if (typeof patch.textTransform === "string") element.textTransform = patch.textTransform;
    if ((element.type === "note" || element.type === "envelope") && typeof patch.textColor === "string") {
      element.textColor = patch.textColor;
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    bumpElementLock(id, operation.clientId);
    return true;
  }

  if (operation.type === "timer.start") {
    const { durationSec, soundEnabled, startAtMs } = operation.payload;
    const normalized = Math.max(1, Math.min(24 * 60 * 60, Math.floor(durationSec)));
    clearTimerInterval();
    state.timerRunning = true;
    const hasSource = Boolean(state.timerSoundMp3 || state.timerSoundOgg);
    state.timerSoundEnabled = hasSource && soundEnabled;
    timerEndAt = startAtMs + normalized * 1000;
    state.timerRemainingSec = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));

    timerIntervalId = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
      state.timerRemainingSec = remaining;
      if (remaining > 0) return;
      clearTimerInterval();
      state.timerRunning = false;
      if (state.timerSoundEnabled) {
        playTimerEndBeep();
      }
    }, 150);
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "timer.stop") {
    clearTimerInterval();
    state.timerRunning = false;
    state.timerRemainingSec = 0;
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "vote.start") {
    const ids = operation.payload.elementIds
      .filter((id) => {
        const element = state.elements.find((item) => item.id === id);
        return !!element && (element.type === "note" || element.type === "image");
      });
    if (!ids.length) return false;
    const totalVotes = Math.max(1, Math.floor(operation.payload.votesPerParticipant || 1));
    const maxPerObject = Math.max(1, Math.floor(operation.payload.votesMaxPerObject || 1));
    const counts: Record<string, number> = {};
    for (const id of ids) {
      counts[id] = 0;
    }
    state.voteActive = true;
    state.voteElementIds = ids;
    state.voteCounts = counts;
    state.voteParticipants = {};
    state.voteVotesPerParticipant = totalVotes;
    state.voteMaxPerObject = maxPerObject;
    state.voteResultsVisible = false;
    state.voteResults = [];
    const local = ensureVoteParticipant(state.clientId);
    state.voteRemaining = local.remaining;
    return true;
  }

  if (operation.type === "vote.increment") {
    const { elementId } = operation.payload;
    if (!state.voteActive || !state.voteElementIds.includes(elementId)) return false;
    const participant = ensureVoteParticipant(operation.clientId);
    const current = participant.counts[elementId] ?? 0;
    if (participant.remaining <= 0 || current >= state.voteMaxPerObject) return false;
    participant.counts[elementId] = current + 1;
    participant.remaining = Math.max(0, participant.remaining - 1);
    state.voteCounts[elementId] = (state.voteCounts[elementId] ?? 0) + 1;
    if (operation.clientId === state.clientId) {
      state.voteRemaining = participant.remaining;
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "vote.decrement") {
    const { elementId } = operation.payload;
    if (!state.voteActive || !state.voteElementIds.includes(elementId)) return false;
    const participant = ensureVoteParticipant(operation.clientId);
    const current = participant.counts[elementId] ?? 0;
    if (current <= 0) return false;
    participant.counts[elementId] = current - 1;
    participant.remaining = Math.min(state.voteVotesPerParticipant, participant.remaining + 1);
    state.voteCounts[elementId] = Math.max(0, (state.voteCounts[elementId] ?? 0) - 1);
    if (operation.clientId === state.clientId) {
      state.voteRemaining = participant.remaining;
    }
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "vote.close") {
    if (!state.voteActive) return false;
    const results = state.voteElementIds.map((elementId) => ({
      elementId,
      votes: state.voteCounts[elementId] ?? 0,
    }));
    results.sort((a, b) => b.votes - a.votes);

    state.voteActive = false;
    state.voteResults = results;
    state.voteResultsVisible = true;
    state.voteElementIds = [];
    state.voteCounts = {};
    state.voteParticipants = {};
    state.voteRemaining = 0;
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (operation.type === "elements.delete") {
    const ids = operation.payload.ids.filter((id) => !isElementLockedForClient(id, operation.clientId));
    if (!ids.length) return false;
    const idSet = new Set(ids);
    const next = state.elements.filter((el) => !idSet.has(el.id));
    if (next.length === state.elements.length) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    state.elements = next.map((element) => {
      if (element.type !== "envelope") return element;
      return {
        ...element,
        memberIds: element.memberIds.filter((id) => !idSet.has(id)),
      };
    });
    removeLineAnchorsToDeleted(idSet);
    state.selectedIds = state.selectedIds.filter((id) => !idSet.has(id));
    updatePresenceSelection(state.selectedIds);
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  if (
    operation.type === "zorder.toFront" ||
    operation.type === "zorder.toBack" ||
    operation.type === "zorder.forward" ||
    operation.type === "zorder.backward"
  ) {
    const ids = operation.payload.ids.filter((id) => !isElementLockedForClient(id, operation.clientId));
    if (!ids.length || state.elements.length < 2) return false;
    const idSet = new Set(ids);
    let next = [...state.elements];
    let changed = false;

    if (operation.type === "zorder.toFront") {
      const unselected = next.filter((element) => !idSet.has(element.id));
      const selected = next.filter((element) => idSet.has(element.id));
      next = [...unselected, ...selected];
      changed = next.some((element, index) => element.id !== state.elements[index]?.id);
    } else if (operation.type === "zorder.toBack") {
      const selected = next.filter((element) => idSet.has(element.id));
      const unselected = next.filter((element) => !idSet.has(element.id));
      next = [...selected, ...unselected];
      changed = next.some((element, index) => element.id !== state.elements[index]?.id);
    } else if (operation.type === "zorder.forward") {
      for (let i = next.length - 2; i >= 0; i -= 1) {
        const current = next[i];
        const after = next[i + 1];
        if (!current || !after) continue;
        if (!idSet.has(current.id) || idSet.has(after.id)) continue;
        next[i] = after;
        next[i + 1] = current;
        changed = true;
      }
    } else {
      for (let i = 1; i < next.length; i += 1) {
        const before = next[i - 1];
        const current = next[i];
        if (!before || !current) continue;
        if (!idSet.has(current.id) || idSet.has(before.id)) continue;
        next[i - 1] = current;
        next[i] = before;
        changed = true;
      }
    }

    if (!changed) return false;
    if (recordHistory) {
      recordSnapshot();
    }
    state.elements = next;
    if (!recordHistory) {
      markDocumentChanged();
    }
    return true;
  }

  return false;
}

function dispatchOperation(operation: Operation, recordHistory = true) {
  const trackHistory = !isReplayingHistory && shouldTrackOperationForUndo(operation);
  const trackInInteraction = trackHistory && interactionSnapshot !== null;
  const trackImmediately = trackHistory && !trackInInteraction && recordHistory;
  const inverseOps = trackHistory ? buildInverseOperations(operation) : [];

  const applied = applyOperation(operation, { recordHistory });
  if (applied || operation.type === "document.requestState") {
    sendOperation(operation);
  }
  if (applied && trackInInteraction && inverseOps.length > 0) {
    const key = getTrackKey(operation) ?? `${operation.type}:${operation.opId}`;
    if (!interactionUndoMap.has(key)) {
      interactionUndoMap.set(key, inverseOps[0] as Operation);
    }
    const redoOp = makeHistoryOperation(operation.type, operation.payload);
    interactionRedoMap.set(key, redoOp);
    history.undoStack = [];
    history.redoStack = [];
  } else if (applied && trackImmediately && inverseOps.length > 0) {
    const redoOp = makeHistoryOperation(operation.type, operation.payload);
    pushOperationTransaction({
      undoOps: inverseOps,
      redoOps: [redoOp],
    });
    history.undoStack = [];
    history.redoStack = [];
  }
  return applied;
}

bindCollabAdapter();

function markDocumentChanged() {
  state.revision += 1;
}

function createDocumentState(): CanvasDocumentState {
  return {
    elements: state.elements.map(cloneElement),
    viewport: { ...state.viewport },
    gridSize: state.gridSize,
    showGrid: state.showGrid,
    snapToGrid: state.snapToGrid,
  };
}

function broadcastDocumentStateForce() {
  if (collabAdapter.name === "local-loopback") return;
  sendOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "document.replace",
    payload: {
      force: true,
      documentState: createDocumentState(),
    },
  });
}

function applyDocumentState(documentState: CanvasDocumentState) {
  state.elements = documentState.elements.map(cloneElement);
  state.viewport = { ...documentState.viewport };
  state.gridSize = Math.max(4, Math.round((documentState.gridSize ?? 24) / 4) * 4);
  state.showGrid = documentState.showGrid;
  state.snapToGrid = documentState.snapToGrid && documentState.showGrid;
  state.selectedIds = [];
  updatePresenceSelection(state.selectedIds);
}

const selectedElements = computed(() => {
  const idSet = new Set(state.selectedIds);
  return state.elements.filter((el) => idSet.has(el.id));
});

const selectedElement = computed(() => {
  if (state.selectedIds.length !== 1) return null;
  return state.elements.find((el) => el.id === state.selectedIds[0]) ?? null;
});

const canUndo = computed(() => opHistory.undoStack.length > 0);
const canRedo = computed(() => opHistory.redoStack.length > 0);

function setTool(tool: Tool) {
  state.tool = tool;
}

function clearSelection() {
  state.selectedIds = [];
  updatePresenceSelection(state.selectedIds);
}

function setSelected(id: string | null) {
  state.selectedIds = id ? [id] : [];
  updatePresenceSelection(state.selectedIds);
}

function setSelectedMany(ids: string[]) {
  state.selectedIds = Array.from(new Set(ids));
  updatePresenceSelection(state.selectedIds);
}

function addSelected(id: string) {
  if (state.selectedIds.includes(id)) return;
  state.selectedIds = [...state.selectedIds, id];
  updatePresenceSelection(state.selectedIds);
}

function toggleSelected(id: string) {
  if (state.selectedIds.includes(id)) {
    state.selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
    updatePresenceSelection(state.selectedIds);
    return;
  }

  state.selectedIds = [...state.selectedIds, id];
  updatePresenceSelection(state.selectedIds);
}

function isSelected(id: string) {
  return state.selectedIds.includes(id);
}

function addRectangle(x: number, y: number, width: number, height: number) {
  const element = createCanvasElement("rectangle", {
    x,
    y,
    overrides: { width, height },
  });
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "element.add",
    payload: { element: cloneElement(element) },
  });
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function addText(x: number, y: number, text = "Nouvelle note") {
  const element = createCanvasElement("text", {
    x,
    y,
    overrides: { text },
  });
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "element.add",
    payload: { element: cloneElement(element) },
  });
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function addNote(x: number, y: number, text = "Nouvelle note carree") {
  const element = createCanvasElement("note", {
    x,
    y,
    overrides: { text },
  });
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "element.add",
    payload: { element: cloneElement(element) },
  });
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function addLine(
  x: number,
  y: number,
  x2: number,
  y2: number,
  lineStyle: LineStyle = "solid",
  recordHistory = true,
) {
  const element = createCanvasElement("line", {
    x,
    y,
    overrides: { x2, y2, lineStyle },
  });
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.add",
      payload: { element: cloneElement(element) },
    },
    recordHistory,
  );
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function addImage(x: number, y: number, src: string, width: number, height: number, recordHistory = true) {
  const element = createCanvasElement("image", {
    x,
    y,
    overrides: { src, width, height, stroke: "transparent" },
  });
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.add",
      payload: { element: cloneElement(element) },
    },
    recordHistory,
  );
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function addEnvelope(
  memberIds: string[],
  envelopeType: EnvelopeType = "convex",
  recordHistory = true,
) {
  const uniqueMembers = Array.from(
    new Set(
      memberIds.filter((id) => {
        const element = state.elements.find((item) => item.id === id);
        return !!element && !element.locked && element.type !== "envelope";
      }),
    ),
  );
  if (uniqueMembers.length === 0) return;

  const firstMember = state.elements.find((el) => el.id === uniqueMembers[0]);
  const element = createCanvasElement("envelope", {
    x: firstMember?.x ?? 0,
    y: firstMember?.y ?? 0,
    overrides: {
      memberIds: uniqueMembers,
      envelopeType,
    },
  });

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.add",
      payload: { element: cloneElement(element) },
    },
    recordHistory,
  );
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function createElement(type: ElementType, x: number, y: number) {
  const element =
    type === "rectangle"
      ? createCanvasElement("rectangle", { x, y })
      : type === "text"
        ? createCanvasElement("text", { x, y })
        : type === "note"
          ? createCanvasElement("note", { x, y })
          : type === "line"
            ? createCanvasElement("line", { x, y })
            : type === "image"
            ? createCanvasElement("image", { x, y })
            : createCanvasElement("envelope", { x, y });
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "element.add",
    payload: { element: cloneElement(element) },
  });
  state.selectedIds = [element.id];
  updatePresenceSelection(state.selectedIds);
}

function getAnchorPointForElement(element: CanvasElement, position: AnchorPosition) {
  const left = element.x;
  const top = element.y;
  const right = element.x + element.width;
  const bottom = element.y + element.height;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;

  if (position === "top") return { x: centerX, y: top };
  if (position === "topRight") return { x: right, y: top };
  if (position === "right") return { x: right, y: centerY };
  if (position === "bottomRight") return { x: right, y: bottom };
  if (position === "bottom") return { x: centerX, y: bottom };
  if (position === "bottomLeft") return { x: left, y: bottom };
  if (position === "left") return { x: left, y: centerY };
  return { x: left, y: top };
}

function getAnchorDirection(position: AnchorPosition) {
  if (position === "top") return { x: 0, y: -1 };
  if (position === "topRight") return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
  if (position === "right") return { x: 1, y: 0 };
  if (position === "bottomRight") return { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  if (position === "bottom") return { x: 0, y: 1 };
  if (position === "bottomLeft") return { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
  if (position === "left") return { x: -1, y: 0 };
  return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
}

function shouldFlipAnchorToOpposite(
  anchorElement: CanvasElement,
  currentPosition: AnchorPosition,
  otherPoint: { x: number; y: number },
) {
  const anchorPoint = getAnchorPointForElement(anchorElement, currentPosition);
  const dx = otherPoint.x - anchorPoint.x;
  const dy = otherPoint.y - anchorPoint.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 42) return false;

  const outward = getAnchorDirection(currentPosition);
  const ux = dx / distance;
  const uy = dy / distance;
  const dot = outward.x * ux + outward.y * uy;
  if (dot > -0.88) return false;

  const centerX = anchorElement.x + anchorElement.width / 2;
  const centerY = anchorElement.y + anchorElement.height / 2;
  const marginX = Math.max(16, anchorElement.width * 0.22);
  const marginY = Math.max(16, anchorElement.height * 0.22);
  const opposite = OPPOSITE_ANCHOR[currentPosition];
  const oppositeDir = getAnchorDirection(opposite);

  const horizontalGate =
    oppositeDir.x > 0
      ? otherPoint.x > centerX + marginX
      : oppositeDir.x < 0
        ? otherPoint.x < centerX - marginX
        : true;
  const verticalGate =
    oppositeDir.y > 0
      ? otherPoint.y > centerY + marginY
      : oppositeDir.y < 0
        ? otherPoint.y < centerY - marginY
        : true;

  return horizontalGate && verticalGate;
}

function optimizeLineAnchors(lineId: string) {
  const line = state.elements.find(
    (element): element is Extract<CanvasElement, { type: "line" }> =>
      element.id === lineId && element.type === "line",
  );
  if (!line || line.locked) return;
  if (!line.startAnchor && !line.endAnchor) return;

  if (line.startAnchor) {
    const startElement = state.elements.find((element) => element.id === line.startAnchor?.elementId);
    if (startElement) {
      const shouldFlip = shouldFlipAnchorToOpposite(startElement, line.startAnchor.position, {
        x: line.x2,
        y: line.y2,
      });
      if (shouldFlip) {
        const opposite = OPPOSITE_ANCHOR[line.startAnchor.position];
        line.startAnchor = { ...line.startAnchor, position: opposite };
      }
      const startPoint = getAnchorPointForElement(startElement, line.startAnchor.position);
      line.x = startPoint.x;
      line.y = startPoint.y;
    }
  }

  if (line.endAnchor) {
    const endElement = state.elements.find((element) => element.id === line.endAnchor?.elementId);
    if (endElement) {
      const shouldFlip = shouldFlipAnchorToOpposite(endElement, line.endAnchor.position, {
        x: line.x,
        y: line.y,
      });
      if (shouldFlip) {
        const opposite = OPPOSITE_ANCHOR[line.endAnchor.position];
        line.endAnchor = { ...line.endAnchor, position: opposite };
      }
      const endPoint = getAnchorPointForElement(endElement, line.endAnchor.position);
      line.x2 = endPoint.x;
      line.y2 = endPoint.y;
    }
  }

  line.width = Math.max(1, Math.abs(line.x2 - line.x));
  line.height = Math.max(1, Math.abs(line.y2 - line.y));
}

function syncAnchoredLinesForElement(elementId: string) {
  const anchorTarget = state.elements.find((element) => element.id === elementId);
  if (!anchorTarget) return;

  for (const element of state.elements) {
    if (element.type !== "line") continue;

    if (element.startAnchor?.elementId === elementId) {
      const point = getAnchorPointForElement(anchorTarget, element.startAnchor.position);
      element.x = point.x;
      element.y = point.y;
    }
    if (element.endAnchor?.elementId === elementId) {
      const point = getAnchorPointForElement(anchorTarget, element.endAnchor.position);
      element.x2 = point.x;
      element.y2 = point.y;
    }

    optimizeLineAnchors(element.id);
    element.width = Math.max(1, Math.abs(element.x2 - element.x));
    element.height = Math.max(1, Math.abs(element.y2 - element.y));
  }
}

function removeLineAnchorsToDeleted(deletedIds: Set<string>) {
  for (const element of state.elements) {
    if (element.type !== "line") continue;
    if (element.startAnchor && deletedIds.has(element.startAnchor.elementId)) {
      element.startAnchor = null;
    }
    if (element.endAnchor && deletedIds.has(element.endAnchor.elementId)) {
      element.endAnchor = null;
    }
  }
}

function updateSelectedFill(fill: string) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (!idSet.has(element.id) || element.locked || element.type === "line" || element.fill === fill) continue;
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchStyle",
      payload: { id: element.id, patch: { fill } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedStroke(stroke: string) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (!idSet.has(element.id) || element.locked || element.stroke === stroke) continue;
    if (element.type === "line") {
      operations.push({
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "line.patchStyle",
        payload: { id: element.id, patch: { stroke } },
      });
    } else {
      operations.push({
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.patchStyle",
        payload: { id: element.id, patch: { stroke } },
      });
    }
  }
  dispatchBatch(operations);
}

function updateSelectedStrokeStyle(strokeStyle: StrokeStyle) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.locked ||
      element.type === "line" ||
      element.strokeStyle === strokeStyle
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchStyle",
      payload: { id: element.id, patch: { strokeStyle } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTheme(fill: string, stroke: string) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.locked ||
      element.type === "line" ||
      (element.fill === fill && element.stroke === stroke)
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchStyle",
      payload: { id: element.id, patch: { fill, stroke } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedShadowType(shadowType: ShadowType) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (!idSet.has(element.id) || element.locked || element.type === "line" || element.shadowType === shadowType) continue;
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchStyle",
      payload: { id: element.id, patch: { shadowType } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedNoteTextColor(textColor: string) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.locked ||
      (element.type !== "note" && element.type !== "envelope") ||
      element.textColor === textColor
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { textColor } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineStyle(lineStyle: LineStyle) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.lineStyle === lineStyle
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { lineStyle } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineWidth(strokeWidth: number) {
  if (state.selectedIds.length === 0) return;
  const nextWidth = Math.max(1, Math.min(24, strokeWidth));

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.strokeWidth === nextWidth
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { strokeWidth: nextWidth } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineRoute(lineRoute: LineRoute) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.lineRoute === lineRoute
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { lineRoute } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineArrow(lineArrow: LineArrow) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.lineArrow === lineArrow
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { lineArrow } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineArrowStyle(lineArrowStyle: LineArrowStyle) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.lineArrowStyle === lineArrowStyle
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { lineArrowStyle } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineLabel(label: string) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.label === label
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { label } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineLabelColor(labelColor: string) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.labelColor === labelColor
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { labelColor } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineLabelBg(labelBg: string) {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.labelBg === labelBg
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { labelBg } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedLineLabelSize(labelSize: number) {
  if (state.selectedIds.length === 0) return;
  const nextSize = Math.max(10, Math.min(32, Math.round(labelSize)));

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      element.type !== "line" ||
      element.locked ||
      element.labelSize === nextSize
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.patchStyle",
      payload: { id: element.id, patch: { labelSize: nextSize } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextFontFamily(fontFamily: string) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.fontFamily === fontFamily
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { fontFamily } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextAlign(textAlign: TextAlign) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.textAlign === textAlign
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { textAlign } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextVerticalAlign(textVerticalAlign: TextVerticalAlign) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.textVerticalAlign === textVerticalAlign
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { textVerticalAlign } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextBold(bold: boolean) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.bold === bold
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { bold } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextItalic(italic: boolean) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.italic === italic
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { italic } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextUnderline(underline: boolean) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.underline === underline
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { underline } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextFontSize(fontSize: number) {
  if (state.selectedIds.length === 0) return;
  const nextSize = Math.max(8, Math.min(96, fontSize));
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.fontSize === nextSize
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { fontSize: nextSize } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextLineHeight(lineHeight: number) {
  if (state.selectedIds.length === 0) return;
  const next = Math.max(1, Math.min(2.4, lineHeight));
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.lineHeight === next
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { lineHeight: next } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextLetterSpacing(letterSpacing: number) {
  if (state.selectedIds.length === 0) return;
  const next = Math.max(0, Math.min(12, letterSpacing));
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.letterSpacing === next
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { letterSpacing: next } },
    });
  }
  dispatchBatch(operations);
}

function updateSelectedTextTransform(textTransform: TextTransformMode) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (
      !idSet.has(element.id) ||
      (element.type !== "text" && element.type !== "note" && element.type !== "envelope") ||
      element.locked ||
      element.textTransform === textTransform
    ) {
      continue;
    }
    operations.push({
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "text.patchStyle",
      payload: { id: element.id, patch: { textTransform } },
    });
  }
  dispatchBatch(operations);
}

function updateLineEnd(id: string, x2: number, y2: number, recordHistory = true) {
  const element = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
  );
  if (!element || element.locked) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.setGeometry",
      payload: {
        id,
        x: element.x,
        y: element.y,
        x2,
        y2,
        endAnchor: null,
      },
    },
    recordHistory,
  );
}

function updateLineStart(id: string, x: number, y: number, recordHistory = true) {
  const element = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
  );
  if (!element || element.locked) return;

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.setGeometry",
      payload: {
        id,
        x,
        y,
        x2: element.x2,
        y2: element.y2,
        startAnchor: null,
      },
    },
    recordHistory,
  );
}

function updateLineStartAnchor(
  id: string,
  anchor: { elementId: string; position: AnchorPosition } | null,
  recordHistory = true,
) {
  const element = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
  );
  if (!element || element.locked) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.setGeometry",
      payload: {
        id,
        x: element.x,
        y: element.y,
        x2: element.x2,
        y2: element.y2,
        startAnchor: anchor,
      },
    },
    recordHistory,
  );
}

function updateLineEndAnchor(
  id: string,
  anchor: { elementId: string; position: AnchorPosition } | null,
  recordHistory = true,
) {
  const element = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "line" }> => el.id === id && el.type === "line",
  );
  if (!element || element.locked) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "line.setGeometry",
      payload: {
        id,
        x: element.x,
        y: element.y,
        x2: element.x2,
        y2: element.y2,
        endAnchor: anchor,
      },
    },
    recordHistory,
  );
}

function updateElementPosition(id: string, x: number, y: number, recordHistory = true) {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.move",
      payload: { id, x, y },
    },
    recordHistory,
  );
}

function updateElementSize(
  id: string,
  width: number,
  height: number,
  nextX?: number,
  nextY?: number,
  nextFontSize?: number,
  recordHistory = true,
) {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.resize",
      payload: {
        id,
        width,
        height,
        nextX,
        nextY,
        nextFontSize,
      },
    },
    recordHistory,
  );
}

function updateText(id: string, text: string, recordHistory = true) {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.updateText",
      payload: { id, text },
    },
    recordHistory,
  );
}

function updateEnvelopeMembers(envelopeId: string, memberIds: string[], recordHistory = true) {
  const envelope = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "envelope" }> =>
      el.id === envelopeId && el.type === "envelope",
  );
  if (!envelope || envelope.locked) return;

  const filteredMembers = Array.from(
    new Set(
      memberIds.filter((id) => {
        if (id === envelopeId) return false;
        const element = state.elements.find((item) => item.id === id);
        return !!element && !element.locked && element.type !== "envelope";
      }),
    ),
  );

  if (JSON.stringify(filteredMembers) === JSON.stringify(envelope.memberIds)) return;

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchData",
      payload: {
        id: envelopeId,
        patch: { memberIds: filteredMembers },
      },
    },
    recordHistory,
  );
}

function addMembersToEnvelope(envelopeId: string, memberIds: string[], recordHistory = true) {
  const envelope = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "envelope" }> =>
      el.id === envelopeId && el.type === "envelope",
  );
  if (!envelope || envelope.locked) return;

  const next = new Set(envelope.memberIds);
  for (const id of memberIds) {
    if (id === envelopeId) continue;
    const element = state.elements.find((item) => item.id === id);
    if (!element || element.locked || element.type === "envelope") continue;
    next.add(id);
  }
  const nextMembers = Array.from(next);
  if (nextMembers.length === envelope.memberIds.length) return;

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchData",
      payload: {
        id: envelopeId,
        patch: { memberIds: nextMembers },
      },
    },
    recordHistory,
  );
}

function removeMembersFromEnvelope(envelopeId: string, memberIds: string[], recordHistory = true) {
  const envelope = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "envelope" }> =>
      el.id === envelopeId && el.type === "envelope",
  );
  if (!envelope || envelope.locked) return;

  const removeSet = new Set(memberIds);
  const nextMembers = envelope.memberIds.filter((id) => !removeSet.has(id));
  if (nextMembers.length === envelope.memberIds.length) return;

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchData",
      payload: {
        id: envelopeId,
        patch: { memberIds: nextMembers },
      },
    },
    recordHistory,
  );
}

function updateEnvelopeTitleOffset(envelopeId: string, offsetX: number, offsetY: number, recordHistory = true) {
  const envelope = state.elements.find(
    (el): el is Extract<CanvasElement, { type: "envelope" }> =>
      el.id === envelopeId && el.type === "envelope",
  );
  if (!envelope || envelope.locked) return;

  if (envelope.titleOffsetX === offsetX && envelope.titleOffsetY === offsetY) return;

  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "element.patchData",
      payload: {
        id: envelopeId,
        patch: { titleOffsetX: offsetX, titleOffsetY: offsetY },
      },
    },
    recordHistory,
  );
}

function updateSelectedEnvelopeType(envelopeType: EnvelopeType) {
  if (state.selectedIds.length === 0) return;
  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];

  for (const element of state.elements) {
    if (
      idSet.has(element.id) &&
      element.type === "envelope" &&
      !element.locked &&
      element.envelopeType !== envelopeType
    ) {
      operations.push({
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.patchData",
        payload: { id: element.id, patch: { envelopeType } },
      });
    }
  }
  dispatchBatch(operations);
}

function beginInteraction() {
  interactionSnapshot = createSnapshot();
  interactionUndoMap = new Map<string, Operation>();
  interactionRedoMap = new Map<string, Operation>();
  const lockCandidates = state.selectedIds.filter((id) => !isElementLockedForClient(id, state.clientId));
  const acquired = acquireElementLocks(lockCandidates);
  interactionLockToken = acquired.lockId;
  interactionLockIds = acquired.acquiredIds;
}

function commitInteraction() {
  if (!interactionSnapshot) return;

  const currentSnapshot = createSnapshot();
  if (!isSameSnapshot(interactionSnapshot, currentSnapshot)) {
    if (interactionUndoMap.size > 0 && interactionRedoMap.size > 0) {
      pushOperationTransaction({
        undoOps: Array.from(interactionUndoMap.values()).reverse(),
        redoOps: Array.from(interactionRedoMap.values()),
      });
      history.undoStack = [];
      history.redoStack = [];
      markDocumentChanged();
    }
  }

  interactionSnapshot = null;
  interactionUndoMap = new Map<string, Operation>();
  interactionRedoMap = new Map<string, Operation>();
  if (interactionLockIds.length > 0) {
    releaseElementLocks(interactionLockIds, interactionLockToken ?? undefined);
  }
  interactionLockIds = [];
  interactionLockToken = null;
}

function cancelInteraction() {
  if (!interactionSnapshot) return;
  applySnapshot(interactionSnapshot);
  interactionSnapshot = null;
  interactionUndoMap = new Map<string, Operation>();
  interactionRedoMap = new Map<string, Operation>();
  if (interactionLockIds.length > 0) {
    releaseElementLocks(interactionLockIds, interactionLockToken ?? undefined);
  }
  interactionLockIds = [];
  interactionLockToken = null;
}

function setZoom(zoom: number) {
  const snapped = Math.round(zoom / 0.05) * 0.05;
  const normalized = Math.round(snapped * 100) / 100;
  const next = Math.min(4, Math.max(0.2, normalized));
  if (state.viewport.zoom === next) return;
  stopFollowingUser();
  state.viewport.zoom = next;
  markDocumentChanged();
  publishPresenceView();
}

function zoomAt(nextZoom: number, screenX: number, screenY: number) {
  const prevZoom = state.viewport.zoom;
  const snapped = Math.round(nextZoom / 0.05) * 0.05;
  const normalized = Math.round(snapped * 100) / 100;
  const clamped = Math.min(4, Math.max(0.2, normalized));
  if (clamped === prevZoom) return;
  stopFollowingUser();

  const worldX = (screenX - state.viewport.x) / prevZoom;
  const worldY = (screenY - state.viewport.y) / prevZoom;

  state.viewport.zoom = clamped;
  state.viewport.x = screenX - worldX * clamped;
  state.viewport.y = screenY - worldY * clamped;
  markDocumentChanged();
  publishPresenceView();
}

function setViewportPosition(x: number, y: number) {
  if (state.viewport.x === x && state.viewport.y === y) return;
  stopFollowingUser();
  state.viewport.x = x;
  state.viewport.y = y;
  markDocumentChanged();
  publishPresenceView();
}

function resetView() {
  if (state.viewport.x === 0 && state.viewport.y === 0 && state.viewport.zoom === 1) return;
  stopFollowingUser();
  state.viewport.x = 0;
  state.viewport.y = 0;
  state.viewport.zoom = 1;
  markDocumentChanged();
  publishPresenceView();
}

function deleteSelected() {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const ids = state.elements.filter((el) => idSet.has(el.id) && !el.locked).map((el) => el.id);
  if (ids.length === 0) return;

  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "elements.delete",
    payload: { ids },
  });
}

function duplicateSelected(offsetX = 24, offsetY = 24) {
  if (state.selectedIds.length === 0) return;

  const selected = state.elements.filter((el) => state.selectedIds.includes(el.id) && !el.locked);
  if (selected.length === 0) return;
  const idMap = new Map<string, string>();
  for (const element of selected) {
    idMap.set(element.id, crypto.randomUUID());
  }

  const duplicated: CanvasElement[] = selected.map((el) => {
    const nextId = idMap.get(el.id) ?? crypto.randomUUID();
    if (el.type === "line") {
      return {
        ...el,
        id: nextId,
        x: el.x + offsetX,
        y: el.y + offsetY,
        x2: el.x2 + offsetX,
        y2: el.y2 + offsetY,
        startAnchor: el.startAnchor
          ? { ...el.startAnchor, elementId: idMap.get(el.startAnchor.elementId) ?? el.startAnchor.elementId }
          : null,
        endAnchor: el.endAnchor
          ? { ...el.endAnchor, elementId: idMap.get(el.endAnchor.elementId) ?? el.endAnchor.elementId }
          : null,
      };
    }

    if (el.type !== "envelope") {
      return {
        ...el,
        id: nextId,
        x: el.x + offsetX,
        y: el.y + offsetY,
      };
    }
    return {
      ...el,
      id: nextId,
      x: el.x + offsetX,
      y: el.y + offsetY,
      memberIds: el.memberIds.map((id) => idMap.get(id) ?? id),
    };
  });

  beginInteraction();
  for (const element of duplicated) {
    dispatchOperation(
      {
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.add",
        payload: { element: cloneElement(element) },
      },
      false,
    );
  }
  commitInteraction();
  state.selectedIds = duplicated.map((el) => el.id);
  updatePresenceSelection(state.selectedIds);
}

function copySelected() {
  if (state.selectedIds.length === 0) return;
  const selected = state.elements.filter((el) => state.selectedIds.includes(el.id));
  clipboard = selected.map((el) => ({ ...el }));
}

function hasClipboard() {
  return clipboard.length > 0;
}

function pasteAt(worldX: number, worldY: number) {
  if (clipboard.length === 0) return;

  let minX = clipboard[0]?.x ?? 0;
  let minY = clipboard[0]?.y ?? 0;

  for (const el of clipboard) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
  }

  const dx = worldX - minX;
  const dy = worldY - minY;

  const idMap = new Map<string, string>();
  for (const element of clipboard) {
    idMap.set(element.id, crypto.randomUUID());
  }

  const pasted = clipboard.map((el) => {
    const nextId = idMap.get(el.id) ?? crypto.randomUUID();
    if (el.type === "line") {
      return {
        ...el,
        id: nextId,
        x: el.x + dx,
        y: el.y + dy,
        x2: el.x2 + dx,
        y2: el.y2 + dy,
        startAnchor: el.startAnchor
          ? { ...el.startAnchor, elementId: idMap.get(el.startAnchor.elementId) ?? el.startAnchor.elementId }
          : null,
        endAnchor: el.endAnchor
          ? { ...el.endAnchor, elementId: idMap.get(el.endAnchor.elementId) ?? el.endAnchor.elementId }
          : null,
      };
    }

    if (el.type !== "envelope") {
      return {
        ...el,
        id: nextId,
        x: el.x + dx,
        y: el.y + dy,
      };
    }
    return {
      ...el,
      id: nextId,
      x: el.x + dx,
      y: el.y + dy,
      memberIds: el.memberIds.map((id) => idMap.get(id) ?? id),
    };
  });

  beginInteraction();
  for (const element of pasted) {
    dispatchOperation(
      {
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.add",
        payload: { element: cloneElement(element) },
      },
      false,
    );
  }
  commitInteraction();
  state.selectedIds = pasted.map((el) => el.id);
  updatePresenceSelection(state.selectedIds);
}

function bringSelectedToFront() {
  if (state.selectedIds.length === 0) return;

  const ids = state.elements
    .filter((el) => state.selectedIds.includes(el.id) && !el.locked)
    .map((el) => el.id);
  if (ids.length === 0) return;
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "zorder.toFront",
    payload: { ids },
  });
}

function sendSelectedToBack() {
  if (state.selectedIds.length === 0) return;

  const ids = state.elements
    .filter((el) => state.selectedIds.includes(el.id) && !el.locked)
    .map((el) => el.id);
  if (ids.length === 0) return;
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "zorder.toBack",
    payload: { ids },
  });
}

function bringSelectedForward() {
  if (state.selectedIds.length === 0 || state.elements.length < 2) return;

  const ids = state.elements
    .filter((el) => state.selectedIds.includes(el.id) && !el.locked)
    .map((el) => el.id);
  if (ids.length === 0) return;
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "zorder.forward",
    payload: { ids },
  });
}

function sendSelectedBackward() {
  if (state.selectedIds.length === 0 || state.elements.length < 2) return;

  const ids = state.elements
    .filter((el) => state.selectedIds.includes(el.id) && !el.locked)
    .map((el) => el.id);
  if (ids.length === 0) return;
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "zorder.backward",
    payload: { ids },
  });
}

function selectAll() {
  state.selectedIds = state.elements.map((el) => el.id);
  updatePresenceSelection(state.selectedIds);
}

function lockSelected() {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (idSet.has(element.id) && !element.locked) {
      operations.push({
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.patchData",
        payload: { id: element.id, patch: { locked: true } },
      });
    }
  }
  dispatchBatch(operations);
}

function unlockSelected() {
  if (state.selectedIds.length === 0) return;

  const idSet = new Set(state.selectedIds);
  const operations: Operation[] = [];
  for (const element of state.elements) {
    if (idSet.has(element.id) && element.locked) {
      operations.push({
        opId: nextOperationId(),
        clientId: state.clientId,
        type: "element.patchData",
        payload: { id: element.id, patch: { locked: false } },
      });
    }
  }
  dispatchBatch(operations);
}

function toggleGrid() {
  const nextShow = !state.showGrid;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.patchView",
      payload: {
        showGrid: nextShow,
        snapToGrid: nextShow ? state.snapToGrid : false,
      },
    },
    false,
  );
}

function toggleSnapToGrid() {
  if (!state.showGrid) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.patchView",
      payload: {
        snapToGrid: !state.snapToGrid,
      },
    },
    false,
  );
}

function clearTimerInterval() {
  if (timerIntervalId === null) return;
  window.clearInterval(timerIntervalId);
  timerIntervalId = null;
}

function playTimerEndBeep() {
  const audioProbe = document.createElement("audio");
  let source = "";
  if (state.timerSoundOgg && audioProbe.canPlayType("audio/ogg")) {
    source = state.timerSoundOgg;
  } else if (state.timerSoundMp3 && audioProbe.canPlayType("audio/mpeg")) {
    source = state.timerSoundMp3;
  } else if (state.timerSoundOgg) {
    source = state.timerSoundOgg;
  } else if (state.timerSoundMp3) {
    source = state.timerSoundMp3;
  }
  if (!source) return;

  try {
    const audio = new Audio(source);
    audio.currentTime = 0;
    void audio.play();
  } catch {
    // No-op on playback failure.
  }
}

function stopTimer() {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "timer.stop",
      payload: {},
    },
    false,
  );
}

function startTimer(durationSec: number, soundEnabled: boolean) {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "timer.start",
      payload: {
        durationSec,
        soundEnabled,
        startAtMs: Date.now(),
      },
    },
    false,
  );
}

function setTimerSoundSources(timerSoundMp3?: string, timerSoundOgg?: string) {
  state.timerSoundMp3 = timerSoundMp3?.trim() ?? "";
  state.timerSoundOgg = timerSoundOgg?.trim() ?? "";
  if (!state.timerSoundMp3 && !state.timerSoundOgg) {
    state.timerSoundEnabled = false;
  }
}

function getVotableElementIds(source: "selected" | "all") {
  const selectedSet = new Set(state.selectedIds);
  return state.elements
    .filter((element) => {
      if (element.type !== "note" && element.type !== "image") return false;
      if (source === "selected" && !selectedSet.has(element.id)) return false;
      return true;
    })
    .map((element) => element.id);
}

function startVoteSession(
  source: "selected" | "all",
  votesPerParticipant: number,
  votesMaxPerObject: number,
) {
  const rawIds = getVotableElementIds(source);
  const ids = rawIds.length > 0 || source === "all" ? rawIds : getVotableElementIds("all");
  if (ids.length === 0) return { ok: false as const, error: "Aucun objet votable (note/image)." };
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "vote.start",
      payload: {
        elementIds: ids,
        votesPerParticipant,
        votesMaxPerObject,
      },
    },
    false,
  );

  return { ok: true as const };
}

function incrementVote(elementId: string) {
  dispatchOperation({
    opId: nextOperationId(),
    clientId: state.clientId,
    type: "vote.increment",
    payload: { elementId },
  });
}

function decrementVote(elementId: string) {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "vote.decrement",
      payload: { elementId },
    },
    false,
  );
}

function closeVoteSession() {
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "vote.close",
      payload: {},
    },
    false,
  );
}

function hideVoteResults() {
  state.voteResultsVisible = false;
}

function setGridSize(gridSize: number) {
  const normalized = Math.max(4, Math.min(200, Math.round(gridSize / 4) * 4));
  if (state.gridSize === normalized) return;
  dispatchOperation(
    {
      opId: nextOperationId(),
      clientId: state.clientId,
      type: "document.patchView",
      payload: {
        gridSize: normalized,
      },
    },
    false,
  );
}

function increaseGridSize() {
  setGridSize(state.gridSize + 4);
}

function decreaseGridSize() {
  setGridSize(state.gridSize - 4);
}

function undo() {
  const opTx = opHistory.undoStack.pop();
  if (!opTx) return;
  isReplayingHistory = true;
  try {
    for (const op of opTx.undoOps) {
      dispatchOperation(
        {
          ...op,
          opId: nextOperationId(),
          clientId: state.clientId,
          seq: undefined,
        } as Operation,
        false,
      );
    }
  } finally {
    isReplayingHistory = false;
  }
  opHistory.redoStack.push(opTx);
  if (opHistory.redoStack.length > 100) {
    opHistory.redoStack.shift();
  }
  history.undoStack = [];
  history.redoStack = [];
  broadcastDocumentStateForce();
}

function redo() {
  const opTx = opHistory.redoStack.pop();
  if (!opTx) return;
  isReplayingHistory = true;
  try {
    for (const op of opTx.redoOps) {
      dispatchOperation(
        {
          ...op,
          opId: nextOperationId(),
          clientId: state.clientId,
          seq: undefined,
        } as Operation,
        false,
      );
    }
  } finally {
    isReplayingHistory = false;
  }
  opHistory.undoStack.push(opTx);
  if (opHistory.undoStack.length > 100) {
    opHistory.undoStack.shift();
  }
  history.undoStack = [];
  history.redoStack = [];
  broadcastDocumentStateForce();
}

function normalizeElementFromImport(raw: CanvasElement): CanvasElement {
  if (raw.type === "rectangle") {
    return createCanvasElement("rectangle", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
  }
  if (raw.type === "text") {
    return createCanvasElement("text", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
  }
  if (raw.type === "note") {
    return createCanvasElement("note", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
  }
  if (raw.type === "line") {
    return createCanvasElement("line", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
  }
  if (raw.type === "image") {
    return createCanvasElement("image", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
  }
  return createCanvasElement("envelope", { id: raw.id, x: raw.x, y: raw.y, overrides: raw });
}

function exportDocumentJson() {
  const documentPayload: VersionedCanvasDocument = {
    schema: DOCUMENT_SCHEMA,
    version: DOCUMENT_VERSION,
    meta: {
      revision: state.revision,
      clientId: state.clientId,
      exportedAt: new Date().toISOString(),
    },
    state: createDocumentState(),
  };
  return JSON.stringify(documentPayload, null, 2);
}

function importDocumentJson(jsonText: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false as const, error: "Le fichier JSON est invalide." };
  }

  if (!isObject(parsed)) {
    return { ok: false as const, error: "Format de document invalide." };
  }

  if (parsed.schema !== DOCUMENT_SCHEMA) {
    return { ok: false as const, error: "Schéma inconnu. Fichier non compatible." };
  }
  if (parsed.version !== DOCUMENT_VERSION) {
    return {
      ok: false as const,
      error: `Version non supportée (${String(parsed.version)}). Version attendue: ${DOCUMENT_VERSION}.`,
    };
  }
  if (!isObject(parsed.state)) {
    return { ok: false as const, error: "Contenu du document invalide (state manquant)." };
  }

  const rawElements = parsed.state.elements;
  const rawViewport = parsed.state.viewport;
  const rawShowGrid = parsed.state.showGrid;
  const rawSnapToGrid = parsed.state.snapToGrid;
  const rawGridSize = parsed.state.gridSize;

  if (!Array.isArray(rawElements) || !isObject(rawViewport)) {
    return { ok: false as const, error: "Contenu du document invalide (elements/viewport)." };
  }

  const normalizedElements: CanvasElement[] = [];
  for (const item of rawElements) {
    if (!isObject(item)) continue;
    const type = item.type;
    const x = typeof item.x === "number" ? item.x : 0;
    const y = typeof item.y === "number" ? item.y : 0;
    const id = typeof item.id === "string" ? item.id : crypto.randomUUID();
    if (
      type !== "rectangle" &&
      type !== "text" &&
      type !== "note" &&
      type !== "line" &&
      type !== "image" &&
      type !== "envelope"
    ) {
      continue;
    }
    const element = normalizeElementFromImport({ ...(item as CanvasElement), id, x, y });
    normalizedElements.push(element);
  }

  const viewport = {
    x: typeof rawViewport.x === "number" ? rawViewport.x : 0,
    y: typeof rawViewport.y === "number" ? rawViewport.y : 0,
    zoom: typeof rawViewport.zoom === "number" ? rawViewport.zoom : 1,
  };

  applyDocumentState({
    elements: normalizedElements,
    viewport,
    gridSize: typeof rawGridSize === "number" ? rawGridSize : 24,
    showGrid: Boolean(rawShowGrid),
    snapToGrid: Boolean(rawSnapToGrid),
  });
  history.undoStack = [];
  history.redoStack = [];
  opHistory.undoStack = [];
  opHistory.redoStack = [];
  state.revision += 1;

  return { ok: true as const };
}

function getDocumentState() {
  return createDocumentState();
}

function replaceDocumentState(documentState: CanvasDocumentState) {
  applyDocumentState(documentState);
  history.undoStack = [];
  history.redoStack = [];
  opHistory.undoStack = [];
  opHistory.redoStack = [];
  markDocumentChanged();
}

export function useCanvasStore() {
  return {
    state,
    selectedElement,
    selectedElements,
    canUndo,
    canRedo,
    setTool,
    clearSelection,
    setSelected,
    setSelectedMany,
    addSelected,
    toggleSelected,
    isSelected,
    addRectangle,
    addText,
    addNote,
    addLine,
    addImage,
    addEnvelope,
    createElement,
    setLocalIdentity,
    setCollabAdapter,
    getCollabAdapterName,
    announcePresenceJoin,
    announcePresenceLeave,
    updatePresenceCursor,
    updatePresenceSelection,
    updatePresenceEditing,
    startFollowingUser,
    stopFollowingUser,
    forceFollowersToMe,
    getElementLockInfo,
    clearCollabDebugLog,
    dispatchOperation,
    getDocumentState,
    replaceDocumentState,
    exportDocumentJson,
    importDocumentJson,
    updateSelectedFill,
    updateSelectedStroke,
    updateSelectedStrokeStyle,
    updateSelectedTheme,
    updateSelectedShadowType,
    updateSelectedNoteTextColor,
    updateSelectedLineStyle,
    updateSelectedLineWidth,
    updateSelectedLineRoute,
    updateSelectedLineArrow,
    updateSelectedLineArrowStyle,
    updateSelectedLineLabel,
    updateSelectedLineLabelColor,
    updateSelectedLineLabelBg,
    updateSelectedLineLabelSize,
    updateSelectedEnvelopeType,
    updateSelectedTextFontFamily,
    updateSelectedTextAlign,
    updateSelectedTextVerticalAlign,
    updateSelectedTextBold,
    updateSelectedTextItalic,
    updateSelectedTextUnderline,
    updateSelectedTextFontSize,
    updateSelectedTextLineHeight,
    updateSelectedTextLetterSpacing,
    updateSelectedTextTransform,
    updateElementPosition,
    updateElementSize,
    updateLineStart,
    updateLineEnd,
    updateLineStartAnchor,
    updateLineEndAnchor,
    updateText,
    updateEnvelopeMembers,
    addMembersToEnvelope,
    removeMembersFromEnvelope,
    updateEnvelopeTitleOffset,
    beginInteraction,
    commitInteraction,
    cancelInteraction,
    setZoom,
    zoomAt,
    setViewportPosition,
    resetView,
    deleteSelected,
    duplicateSelected,
    copySelected,
    pasteAt,
    bringSelectedToFront,
    bringSelectedForward,
    sendSelectedBackward,
    sendSelectedToBack,
    lockSelected,
    unlockSelected,
    hasClipboard,
    selectAll,
    toggleGrid,
    toggleSnapToGrid,
    startTimer,
    stopTimer,
    setTimerSoundSources,
    startVoteSession,
    closeVoteSession,
    hideVoteResults,
    incrementVote,
    decrementVote,
    setGridSize,
    increaseGridSize,
    decreaseGridSize,
    undo,
    redo,
  };
}



