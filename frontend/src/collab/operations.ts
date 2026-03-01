import type { CanvasElement } from "../domain/elements";

type BaseOperation = {
  opId: string;
  clientId: string;
  seq?: number;
  schemaVersion?: number;
  opVersion?: number;
};

export const OP_SCHEMA_VERSION = 1;
export const OP_VERSION = 1;

type AnchorPayload =
  | {
      elementId: string;
      position: "top" | "topRight" | "right" | "bottomRight" | "bottom" | "bottomLeft" | "left" | "topLeft";
    }
  | null;

type DocumentStatePayload = {
  elements: CanvasElement[];
  viewport: { x: number; y: number; zoom: number };
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
};

export type Operation =
  | (BaseOperation & {
      type: "document.requestState";
      payload: { targetClientId: string };
    })
  | (BaseOperation & {
      type: "document.replace";
      payload: {
        targetClientId?: string;
        force?: boolean;
        documentState: DocumentStatePayload;
      };
    })
  | (BaseOperation & {
      type: "document.patchView";
      payload: {
        viewport?: { x: number; y: number; zoom: number };
        gridSize?: number;
        showGrid?: boolean;
        snapToGrid?: boolean;
      };
    })
  | (BaseOperation & {
      type: "presence.join";
      payload: {
        username: string;
        avatar?: string;
        color: string;
      };
    })
  | (BaseOperation & {
      type: "presence.leave";
      payload: Record<string, never>;
    })
  | (BaseOperation & {
      type: "presence.cursor";
      payload: {
        x: number;
        y: number;
        visible: boolean;
      };
    })
  | (BaseOperation & {
      type: "presence.view";
      payload: {
        viewport: { x: number; y: number; zoom: number };
      };
    })
  | (BaseOperation & {
      type: "presence.follow.force";
      payload: {
        leaderClientId: string;
      };
    })
  | (BaseOperation & {
      type: "presence.selection";
      payload: { selectedIds: string[] };
    })
  | (BaseOperation & {
      type: "presence.editing";
      payload: { elementId: string | null };
    })
  | (BaseOperation & {
      type: "presence.heartbeat";
      payload: Record<string, never>;
    })
  | (BaseOperation & {
      type: "element.lock.acquire";
      payload: { id: string; lockId: string; ttlMs: number };
    })
  | (BaseOperation & {
      type: "element.lock.release";
      payload: { ids: string[]; lockId?: string };
    })
  | (BaseOperation & {
      type: "element.add";
      payload: { element: CanvasElement };
    })
  | (BaseOperation & {
      type: "element.move";
      payload: { id: string; x: number; y: number };
    })
  | (BaseOperation & {
      type: "element.resize";
      payload: {
        id: string;
        width: number;
        height: number;
        nextX?: number;
        nextY?: number;
        nextFontSize?: number;
      };
    })
  | (BaseOperation & {
      type: "element.updateText";
      payload: { id: string; text: string };
    })
  | (BaseOperation & {
      type: "element.patchStyle";
      payload: {
        id: string;
        patch: {
          fill?: string;
          stroke?: string;
          strokeStyle?: "solid" | "dashed" | "dotted";
          shadowType?: "none" | "soft" | "offset" | "glow";
        };
      };
    })
  | (BaseOperation & {
      type: "element.patchData";
      payload: {
        id: string;
        patch: {
          locked?: boolean;
          envelopeType?: "convex" | "rectangle" | "rounded";
          titleOffsetX?: number;
          titleOffsetY?: number;
          memberIds?: string[];
          noteReactions?: Record<string, string>;
        };
      };
    })
  | (BaseOperation & {
      type: "line.patchStyle";
      payload: {
        id: string;
        patch: {
          stroke?: string;
          lineStyle?: "solid" | "dashed" | "dotted";
          lineRoute?: "straight" | "orthogonal" | "curve";
          lineArrow?: "none" | "start" | "end" | "both";
          lineArrowStyle?: "filled" | "open";
          label?: string;
          labelColor?: string;
          labelBg?: string;
          labelSize?: number;
          strokeWidth?: number;
        };
      };
    })
  | (BaseOperation & {
      type: "line.setGeometry";
      payload: {
        id: string;
        x: number;
        y: number;
        x2: number;
        y2: number;
        startAnchor?: AnchorPayload;
        endAnchor?: AnchorPayload;
      };
    })
  | (BaseOperation & {
      type: "text.patchStyle";
      payload: {
        id: string;
        patch: {
          fontFamily?: string;
          textAlign?: "left" | "center" | "right";
          textVerticalAlign?: "top" | "middle" | "bottom";
          bold?: boolean;
          italic?: boolean;
          underline?: boolean;
          fontSize?: number;
          lineHeight?: number;
          letterSpacing?: number;
          textTransform?: "none" | "uppercase" | "capitalize";
          textColor?: string;
        };
      };
    })
  | (BaseOperation & {
      type: "timer.start";
      payload: { durationSec: number; soundEnabled: boolean; startAtMs: number };
    })
  | (BaseOperation & {
      type: "timer.stop";
      payload: Record<string, never>;
    })
  | (BaseOperation & {
      type: "vote.start";
      payload: { elementIds: string[]; votesPerParticipant: number; votesMaxPerObject: number };
    })
  | (BaseOperation & {
      type: "vote.decrement";
      payload: { elementId: string };
    })
  | (BaseOperation & {
      type: "vote.close";
      payload: Record<string, never>;
    })
  | (BaseOperation & {
      type: "vote.increment";
      payload: { elementId: string };
    })
  | (BaseOperation & {
      type: "elements.delete";
      payload: { ids: string[] };
    })
  | (BaseOperation & {
      type: "zorder.toFront" | "zorder.toBack" | "zorder.forward" | "zorder.backward";
      payload: { ids: string[] };
    });

const ELEMENT_TYPES = new Set(["rectangle", "text", "note", "line", "image", "envelope"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const SHADOW_TYPES = new Set(["none", "soft", "offset", "glow"]);
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const LINE_ROUTES = new Set(["straight", "orthogonal", "curve"]);
const LINE_ARROWS = new Set(["none", "start", "end", "both"]);
const LINE_ARROW_STYLES = new Set(["filled", "open"]);
const TEXT_ALIGNS = new Set(["left", "center", "right"]);
const TEXT_VERTICAL_ALIGNS = new Set(["top", "middle", "bottom"]);
const TEXT_TRANSFORMS = new Set(["none", "uppercase", "capitalize"]);
const ENVELOPE_TYPES = new Set(["convex", "rectangle", "rounded"]);
const ANCHOR_POSITIONS = new Set([
  "top",
  "topRight",
  "right",
  "bottomRight",
  "bottom",
  "bottomLeft",
  "left",
  "topLeft",
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isViewportLike(value: unknown) {
  if (!isObjectRecord(value)) return false;
  if (!hasOnlyKeys(value, ["x", "y", "zoom"])) return false;
  return isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.zoom);
}

function isAnchorLike(value: unknown): value is { elementId: string; position: string } | null {
  if (value === null) return true;
  if (!isObjectRecord(value)) return false;
  if (!hasOnlyKeys(value, ["elementId", "position"])) return false;
  return typeof value.elementId === "string" && typeof value.position === "string" && ANCHOR_POSITIONS.has(value.position);
}

function isCanvasElementLike(value: unknown) {
  if (!isObjectRecord(value)) return false;
  const required = ["id", "type", "x", "y", "width", "height", "fill", "stroke"];
  for (const key of required) {
    if (!(key in value)) return false;
  }
  if (
    typeof value.id !== "string" ||
    typeof value.type !== "string" ||
    !ELEMENT_TYPES.has(value.type) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    typeof value.fill !== "string" ||
    typeof value.stroke !== "string"
  ) {
    return false;
  }
  if (typeof value.strokeStyle !== "undefined" && (typeof value.strokeStyle !== "string" || !STROKE_STYLES.has(value.strokeStyle))) {
    return false;
  }
  if (typeof value.shadowType !== "undefined" && (typeof value.shadowType !== "string" || !SHADOW_TYPES.has(value.shadowType))) {
    return false;
  }
  if (typeof value.locked !== "undefined" && typeof value.locked !== "boolean") return false;

  if (value.type === "line") {
    if (!isFiniteNumber(value.x2) || !isFiniteNumber(value.y2) || !isFiniteNumber(value.strokeWidth)) return false;
    if (typeof value.lineStyle !== "string" || !LINE_STYLES.has(value.lineStyle)) return false;
    if (typeof value.lineRoute !== "string" || !LINE_ROUTES.has(value.lineRoute)) return false;
    if (typeof value.lineArrow !== "string" || !LINE_ARROWS.has(value.lineArrow)) return false;
    if (typeof value.lineArrowStyle !== "string" || !LINE_ARROW_STYLES.has(value.lineArrowStyle)) return false;
    if (typeof value.label !== "string" || typeof value.labelColor !== "string" || typeof value.labelBg !== "string") return false;
    if (!isFiniteNumber(value.labelSize)) return false;
    if (typeof value.startAnchor !== "undefined" && !isAnchorLike(value.startAnchor)) return false;
    if (typeof value.endAnchor !== "undefined" && !isAnchorLike(value.endAnchor)) return false;
    return true;
  }

  if (value.type === "image") {
    return typeof value.src === "string";
  }

  if (value.type === "rectangle") {
    return true;
  }

  if (value.type === "text" || value.type === "note" || value.type === "envelope") {
    if (typeof value.text !== "string") return false;
    if (!isFiniteNumber(value.fontSize) || typeof value.fontFamily !== "string") return false;
    if (typeof value.textAlign !== "string" || !TEXT_ALIGNS.has(value.textAlign)) return false;
    if (typeof value.textVerticalAlign !== "string" || !TEXT_VERTICAL_ALIGNS.has(value.textVerticalAlign)) return false;
    if (typeof value.bold !== "boolean" || typeof value.italic !== "boolean" || typeof value.underline !== "boolean") return false;
    if (!isFiniteNumber(value.lineHeight) || !isFiniteNumber(value.letterSpacing)) return false;
    if (typeof value.textTransform !== "string" || !TEXT_TRANSFORMS.has(value.textTransform)) return false;
    if (value.type === "note") {
      if (
        typeof value.noteReactions !== "undefined" &&
        (!isObjectRecord(value.noteReactions) ||
          Object.values(value.noteReactions).some((emoji) => typeof emoji !== "string"))
      ) {
        return false;
      }
      return typeof value.textColor === "undefined" || typeof value.textColor === "string";
    }
    if (value.type === "envelope") {
      if (!Array.isArray(value.memberIds) || !value.memberIds.every((id) => typeof id === "string")) return false;
      if (typeof value.envelopeType !== "string" || !ENVELOPE_TYPES.has(value.envelopeType)) return false;
      if (!isFiniteNumber(value.titleOffsetX) || !isFiniteNumber(value.titleOffsetY)) return false;
      return typeof value.textColor === "string";
    }
    return true;
  }

  return false;
}

function isBaseOperationLike(operation: unknown): operation is BaseOperation & { type: string; payload: unknown } {
  if (!isObjectRecord(operation)) return false;
  if (typeof operation.opId !== "string" || !operation.opId) return false;
  if (typeof operation.clientId !== "string" || !operation.clientId) return false;
  if (typeof operation.type !== "string" || !operation.type) return false;
  if (!("payload" in operation)) return false;
  const seq = operation.seq;
  if (typeof seq !== "undefined") {
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq <= 0) return false;
  }
  if (typeof operation.schemaVersion !== "undefined" && operation.schemaVersion !== OP_SCHEMA_VERSION) return false;
  if (typeof operation.opVersion !== "undefined" && operation.opVersion !== OP_VERSION) return false;
  return true;
}

export function isValidOperation(operation: unknown): operation is Operation {
  if (!isBaseOperationLike(operation)) return false;
  const payload = operation.payload;
  if (!isObjectRecord(payload)) return false;

  switch (operation.type) {
    case "document.requestState":
      return hasOnlyKeys(payload, ["targetClientId"]) && typeof payload.targetClientId === "string";
    case "document.replace":
      if (!hasOnlyKeys(payload, ["targetClientId", "force", "documentState"])) return false;
      if (typeof payload.targetClientId !== "undefined" && typeof payload.targetClientId !== "string") return false;
      if (typeof payload.force !== "undefined" && typeof payload.force !== "boolean") return false;
      if (!isObjectRecord(payload.documentState)) return false;
      if (!hasOnlyKeys(payload.documentState, ["elements", "viewport", "gridSize", "showGrid", "snapToGrid"])) return false;
      if (!Array.isArray(payload.documentState.elements) || !payload.documentState.elements.every((item) => isCanvasElementLike(item))) {
        return false;
      }
      return (
        isViewportLike(payload.documentState.viewport) &&
        isFiniteNumber(payload.documentState.gridSize) &&
        typeof payload.documentState.showGrid === "boolean" &&
        typeof payload.documentState.snapToGrid === "boolean"
      );
    case "document.patchView":
      if (!hasOnlyKeys(payload, ["viewport", "gridSize", "showGrid", "snapToGrid"])) return false;
      if (typeof payload.viewport === "undefined" && typeof payload.gridSize === "undefined" && typeof payload.showGrid === "undefined" && typeof payload.snapToGrid === "undefined") {
        return false;
      }
      if (typeof payload.viewport !== "undefined" && !isViewportLike(payload.viewport)) return false;
      if (typeof payload.gridSize !== "undefined" && !isFiniteNumber(payload.gridSize)) return false;
      if (typeof payload.showGrid !== "undefined" && typeof payload.showGrid !== "boolean") return false;
      return typeof payload.snapToGrid === "undefined" || typeof payload.snapToGrid === "boolean";
    case "presence.join":
      return (
        hasOnlyKeys(payload, ["username", "avatar", "color"]) &&
        typeof payload.username === "string" &&
        (typeof payload.avatar === "undefined" || typeof payload.avatar === "string") &&
        typeof payload.color === "string"
      );
    case "presence.leave":
    case "presence.heartbeat":
    case "timer.stop":
    case "vote.close":
      return hasOnlyKeys(payload, []);
    case "presence.cursor":
      return hasOnlyKeys(payload, ["x", "y", "visible"]) && isFiniteNumber(payload.x) && isFiniteNumber(payload.y) && typeof payload.visible === "boolean";
    case "presence.view":
      return hasOnlyKeys(payload, ["viewport"]) && isViewportLike(payload.viewport);
    case "presence.follow.force":
      return hasOnlyKeys(payload, ["leaderClientId"]) && typeof payload.leaderClientId === "string";
    case "presence.selection":
      return hasOnlyKeys(payload, ["selectedIds"]) && isStringArray(payload.selectedIds);
    case "presence.editing":
      return hasOnlyKeys(payload, ["elementId"]) && (typeof payload.elementId === "string" || payload.elementId === null);
    case "element.lock.acquire":
      return hasOnlyKeys(payload, ["id", "lockId", "ttlMs"]) && typeof payload.id === "string" && typeof payload.lockId === "string" && isFiniteNumber(payload.ttlMs);
    case "element.lock.release":
      return hasOnlyKeys(payload, ["ids", "lockId"]) && isStringArray(payload.ids) && (typeof payload.lockId === "undefined" || typeof payload.lockId === "string");
    case "element.add":
      return hasOnlyKeys(payload, ["element"]) && isCanvasElementLike(payload.element);
    case "element.move":
      return hasOnlyKeys(payload, ["id", "x", "y"]) && typeof payload.id === "string" && isFiniteNumber(payload.x) && isFiniteNumber(payload.y);
    case "element.resize":
      if (!hasOnlyKeys(payload, ["id", "width", "height", "nextX", "nextY", "nextFontSize"])) return false;
      if (typeof payload.id !== "string" || !isFiniteNumber(payload.width) || !isFiniteNumber(payload.height)) return false;
      if (typeof payload.nextX !== "undefined" && !isFiniteNumber(payload.nextX)) return false;
      if (typeof payload.nextY !== "undefined" && !isFiniteNumber(payload.nextY)) return false;
      return typeof payload.nextFontSize === "undefined" || isFiniteNumber(payload.nextFontSize);
    case "element.updateText":
      return hasOnlyKeys(payload, ["id", "text"]) && typeof payload.id === "string" && typeof payload.text === "string";
    case "element.patchStyle":
      if (!hasOnlyKeys(payload, ["id", "patch"])) return false;
      if (typeof payload.id !== "string" || !isObjectRecord(payload.patch)) return false;
      if (!hasOnlyKeys(payload.patch, ["fill", "stroke", "strokeStyle", "shadowType"])) return false;
      if (typeof payload.patch.fill !== "undefined" && typeof payload.patch.fill !== "string") return false;
      if (typeof payload.patch.stroke !== "undefined" && typeof payload.patch.stroke !== "string") return false;
      if (typeof payload.patch.strokeStyle !== "undefined" && (typeof payload.patch.strokeStyle !== "string" || !STROKE_STYLES.has(payload.patch.strokeStyle))) return false;
      return typeof payload.patch.shadowType === "undefined" || (typeof payload.patch.shadowType === "string" && SHADOW_TYPES.has(payload.patch.shadowType));
    case "element.patchData":
      if (!hasOnlyKeys(payload, ["id", "patch"])) return false;
      if (typeof payload.id !== "string" || !isObjectRecord(payload.patch)) return false;
      if (!hasOnlyKeys(payload.patch, ["locked", "envelopeType", "titleOffsetX", "titleOffsetY", "memberIds", "noteReactions"])) return false;
      if (typeof payload.patch.locked !== "undefined" && typeof payload.patch.locked !== "boolean") return false;
      if (typeof payload.patch.envelopeType !== "undefined" && (typeof payload.patch.envelopeType !== "string" || !ENVELOPE_TYPES.has(payload.patch.envelopeType))) return false;
      if (typeof payload.patch.titleOffsetX !== "undefined" && !isFiniteNumber(payload.patch.titleOffsetX)) return false;
      if (typeof payload.patch.titleOffsetY !== "undefined" && !isFiniteNumber(payload.patch.titleOffsetY)) return false;
      if (typeof payload.patch.memberIds !== "undefined" && !isStringArray(payload.patch.memberIds)) return false;
      if (
        typeof payload.patch.noteReactions !== "undefined" &&
        (!isObjectRecord(payload.patch.noteReactions) ||
          Object.values(payload.patch.noteReactions).some((emoji) => typeof emoji !== "string"))
      ) {
        return false;
      }
      return true;
    case "line.patchStyle":
      if (!hasOnlyKeys(payload, ["id", "patch"])) return false;
      if (typeof payload.id !== "string" || !isObjectRecord(payload.patch)) return false;
      if (!hasOnlyKeys(payload.patch, ["stroke", "lineStyle", "lineRoute", "lineArrow", "lineArrowStyle", "label", "labelColor", "labelBg", "labelSize", "strokeWidth"])) {
        return false;
      }
      if (typeof payload.patch.stroke !== "undefined" && typeof payload.patch.stroke !== "string") return false;
      if (typeof payload.patch.lineStyle !== "undefined" && (typeof payload.patch.lineStyle !== "string" || !LINE_STYLES.has(payload.patch.lineStyle))) return false;
      if (typeof payload.patch.lineRoute !== "undefined" && (typeof payload.patch.lineRoute !== "string" || !LINE_ROUTES.has(payload.patch.lineRoute))) return false;
      if (typeof payload.patch.lineArrow !== "undefined" && (typeof payload.patch.lineArrow !== "string" || !LINE_ARROWS.has(payload.patch.lineArrow))) return false;
      if (typeof payload.patch.lineArrowStyle !== "undefined" && (typeof payload.patch.lineArrowStyle !== "string" || !LINE_ARROW_STYLES.has(payload.patch.lineArrowStyle))) return false;
      if (typeof payload.patch.label !== "undefined" && typeof payload.patch.label !== "string") return false;
      if (typeof payload.patch.labelColor !== "undefined" && typeof payload.patch.labelColor !== "string") return false;
      if (typeof payload.patch.labelBg !== "undefined" && typeof payload.patch.labelBg !== "string") return false;
      if (typeof payload.patch.labelSize !== "undefined" && !isFiniteNumber(payload.patch.labelSize)) return false;
      return typeof payload.patch.strokeWidth === "undefined" || isFiniteNumber(payload.patch.strokeWidth);
    case "line.setGeometry":
      if (!hasOnlyKeys(payload, ["id", "x", "y", "x2", "y2", "startAnchor", "endAnchor"])) return false;
      if (typeof payload.id !== "string") return false;
      if (!isFiniteNumber(payload.x) || !isFiniteNumber(payload.y) || !isFiniteNumber(payload.x2) || !isFiniteNumber(payload.y2)) return false;
      if (typeof payload.startAnchor !== "undefined" && !isAnchorLike(payload.startAnchor)) return false;
      return typeof payload.endAnchor === "undefined" || isAnchorLike(payload.endAnchor);
    case "text.patchStyle":
      if (!hasOnlyKeys(payload, ["id", "patch"])) return false;
      if (typeof payload.id !== "string" || !isObjectRecord(payload.patch)) return false;
      if (!hasOnlyKeys(payload.patch, ["fontFamily", "textAlign", "textVerticalAlign", "bold", "italic", "underline", "fontSize", "lineHeight", "letterSpacing", "textTransform", "textColor"])) {
        return false;
      }
      if (typeof payload.patch.fontFamily !== "undefined" && typeof payload.patch.fontFamily !== "string") return false;
      if (typeof payload.patch.textAlign !== "undefined" && (typeof payload.patch.textAlign !== "string" || !TEXT_ALIGNS.has(payload.patch.textAlign))) return false;
      if (typeof payload.patch.textVerticalAlign !== "undefined" && (typeof payload.patch.textVerticalAlign !== "string" || !TEXT_VERTICAL_ALIGNS.has(payload.patch.textVerticalAlign))) return false;
      if (typeof payload.patch.bold !== "undefined" && typeof payload.patch.bold !== "boolean") return false;
      if (typeof payload.patch.italic !== "undefined" && typeof payload.patch.italic !== "boolean") return false;
      if (typeof payload.patch.underline !== "undefined" && typeof payload.patch.underline !== "boolean") return false;
      if (typeof payload.patch.fontSize !== "undefined" && !isFiniteNumber(payload.patch.fontSize)) return false;
      if (typeof payload.patch.lineHeight !== "undefined" && !isFiniteNumber(payload.patch.lineHeight)) return false;
      if (typeof payload.patch.letterSpacing !== "undefined" && !isFiniteNumber(payload.patch.letterSpacing)) return false;
      if (typeof payload.patch.textTransform !== "undefined" && (typeof payload.patch.textTransform !== "string" || !TEXT_TRANSFORMS.has(payload.patch.textTransform))) return false;
      return typeof payload.patch.textColor === "undefined" || typeof payload.patch.textColor === "string";
    case "timer.start":
      return (
        hasOnlyKeys(payload, ["durationSec", "soundEnabled", "startAtMs"]) &&
        isFiniteNumber(payload.durationSec) &&
        typeof payload.soundEnabled === "boolean" &&
        isFiniteNumber(payload.startAtMs)
      );
    case "vote.start":
      return (
        hasOnlyKeys(payload, ["elementIds", "votesPerParticipant", "votesMaxPerObject"]) &&
        isStringArray(payload.elementIds) &&
        isFiniteNumber(payload.votesPerParticipant) &&
        isFiniteNumber(payload.votesMaxPerObject)
      );
    case "vote.increment":
    case "vote.decrement":
      return hasOnlyKeys(payload, ["elementId"]) && typeof payload.elementId === "string";
    case "elements.delete":
      return hasOnlyKeys(payload, ["ids"]) && isStringArray(payload.ids);
    case "zorder.toFront":
    case "zorder.toBack":
    case "zorder.forward":
    case "zorder.backward":
      return hasOnlyKeys(payload, ["ids"]) && isStringArray(payload.ids);
    default:
      return false;
  }
}
