<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import type {
  AnchorPosition,
  CanvasElement,
  EnvelopeType,
  ElementType,
  LineArrow,
  LineArrowStyle,
  LineRoute,
  LineStyle,
  StrokeStyle,
  ShadowType,
  TextAlign,
  TextVerticalAlign,
  TextTransformMode,
} from "../../stores/useCanvasStore";
import { useCanvasStore } from "../../stores/useCanvasStore";
import { getElementBounds, type Rect } from "../../domain/elements";
import { getLinePolyline, getLineSegments } from "../../domain/lineGeometry";
import { getElementCapabilities } from "../../domain/elementCapabilities";
import { renderCanvasElement } from "../../domain/elementRenderers";
import { ADDABLE_ELEMENTS } from "../../config/elementCatalog";
import {
  CONTEXT_MENU_ACTIONS,
  type ContextMenuActionDefinition,
} from "../../config/contextMenuActions";

type ResizeHandle = "nw" | "ne" | "sw" | "se";

const canvasStore = useCanvasStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const editorRef = ref<HTMLTextAreaElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const textMeasureCanvas = document.createElement("canvas");
const textMeasureCtx = textMeasureCanvas.getContext("2d");
const envelopeHitCtx = document.createElement("canvas").getContext("2d");
const ANCHOR_POSITIONS: AnchorPosition[] = [
  "top",
  "topRight",
  "right",
  "bottomRight",
  "bottom",
  "bottomLeft",
  "left",
  "topLeft",
];
const SWATCHES = [
  "#ffffff",
  "#e2e8f0",
  "#cbd5e1",
  "#fecaca",
  "#fed7aa",
  "#fef08a",
  "#bbf7d0",
  "#99f6e4",
  "#bfdbfe",
  "#c7d2fe",
  "#ddd6fe",
  "#e9d5ff",
  "#fbcfe8",
  "#0f172a",
  "#334155",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];
const TRANSPARENT_COLOR = "transparent";
const TEXT_FONT_OPTIONS = [
  { label: "System UI", value: "system-ui" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Trebuchet", value: "\"Trebuchet MS\", sans-serif" },
  { label: "Courier New", value: "\"Courier New\", monospace" },
  { label: "Times New Roman", value: "\"Times New Roman\", serif" },
] as const;
const LINE_LABEL_SIZE_OPTIONS = [10, 12, 14, 16, 18, 20, 24] as const;
const TEXT_SIZE_OPTIONS = [12, 14, 16, 20, 24, 32, 40] as const;
const TEXT_LINE_HEIGHT_OPTIONS = [1.1, 1.2, 1.3, 1.5, 1.8, 2] as const;
const TEXT_LETTER_SPACING_OPTIONS = [0, 0.5, 1, 1.5, 2, 3] as const;
const THEMES = [
  { name: "Ardoise", fill: "#e2e8f0", stroke: "#475569" },
  { name: "Corail", fill: "#fecaca", stroke: "#dc2626" },
  { name: "Ambre", fill: "#fed7aa", stroke: "#ea580c" },
  { name: "Citron", fill: "#fef08a", stroke: "#ca8a04" },
  { name: "Menthe", fill: "#bbf7d0", stroke: "#16a34a" },
  { name: "Lagune", fill: "#99f6e4", stroke: "#0f766e" },
  { name: "Ciel", fill: "#bfdbfe", stroke: "#2563eb" },
  { name: "Rose", fill: "#fbcfe8", stroke: "#db2777" },
] as const;
const MAX_IMAGE_WIDTH = 360;
const MAX_IMAGE_HEIGHT = 260;
const imageCache = new Map<string, HTMLImageElement>();

let resizeObserver: ResizeObserver | null = null;
let isPanning = false;
let spacePressed = false;
let pointerStartX = 0;
let pointerStartY = 0;
let panStartX = 0;
let panStartY = 0;
let lastPresenceCursorSentAt = 0;
let lastPresenceCursorX = Number.NaN;
let lastPresenceCursorY = Number.NaN;
let lastLockWarningAt = 0;

let draggingSelection:
  | {
      ids: string[];
      primaryIds: string[];
      startPointerX: number;
      startPointerY: number;
      startPositions: Record<string, { x: number; y: number }>;
      startRects: Record<string, Rect>;
    }
  | null = null;

let resizingSelection:
  | {
      ids: string[];
      handle: ResizeHandle;
      startPointerX: number;
      startPointerY: number;
      startBounds: Rect;
      startRects: Record<string, Rect>;
      startFontSizes: Record<string, number>;
      startTypes: Record<string, CanvasElement["type"]>;
      startTexts: Record<string, string>;
    }
  | null = null;

let marqueeSelection:
  | {
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
      additive: boolean;
      baseIds: string[];
    }
  | null = null;

let lineDrawing:
  | {
      id: string;
      startAnchor: { elementId: string; position: AnchorPosition } | null;
      endAnchor: { elementId: string; position: AnchorPosition } | null;
    }
  | null = null;

let lineEndpointDrag:
  | {
      id: string;
      endpoint: "start" | "end";
    }
  | null = null;

let envelopeTitleDrag:
  | {
      id: string;
      startPointerX: number;
      startPointerY: number;
      startOffsetX: number;
      startOffsetY: number;
    }
  | null = null;

let envelopeDrawing:
  | {
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    }
  | null = null;

const hoveredElementId = ref<string | null>(null);
const hoveredLineAnchor = ref<{ elementId: string; position: AnchorPosition } | null>(null);
const alignmentGuides = ref<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

const textEditor = ref<{
  id: string;
  type: CanvasElement["type"];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  textColor: string;
  fontFamily: string;
  textAlign: TextAlign;
  textVerticalAlign: TextVerticalAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformMode;
  text: string;
} | null>(null);

const textEditorStyle = computed(() => {
  const editor = textEditor.value;
  if (!editor) return {};

  const { zoom, x, y } = canvasStore.state.viewport;

  return {
    left: `${editor.x * zoom + x}px`,
    top: `${editor.y * zoom + y}px`,
    width: `${Math.max(80, editor.width * zoom)}px`,
    height: `${Math.max(30, editor.height * zoom)}px`,
    fontSize: `${editor.fontSize}px`,
    color: editor.textColor,
    fontFamily: editor.fontFamily,
    textAlign: editor.textAlign,
    fontWeight: editor.bold ? "700" : "500",
    fontStyle: editor.italic ? "italic" : "normal",
    textDecoration: editor.underline ? "underline" : "none",
    lineHeight: `${editor.lineHeight}`,
    letterSpacing: `${editor.letterSpacing}px`,
    textTransform: editor.textTransform,
  };
});

const selectedElements = computed(() => canvasStore.selectedElements.value);
const followedUser = computed(() => {
  const targetId = canvasStore.state.followTargetClientId;
  if (!targetId) return null;
  const presence = canvasStore.state.remotePresences[targetId];
  if (!presence) return null;
  return {
    id: targetId,
    username: presence.username,
    color: presence.color,
  };
});
const followCanvasStyle = computed(() =>
  followedUser.value
    ? ({
        "--follow-color": followedUser.value.color,
      } as Record<string, string>)
    : {},
);
const timerLabel = computed(() => {
  const total = Math.max(0, canvasStore.state.timerRemainingSec || 0);
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
});
const isTimerEnding = computed(
  () => canvasStore.state.timerRunning && canvasStore.state.timerRemainingSec <= 15,
);
const voteControlItems = computed(() => {
  if (!canvasStore.state.voteActive) return [];
  const localParticipant = canvasStore.state.voteParticipants[canvasStore.state.clientId];
  const localCounts = localParticipant?.counts ?? {};
  const localRemaining = localParticipant?.remaining ?? canvasStore.state.voteRemaining;
  const { zoom, x, y } = canvasStore.state.viewport;
  return canvasStore.state.voteElementIds
    .map((id) => canvasStore.state.elements.find((element) => element.id === id))
    .filter((element): element is CanvasElement => Boolean(element))
    .filter((element) => element.type === "note" || element.type === "image")
    .map((element) => {
      const rect = getElementRect(element);
      const votes = localCounts[element.id] ?? 0;
      const canIncrement =
        localRemaining > 0 && votes < canvasStore.state.voteMaxPerObject;
      const canDecrement = votes > 0;
      return {
        id: element.id,
        left: (rect.x + rect.width + 8) * zoom + x,
        top: (rect.y + rect.height / 2) * zoom + y,
        votes,
        canIncrement,
        canDecrement,
      };
    });
});
const voteResultRows = computed(() => {
  if (!canvasStore.state.voteResultsVisible) return [];
  return canvasStore.state.voteResults
    .map((result) => {
      const element = canvasStore.state.elements.find((item) => item.id === result.elementId);
      if (!element) return null;
      const label =
        element.type === "note"
          ? (element.text || "Note").slice(0, 40)
          : element.type === "image"
            ? "Image"
            : "Element";
      return {
        id: result.elementId,
        votes: result.votes,
        label,
      };
    })
    .filter((row): row is { id: string; votes: number; label: string } => Boolean(row));
});
const voteResultCanvasRefs = new Map<string, HTMLCanvasElement>();
const multiSelectionElements = computed(() =>
  selectedElements.value.filter((element) => !element.locked && element.type !== "line"),
);
const canAlignSelection = computed(() => multiSelectionElements.value.length >= 2);
const canDistributeSelection = computed(() => multiSelectionElements.value.length >= 3);
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  worldX: 0,
  worldY: 0,
  target: "canvas" as "canvas" | "element",
  elementId: null as string | null,
  elementType: null as CanvasElement["type"] | null,
  elementLocked: false,
});

const contextElementCapabilities = computed(() => {
  if (contextMenu.value.target !== "element" || !contextMenu.value.elementType) return null;
  return getElementCapabilities(contextMenu.value.elementType);
});
const isLockedContext = computed(
  () => contextMenu.value.target === "element" && contextMenu.value.elementLocked,
);
const contextElementEnvelopes = computed(() => {
  if (contextMenu.value.target !== "element" || !contextMenu.value.elementId) return [];
  if (contextMenu.value.elementType === "envelope") return [];
  return canvasStore.state.elements.filter(
    (element): element is Extract<CanvasElement, { type: "envelope" }> =>
      element.type === "envelope" && element.memberIds.includes(contextMenu.value.elementId as string),
  );
});
const canExcludeFromEnvelope = computed(() => contextElementEnvelopes.value.length > 0);
const selectedTextStyle = computed(() => {
  const element = selectedElements.value.find(
    (item) => item.type === "text" || item.type === "note" || item.type === "envelope",
  );
  if (!element) return null;
  return {
    fontFamily: element.fontFamily ?? "system-ui",
    textAlign: element.textAlign ?? "left",
    textVerticalAlign: element.textVerticalAlign ?? "top",
    bold: element.bold ?? false,
    italic: element.italic ?? false,
    underline: element.underline ?? false,
    fontSize: element.fontSize ?? (element.type === "note" ? getNoteFontSize(element.width) : 20),
    lineHeight: element.lineHeight ?? (element.type === "note" ? 1.3 : 1.2),
    letterSpacing: element.letterSpacing ?? 0,
    textTransform: element.textTransform ?? "none",
  };
});
const selectedLineStyle = computed(() => {
  const line = selectedElements.value.find(
    (element): element is Extract<CanvasElement, { type: "line" }> => element.type === "line",
  );
  if (!line) return null;
  return {
    lineStyle: line.lineStyle ?? "solid",
    lineRoute: line.lineRoute ?? "straight",
    lineArrow: line.lineArrow ?? "none",
    lineArrowStyle: line.lineArrowStyle ?? "filled",
    strokeWidth: line.strokeWidth ?? 2,
    label: line.label ?? "",
    labelColor: line.labelColor ?? "#0f172a",
    labelBg: line.labelBg ?? "#ffffff",
    labelSize: line.labelSize ?? 12,
  };
});
const elementContextActions = computed(() =>
  CONTEXT_MENU_ACTIONS.filter((action) => action.target === "element"),
);
const elementLockAction = computed(
  () => elementContextActions.value.find((action) => action.id === "toggleLock") ?? null,
);
const elementContextActionsAfterLock = computed(() =>
  elementContextActions.value.filter((action) => action.id !== "toggleLock"),
);
const canvasContextActions = computed(() =>
  CONTEXT_MENU_ACTIONS.filter((action) => action.target === "canvas"),
);

function handleSizeWorld() {
  return 10 / canvasStore.state.viewport.zoom;
}

function gridSizeWorld() {
  return Math.max(4, canvasStore.state.gridSize || 24);
}

function maybeSnap(value: number) {
  if (!canvasStore.state.snapToGrid) return value;
  const size = gridSizeWorld();
  return Math.round(value / size) * size;
}

function maybeSnapRect(rect: Rect) {
  if (!canvasStore.state.snapToGrid) return rect;
  const size = gridSizeWorld();
  return {
    x: maybeSnap(rect.x),
    y: maybeSnap(rect.y),
    width: Math.max(size, maybeSnap(rect.width)),
    height: Math.max(size, maybeSnap(rect.height)),
  };
}

function publishPresenceCursor(worldX: number, worldY: number, force = false) {
  const now = Date.now();
  const moved = Math.hypot(worldX - lastPresenceCursorX, worldY - lastPresenceCursorY);
  if (!force && now - lastPresenceCursorSentAt < 40 && moved < 2) {
    return;
  }
  lastPresenceCursorSentAt = now;
  lastPresenceCursorX = worldX;
  lastPresenceCursorY = worldY;
  canvasStore.updatePresenceCursor(worldX, worldY, true);
}

function getNoteFontSize(side: number) {
  return Math.max(12, Math.min(40, side * 0.11));
}

function getCursorForHandle(handle: ResizeHandle) {
  if (handle === "nw" || handle === "se") return "nwse-resize";
  return "nesw-resize";
}

function updateCanvasCursor(cursor?: string) {
  if (!canvasRef.value) return;
  canvasRef.value.style.cursor = cursor ?? "default";
}

function setHoveredElement(id: string | null) {
  if (hoveredElementId.value === id) return;
  hoveredElementId.value = id;
  render();
}

function setHoveredLineAnchor(anchor: { elementId: string; position: AnchorPosition } | null) {
  if (
    hoveredLineAnchor.value?.elementId === anchor?.elementId &&
    hoveredLineAnchor.value?.position === anchor?.position
  ) {
    return;
  }
  hoveredLineAnchor.value = anchor;
  render();
}

function isLockedByRemote(elementId: string) {
  const lock = canvasStore.state.elementLocks[elementId];
  if (!lock) return false;
  if (lock.expiresAt <= Date.now()) return false;
  return lock.clientId !== canvasStore.state.clientId;
}

function notifyLockedByRemote(elementId: string) {
  const now = Date.now();
  if (now - lastLockWarningAt < 1200) return;
  lastLockWarningAt = now;
  const lock = canvasStore.getElementLockInfo(elementId);
  if (!lock || lock.clientId === canvasStore.state.clientId) return;
  window.alert(`Element verrouille par ${lock.username}.`);
}

function drawImageElement(ctx: CanvasRenderingContext2D, element: Extract<CanvasElement, { type: "image" }>) {
  if (!element.src) {
    ctx.save();
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(element.x, element.y, element.width, element.height);
    ctx.restore();
    return;
  }

  const cached = imageCache.get(element.src);
  if (cached && cached.complete) {
    ctx.drawImage(cached, element.x, element.y, element.width, element.height);
    return;
  }

  if (!cached) {
    const image = new Image();
    image.src = element.src;
    image.onload = () => render();
    image.onerror = () => {
      imageCache.delete(element.src);
      render();
    };
    imageCache.set(element.src, image);
  }

  ctx.save();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(element.x, element.y, element.width, element.height);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Chargement image...", element.x + element.width / 2, element.y + element.height / 2);
  ctx.restore();
}

function promptImageUpload() {
  return new Promise<{ src: string; width: number; height: number } | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const src = typeof reader.result === "string" ? reader.result : "";
        if (!src) {
          resolve(null);
          return;
        }
        const image = new Image();
        image.onload = () => {
          const ratio = Math.min(
            1,
            MAX_IMAGE_WIDTH / Math.max(1, image.naturalWidth),
            MAX_IMAGE_HEIGHT / Math.max(1, image.naturalHeight),
          );
          resolve({
            src,
            width: Math.max(40, Math.round(image.naturalWidth * ratio)),
            height: Math.max(40, Math.round(image.naturalHeight * ratio)),
          });
        };
        image.onerror = () => resolve(null);
        image.src = src;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

function normalizeRect(aX: number, aY: number, bX: number, bY: number): Rect {
  return {
    x: Math.min(aX, bX),
    y: Math.min(aY, bY),
    width: Math.abs(bX - aX),
    height: Math.abs(bY - aY),
  };
}

function rectsIntersect(a: Rect, b: Rect) {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

function getTextBoundsFromValues(text: string, fontSize: number, fallbackWidth: number, fallbackHeight: number) {
  if (!textMeasureCtx) {
    return {
      width: Math.max(16, fallbackWidth),
      height: Math.max(16, fallbackHeight),
    };
  }

  textMeasureCtx.font = `600 ${fontSize}px system-ui`;
  const lines = (text || "Note").split("\n");
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = textMeasureCtx.measureText(line || " ");
    maxLineWidth = Math.max(maxLineWidth, metrics.width);
  }
  const width = Math.max(16, maxLineWidth + 2);
  const lineHeight = fontSize * 1.2;
  const height = Math.max(16, lines.length * lineHeight);

  return { width, height };
}

function wrapTextToLines(text: string, maxWidth: number, font: string, letterSpacing = 0) {
  if (!textMeasureCtx) {
    return text.split("\n");
  }

  textMeasureCtx.font = font;
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (measureTextWidth(testLine, font, letterSpacing) <= maxWidth) {
        line = testLine;
        continue;
      }

      if (line) {
        lines.push(line);
        line = "";
      }

      if (measureTextWidth(word, font, letterSpacing) <= maxWidth) {
        line = word;
        continue;
      }

      let chunk = "";
      for (const char of word) {
        const testChunk = chunk + char;
        if (measureTextWidth(testChunk, font, letterSpacing) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = testChunk;
        }
      }
      line = chunk;
    }

    lines.push(line);
  }

  return lines;
}

function applyTextTransform(text: string, mode: TextTransformMode) {
  if (mode === "uppercase") return text.toUpperCase();
  if (mode === "capitalize") {
    return text.replace(/\b\p{L}/gu, (char) => char.toUpperCase());
  }
  return text;
}

function measureTextWidth(text: string, font: string, letterSpacing = 0) {
  if (!textMeasureCtx) {
    return text.length * 8 + Math.max(0, text.length - 1) * letterSpacing;
  }
  textMeasureCtx.font = font;
  const width = textMeasureCtx.measureText(text).width;
  return width + Math.max(0, text.length - 1) * letterSpacing;
}

function drawTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  letterSpacing: number,
) {
  if (letterSpacing <= 0 || text.length <= 1) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursorX = x;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    ctx.fillText(char, cursorX, y);
    cursorX += ctx.measureText(char).width + letterSpacing;
  }
}

function getRequiredNoteSide(
  text: string,
  currentSide: number,
  fontSize: number,
  lineHeightFactor: number,
  letterSpacing: number,
  textTransform: TextTransformMode,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
) {
  if (!textMeasureCtx) {
    return currentSide;
  }

  let side = Math.max(40, currentSide);
  const padding = 12;

  for (let i = 0; i < 10; i += 1) {
    const fontWeight = bold ? 700 : 500;
    const fontStyle = italic ? "italic" : "normal";
    const font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    const contentWidth = Math.max(10, side - padding * 2);
    const transformedText = applyTextTransform(text, textTransform);
    const lines = wrapTextToLines(transformedText, contentWidth, font, letterSpacing);

    textMeasureCtx.font = font;
    let maxLineWidth = 0;
    for (const line of lines) {
      maxLineWidth = Math.max(maxLineWidth, measureTextWidth(line, font, letterSpacing));
    }

    const lineHeight = fontSize * lineHeightFactor;
    const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
    const requiredSide = Math.ceil(
      Math.max(side, maxLineWidth + padding * 2, contentHeight + padding * 2),
    );

    if (requiredSide <= side) {
      return side;
    }

    side = requiredSide;
  }

  return side;
}

function getBaseElementRect(element: CanvasElement): Rect {
  return getElementBounds(element, {
    measureTextBounds: getTextBoundsFromValues,
  });
}

function getMemberCenter(member: CanvasElement) {
  const rect = getBaseElementRect(member);
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function getEnvelopeMembers(envelope: Extract<CanvasElement, { type: "envelope" }>) {
  return envelope.memberIds
    .map((memberId) => canvasStore.state.elements.find((element) => element.id === memberId))
    .filter((element): element is CanvasElement => !!element && element.type !== "envelope");
}

function getEnvelopeBounds(envelope: Extract<CanvasElement, { type: "envelope" }>): Rect {
  const members = getEnvelopeMembers(envelope);
  if (members.length === 0) {
    return getBaseElementRect(envelope);
  }

  const firstMember = members[0];
  if (!firstMember) {
    return getBaseElementRect(envelope);
  }
  const firstRect = getBaseElementRect(firstMember);
  let minX = firstRect.x;
  let minY = firstRect.y;
  let maxX = firstRect.x + firstRect.width;
  let maxY = firstRect.y + firstRect.height;

  for (let i = 1; i < members.length; i += 1) {
    const member = members[i];
    if (!member) continue;
    const rect = getBaseElementRect(member);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  const padding = 22;
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(24, maxX - minX + padding * 2),
    height: Math.max(24, maxY - minY + padding * 2),
  };
}

function getEnvelopeTitleRect(envelope: Extract<CanvasElement, { type: "envelope" }>): Rect {
  const bounds = getEnvelopeBounds(envelope);
  const fontSize = envelope.fontSize ?? 18;
  const text = envelope.text || "Enveloppe";
  const measured = getTextBoundsFromValues(text, fontSize, 120, fontSize * 1.4);
  const width = Math.max(120, measured.width + 16);
  const height = Math.max(fontSize * 1.4, measured.height + 10);
  const anchorX = bounds.x + bounds.width;
  const anchorY = bounds.y;

  return {
    x: anchorX + (envelope.titleOffsetX ?? 8),
    y: anchorY + (envelope.titleOffsetY ?? -30),
    width,
    height,
  };
}

function getEnvelopeTitleAt(worldX: number, worldY: number) {
  for (let i = canvasStore.state.elements.length - 1; i >= 0; i -= 1) {
    const element = canvasStore.state.elements[i];
    if (!element || element.type !== "envelope") continue;
    const rect = getEnvelopeTitleRect(element);
    if (
      worldX >= rect.x &&
      worldX <= rect.x + rect.width &&
      worldY >= rect.y &&
      worldY <= rect.y + rect.height
    ) {
      return element;
    }
  }
  return null;
}

function getEnvelopeMembershipCount(elementId: string) {
  let count = 0;
  for (const element of canvasStore.state.elements) {
    if (element.type !== "envelope") continue;
    if (element.memberIds.includes(elementId)) {
      count += 1;
    }
  }
  return count;
}

type Point = { x: number; y: number };

function crossProduct(o: Point, a: Point, b: Point) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function computeConvexHull(points: Point[]): Point[] {
  if (points.length <= 1) return points;
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const lower: Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    if (!point) continue;
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function getEnvelopePolygon(envelope: Extract<CanvasElement, { type: "envelope" }>): Point[] {
  const members = getEnvelopeMembers(envelope);
  if (members.length === 0) return [];

  const points: Point[] = [];
  for (const member of members) {
    const rect = getBaseElementRect(member);
    const px = 18;
    const py = 18;
    points.push(
      { x: rect.x - px, y: rect.y - py },
      { x: rect.x + rect.width + px, y: rect.y - py },
      { x: rect.x + rect.width + px, y: rect.y + rect.height + py },
      { x: rect.x - px, y: rect.y + rect.height + py },
    );
  }

  const hull = computeConvexHull(points);
  return hull;
}

function drawEnvelopePath(
  ctx: CanvasRenderingContext2D,
  envelope: Extract<CanvasElement, { type: "envelope" }>,
) {
  const bounds = getEnvelopeBounds(envelope);
  const polygon = getEnvelopePolygon(envelope);

  if (envelope.envelopeType === "rectangle" || polygon.length < 3) {
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    return;
  }

  if (envelope.envelopeType === "convex") {
    ctx.beginPath();
    const first = polygon[0];
    if (!first) return;
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < polygon.length; i += 1) {
      const point = polygon[i];
      if (!point) continue;
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    return;
  }

  const smoothing = 0.22;
  ctx.beginPath();
  for (let i = 0; i < polygon.length; i += 1) {
    const prev = polygon[(i - 1 + polygon.length) % polygon.length];
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    if (!prev || !current || !next) continue;

    const inX = current.x - (current.x - prev.x) * smoothing;
    const inY = current.y - (current.y - prev.y) * smoothing;
    const outX = current.x + (next.x - current.x) * smoothing;
    const outY = current.y + (next.y - current.y) * smoothing;

    if (i === 0) {
      ctx.moveTo(inX, inY);
    }
    ctx.quadraticCurveTo(current.x, current.y, outX, outY);
  }
  ctx.closePath();
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) continue;
    const intersects =
      (pi.y > point.y) !== (pj.y > point.y) &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / Math.max(1e-7, pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInsideEnvelope(
  x: number,
  y: number,
  envelope: Extract<CanvasElement, { type: "envelope" }>,
  includeStrokeTolerance = false,
) {
  const bounds = getEnvelopeBounds(envelope);
  if (
    x < bounds.x ||
    x > bounds.x + bounds.width ||
    y < bounds.y ||
    y > bounds.y + bounds.height
  ) {
    return false;
  }

  if (envelope.envelopeType === "rectangle") return true;

  if (envelopeHitCtx) {
    envelopeHitCtx.save();
    envelopeHitCtx.setTransform(1, 0, 0, 1, 0, 0);
    drawEnvelopePath(envelopeHitCtx, envelope);
    const inPath = envelopeHitCtx.isPointInPath(x, y);
    let inStroke = false;
    if (includeStrokeTolerance) {
      envelopeHitCtx.lineWidth = 14 / canvasStore.state.viewport.zoom;
      inStroke = envelopeHitCtx.isPointInStroke(x, y);
    }
    envelopeHitCtx.restore();
    return inPath || inStroke;
  }

  const polygon = getEnvelopePolygon(envelope);
  if (polygon.length < 3) return true;
  return pointInPolygon({ x, y }, polygon);
}

function getElementRect(element: CanvasElement): Rect {
  if (element.type === "envelope") {
    return getEnvelopeBounds(element);
  }
  return getBaseElementRect(element);
}

function getAnchorPointFromRect(rect: Rect, position: AnchorPosition) {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;

  if (position === "top") return { x: centerX, y: top };
  if (position === "topRight") return { x: right, y: top };
  if (position === "right") return { x: right, y: centerY };
  if (position === "bottomRight") return { x: right, y: bottom };
  if (position === "bottom") return { x: centerX, y: bottom };
  if (position === "bottomLeft") return { x: left, y: bottom };
  if (position === "left") return { x: left, y: centerY };
  return { x: left, y: top };
}

function getAnchorableElements() {
  return canvasStore.state.elements.filter(
    (element) => element.type !== "envelope" && element.type !== "line",
  );
}

function getLinePathPoints(element: Extract<CanvasElement, { type: "line" }>) {
  return getLinePolyline(element);
}

function getClosestAnchor(worldX: number, worldY: number) {
  const snapRadius = 14 / canvasStore.state.viewport.zoom;
  let closest:
    | {
        elementId: string;
        position: AnchorPosition;
        x: number;
        y: number;
        distance: number;
      }
    | null = null;

  for (const element of getAnchorableElements()) {
    const rect = getElementRect(element);
    for (const position of ANCHOR_POSITIONS) {
      const point = getAnchorPointFromRect(rect, position);
      const distance = Math.hypot(worldX - point.x, worldY - point.y);
      if (distance > snapRadius) continue;
      if (!closest || distance < closest.distance) {
        closest = {
          elementId: element.id,
          position,
          x: point.x,
          y: point.y,
          distance,
        };
      }
    }
  }

  return closest;
}

function getSelectionBounds(elements: CanvasElement[]): Rect | null {
  if (elements.length === 0) return null;

  const rects = elements.map(getElementRect);
  const firstRect = rects[0];
  if (!firstRect) return null;

  let minX = firstRect.x;
  let minY = firstRect.y;
  let maxX = firstRect.x + firstRect.width;
  let maxY = firstRect.y + firstRect.height;

  for (let i = 1; i < rects.length; i += 1) {
    const rect = rects[i];
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function getRectsBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const first = rects[0];
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (let i = 1; i < rects.length; i += 1) {
    const rect = rects[i];
    if (!rect) continue;
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function computeAlignmentSnap(
  movingBounds: Rect,
  staticRects: Rect[],
): {
  deltaX: number;
  deltaY: number;
  guides: Array<{ x1: number; y1: number; x2: number; y2: number }>;
} {
  const threshold = 7 / canvasStore.state.viewport.zoom;
  const movingLeft = movingBounds.x;
  const movingCenterX = movingBounds.x + movingBounds.width / 2;
  const movingRight = movingBounds.x + movingBounds.width;
  const movingTop = movingBounds.y;
  const movingCenterY = movingBounds.y + movingBounds.height / 2;
  const movingBottom = movingBounds.y + movingBounds.height;

  let bestX: { delta: number; moving: number; target: number } | null = null;
  let bestY: { delta: number; moving: number; target: number } | null = null;

  for (const rect of staticRects) {
    const targetsX = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
    const movingXs = [movingLeft, movingCenterX, movingRight];
    for (const moving of movingXs) {
      for (const target of targetsX) {
        const delta = target - moving;
        if (Math.abs(delta) > threshold) continue;
        if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
          bestX = { delta, moving, target };
        }
      }
    }

    const targetsY = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
    const movingYs = [movingTop, movingCenterY, movingBottom];
    for (const moving of movingYs) {
      for (const target of targetsY) {
        const delta = target - moving;
        if (Math.abs(delta) > threshold) continue;
        if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
          bestY = { delta, moving, target };
        }
      }
    }
  }

  const deltaX = bestX?.delta ?? 0;
  const deltaY = bestY?.delta ?? 0;
  const guides: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  if (bestX) {
    guides.push({
      x1: bestX.target,
      y1: movingTop + deltaY - 40,
      x2: bestX.target,
      y2: movingBottom + deltaY + 40,
    });
  }
  if (bestY) {
    guides.push({
      x1: movingLeft + deltaX - 40,
      y1: bestY.target,
      x2: movingRight + deltaX + 40,
      y2: bestY.target,
    });
  }

  return { deltaX, deltaY, guides };
}

function screenToWorld(screenX: number, screenY: number) {
  const { x, y, zoom } = canvasStore.state.viewport;
  return {
    x: (screenX - x) / zoom,
    y: (screenY - y) / zoom,
  };
}

function getHandleCenter(bounds: Rect, handle: ResizeHandle) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;

  if (handle === "nw") return { x: bounds.x, y: bounds.y };
  if (handle === "ne") return { x: right, y: bounds.y };
  if (handle === "sw") return { x: bounds.x, y: bottom };
  return { x: right, y: bottom };
}

function getResizeHandleAt(worldX: number, worldY: number, bounds: Rect): ResizeHandle | null {
  const size = handleSizeWorld();
  const radius = size / 2;

  const handles: ResizeHandle[] = ["nw", "ne", "sw", "se"];
  for (const handle of handles) {
    const center = getHandleCenter(bounds, handle);
    if (Math.abs(worldX - center.x) <= radius && Math.abs(worldY - center.y) <= radius) {
      return handle;
    }
  }

  return null;
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function getLineEndpointAt(worldX: number, worldY: number) {
  const selectedLines = selectedElements.value.filter(
    (element): element is Extract<CanvasElement, { type: "line" }> =>
      element.type === "line" && !element.locked,
  );
  if (selectedLines.length !== 1) return null;

  const line = selectedLines[0];
  if (!line) return null;

  const radius = 7 / canvasStore.state.viewport.zoom;
  if (Math.hypot(worldX - line.x, worldY - line.y) <= radius) {
    return { id: line.id, endpoint: "start" as const };
  }
  if (Math.hypot(worldX - line.x2, worldY - line.y2) <= radius) {
    return { id: line.id, endpoint: "end" as const };
  }
  return null;
}

function hitTest(worldX: number, worldY: number): CanvasElement | null {
  for (let i = canvasStore.state.elements.length - 1; i >= 0; i -= 1) {
    const element = canvasStore.state.elements[i];
    if (!element || element.type === "envelope") continue;

    if (element.type === "line") {
      const tolerance = 6 / canvasStore.state.viewport.zoom;
      const segments = getLineSegments(element);
      let isHit = false;
      for (const segment of segments) {
        const distance = distancePointToSegment(
          worldX,
          worldY,
          segment.a.x,
          segment.a.y,
          segment.b.x,
          segment.b.y,
        );
        if (distance <= tolerance) {
          isHit = true;
          break;
        }
      }
      if (isHit) {
        return element;
      }
      continue;
    }

    const rect = getElementRect(element);
    if (
      worldX >= rect.x &&
      worldX <= rect.x + rect.width &&
      worldY >= rect.y &&
      worldY <= rect.y + rect.height
    ) {
      return element;
    }
  }

  for (let i = canvasStore.state.elements.length - 1; i >= 0; i -= 1) {
    const element = canvasStore.state.elements[i];
    if (!element) continue;
    if (element.type === "envelope" && isPointInsideEnvelope(worldX, worldY, element, true)) {
      return element;
    }
  }

  return null;
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  if (!canvasStore.state.showGrid) return;
  const { x, y, zoom } = canvasStore.state.viewport;
  const worldSpacing = gridSizeWorld();
  const spacing = worldSpacing * zoom;

  ctx.strokeStyle = "#eef2f6";
  ctx.lineWidth = 1;

  const startX = ((x % spacing) + spacing) % spacing;
  for (let px = startX; px <= width; px += spacing) {
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  const startY = ((y % spacing) + spacing) % spacing;
  for (let py = startY; py <= height; py += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
  textAlign: TextAlign = "left",
  textVerticalAlign: TextVerticalAlign = "top",
  underline = false,
  letterSpacing = 0,
  textTransform: TextTransformMode = "none",
) {
  const transformed = applyTextTransform(text, textTransform);
  const lines = wrapTextToLines(transformed, maxWidth, ctx.font, letterSpacing);
  const visibleLineCount = Math.max(1, Math.floor(maxHeight / Math.max(1, lineHeight)));
  const drawableLines = lines.slice(0, visibleLineCount);
  const totalHeight = drawableLines.length * lineHeight;
  let lineY =
    textVerticalAlign === "middle"
      ? y + Math.max(0, (maxHeight - totalHeight) / 2)
      : textVerticalAlign === "bottom"
        ? y + Math.max(0, maxHeight - totalHeight)
        : y;

  for (const line of drawableLines) {
    if (lineY + lineHeight > y + maxHeight) return;
    const lineWidth = measureTextWidth(line, ctx.font, letterSpacing);
    const lineX = textAlign === "left" ? x : textAlign === "center" ? x + maxWidth / 2 : x + maxWidth;
    ctx.textAlign = "left";
    const drawX = textAlign === "left" ? lineX : textAlign === "center" ? lineX - lineWidth / 2 : lineX - lineWidth;
    drawTextWithLetterSpacing(ctx, line, drawX, lineY, letterSpacing);
    if (underline && line) {
      const startX = drawX;
      const underlineY = lineY + lineHeight * 0.9;
      ctx.beginPath();
      ctx.moveTo(startX, underlineY);
      ctx.lineTo(startX + lineWidth, underlineY);
      ctx.lineWidth = Math.max(1, lineHeight * 0.06);
      ctx.strokeStyle = ctx.fillStyle as string;
      ctx.stroke();
    }
    lineY += lineHeight;
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawResizeHandles(ctx: CanvasRenderingContext2D, bounds: Rect) {
  const size = handleSizeWorld();
  const half = size / 2;

  const handles: ResizeHandle[] = ["nw", "ne", "sw", "se"];

  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#3b82f6";

  for (const handle of handles) {
    const center = getHandleCenter(bounds, handle);
    ctx.beginPath();
    ctx.rect(center.x - half, center.y - half, size, size);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawLineEndpointHandles(ctx: CanvasRenderingContext2D, line: Extract<CanvasElement, { type: "line" }>) {
  const radius = 5 / canvasStore.state.viewport.zoom;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;

  ctx.beginPath();
  ctx.arc(line.x, line.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(line.x2, line.y2, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPerElementHandles(ctx: CanvasRenderingContext2D, elements: CanvasElement[]) {
  for (const element of elements) {
    if (element.type === "line") {
      drawLineEndpointHandles(ctx, element);
      continue;
    }
    if (element.type === "envelope") {
      continue;
    }
    drawResizeHandles(ctx, getElementRect(element));
  }
}

function drawMembershipIndicator(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement,
  count: number,
) {
  const rect = getElementRect(element);
  const pad = 4 / canvasStore.state.viewport.zoom;
  ctx.save();
  ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
  ctx.strokeStyle = "rgba(30, 64, 175, 0.85)";
  ctx.setLineDash([5 / canvasStore.state.viewport.zoom, 4 / canvasStore.state.viewport.zoom]);
  ctx.strokeRect(rect.x - pad, rect.y - pad, rect.width + pad * 2, rect.height + pad * 2);

  const badgeRadius = 9 / canvasStore.state.viewport.zoom;
  const badgeX = rect.x + rect.width + badgeRadius * 0.3;
  const badgeY = rect.y - badgeRadius * 0.3;
  ctx.setLineDash([]);
  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.max(8, 10 / canvasStore.state.viewport.zoom)}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(count), badgeX, badgeY);
  ctx.restore();
}

function drawLineAnchorTargets(ctx: CanvasRenderingContext2D) {
  const radius = 4.5 / canvasStore.state.viewport.zoom;
  for (const element of getAnchorableElements()) {
    const rect = getElementRect(element);
    for (const position of ANCHOR_POSITIONS) {
      const anchor = getAnchorPointFromRect(rect, position);
      const isActiveStart =
        lineDrawing?.startAnchor?.elementId === element.id &&
        lineDrawing.startAnchor.position === position;
      const isActiveEnd =
        lineDrawing?.endAnchor?.elementId === element.id &&
        lineDrawing.endAnchor.position === position;
      const isHovered =
        hoveredLineAnchor.value?.elementId === element.id &&
        hoveredLineAnchor.value?.position === position;
      const isHighlighted = isHovered || isActiveStart || isActiveEnd;
      ctx.save();
      ctx.fillStyle = isHighlighted ? "#1e3a8a" : "#ffffff";
      ctx.strokeStyle = isHighlighted ? "#1e3a8a" : "#2563eb";
      ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
      ctx.beginPath();
      ctx.arc(anchor.x, anchor.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawMarquee(ctx: CanvasRenderingContext2D, rect: Rect) {
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.fillStyle = "rgba(37, 99, 235, 0.1)";
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawAlignmentGuides(ctx: CanvasRenderingContext2D, guides: Array<{ x1: number; y1: number; x2: number; y2: number }>) {
  if (guides.length === 0) return;
  ctx.save();
  ctx.strokeStyle = "#0ea5e9";
  ctx.setLineDash([6 / canvasStore.state.viewport.zoom, 4 / canvasStore.state.viewport.zoom]);
  ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
  for (const guide of guides) {
    ctx.beginPath();
    ctx.moveTo(guide.x1, guide.y1);
    ctx.lineTo(guide.x2, guide.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRemotePresenceCursors(ctx: CanvasRenderingContext2D) {
  const zoom = canvasStore.state.viewport.zoom;
  const pointerSize = 9 / zoom;
  const fontSize = Math.max(9, 11 / zoom);
  const labelPaddingX = 6 / zoom;
  const labelHeight = 18 / zoom;

  for (const presence of Object.values(canvasStore.state.remotePresences)) {
    if (!presence.online || !presence.cursor) continue;
    const { x, y } = presence.cursor;

    ctx.save();
    ctx.fillStyle = presence.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / zoom;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + pointerSize * 0.9, y + pointerSize * 2.1);
    ctx.lineTo(x + pointerSize * 0.2, y + pointerSize * 1.85);
    ctx.lineTo(x - pointerSize * 0.1, y + pointerSize * 2.8);
    ctx.lineTo(x - pointerSize * 0.8, y + pointerSize * 2.55);
    ctx.lineTo(x - pointerSize * 0.45, y + pointerSize * 1.6);
    ctx.lineTo(x - pointerSize * 1.2, y + pointerSize * 1.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = `600 ${fontSize}px system-ui`;
    const text = presence.username;
    const textWidth = ctx.measureText(text).width;
    const labelWidth = textWidth + labelPaddingX * 2;
    const labelX = x + pointerSize * 1.2;
    const labelY = y - labelHeight * 0.55;

    ctx.fillStyle = presence.color;
    drawRoundedRect(ctx, labelX, labelY, labelWidth, labelHeight, 6 / zoom);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, labelX + labelPaddingX, labelY + labelHeight / 2 + 0.5 / zoom);
    ctx.restore();
  }
}

function drawRemoteSelections(ctx: CanvasRenderingContext2D) {
  for (const presence of Object.values(canvasStore.state.remotePresences)) {
    if (!presence.online) continue;
    const stroke = presence.color || "#2563eb";
    for (const id of presence.selectedIds) {
      const element = canvasStore.state.elements.find((item) => item.id === id);
      if (!element) continue;
      const rect = getElementRect(element);
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5 / canvasStore.state.viewport.zoom;
      ctx.setLineDash([5 / canvasStore.state.viewport.zoom, 4 / canvasStore.state.viewport.zoom]);
      ctx.strokeRect(rect.x - 2, rect.y - 2, rect.width + 4, rect.height + 4);
      ctx.restore();
    }
    if (!presence.editingElementId) continue;
    const editing = canvasStore.state.elements.find((item) => item.id === presence.editingElementId);
    if (!editing) continue;
    const rect = getElementRect(editing);
    const label = `${presence.username} édite`;
    ctx.save();
    ctx.font = `${Math.max(9, 11 / canvasStore.state.viewport.zoom)}px system-ui`;
    const textWidth = ctx.measureText(label).width;
    const h = 16 / canvasStore.state.viewport.zoom;
    const x = rect.x;
    const y = rect.y - h - 6 / canvasStore.state.viewport.zoom;
    drawRoundedRect(ctx, x, y, textWidth + 10 / canvasStore.state.viewport.zoom, h, 6 / canvasStore.state.viewport.zoom);
    ctx.fillStyle = presence.color;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 5 / canvasStore.state.viewport.zoom, y + h / 2);
    ctx.restore();
  }
}

function drawElementLocks(ctx: CanvasRenderingContext2D) {
  const zoom = canvasStore.state.viewport.zoom;
  for (const [elementId, lock] of Object.entries(canvasStore.state.elementLocks)) {
    const element = canvasStore.state.elements.find((item) => item.id === elementId);
    if (!element) continue;
    const rect = getElementRect(element);
    ctx.save();
    ctx.fillStyle = lock.clientId === canvasStore.state.clientId ? "#16a34a" : "#b45309";
    ctx.font = `${Math.max(9, 11 / zoom)}px system-ui`;
    const label = lock.clientId === canvasStore.state.clientId ? "Vous verrouillez" : `${lock.username} verrouille`;
    const tw = ctx.measureText(label).width;
    const h = 16 / zoom;
    const x = rect.x + rect.width - tw - 14 / zoom;
    const y = rect.y + rect.height + 4 / zoom;
    drawRoundedRect(ctx, x, y, tw + 10 / zoom, h, 6 / zoom);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 5 / zoom, y + h / 2);
    ctx.restore();
  }
}

function render() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height);

  const { zoom, x, y } = canvasStore.state.viewport;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y);

  const envelopes = canvasStore.state.elements.filter(
    (element): element is Extract<CanvasElement, { type: "envelope" }> => element.type === "envelope",
  );
  for (const envelope of envelopes) {
    ctx.save();
    ctx.fillStyle = envelope.fill;
    drawEnvelopePath(ctx, envelope);
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = envelope.stroke;
    if (envelope.strokeStyle === "dashed") {
      ctx.setLineDash([10, 6]);
    } else if (envelope.strokeStyle === "dotted") {
      ctx.setLineDash([2, 5]);
    } else {
      ctx.setLineDash([]);
    }
    drawEnvelopePath(ctx, envelope);
    ctx.stroke();
    ctx.setLineDash([]);

    const titleRect = getEnvelopeTitleRect(envelope);
    const fontWeight = envelope.bold ? 700 : 500;
    const fontStyle = envelope.italic ? "italic" : "normal";
    const fontSize = envelope.fontSize ?? 18;
    const fontFamily = envelope.fontFamily ?? "system-ui";
    ctx.fillStyle = envelope.fill;
    drawRoundedRect(ctx, titleRect.x, titleRect.y, titleRect.width, titleRect.height, 8);
    ctx.fill();
    ctx.strokeStyle = envelope.stroke;
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, titleRect.x, titleRect.y, titleRect.width, titleRect.height, 8);
    ctx.stroke();

    ctx.fillStyle = envelope.textColor ?? "#0f172a";
    ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    drawWrappedText(
      ctx,
      envelope.text ?? "Enveloppe",
      titleRect.x + 8,
      titleRect.y + 6,
      Math.max(20, titleRect.width - 16),
      Math.max(24, titleRect.height - 10),
      fontSize * (envelope.lineHeight ?? 1.2),
      envelope.textAlign ?? "right",
      envelope.textVerticalAlign ?? "top",
      envelope.underline ?? false,
      envelope.letterSpacing ?? 0,
      envelope.textTransform ?? "none",
    );
    ctx.restore();
  }

  for (const element of canvasStore.state.elements) {
    if (element.type === "envelope") continue;
    renderCanvasElement(ctx, element, {
      getNoteFontSize,
      drawRoundedRect,
      drawWrappedText,
      drawImageElement,
      getLinePathPoints,
    });
  }

  const hasEditableLineSelection = selectedElements.value.some(
    (element) => element.type === "line" && !element.locked,
  );
  if (canvasStore.state.tool === "line" || lineDrawing || lineEndpointDrag || hasEditableLineSelection) {
    drawLineAnchorTargets(ctx);
  }

  if (hoveredElementId.value) {
    const hovered = canvasStore.state.elements.find((element) => element.id === hoveredElementId.value);
    if (hovered && hovered.type !== "envelope") {
      const count = getEnvelopeMembershipCount(hovered.id);
      if (count > 0) {
        drawMembershipIndicator(ctx, hovered, count);
      }
    }
  }

  drawRemoteSelections(ctx);
  drawElementLocks(ctx);
  drawRemotePresenceCursors(ctx);
  drawAlignmentGuides(ctx, alignmentGuides.value);

  const bounds = getSelectionBounds(selectedElements.value);
  const hasLineSelection = selectedElements.value.some((element) => element.type === "line");
  const hasEnvelopeSelection = selectedElements.value.some((element) => element.type === "envelope");
  if (bounds && !hasLineSelection) {
    if (!hasEnvelopeSelection && selectedElements.value.every((element) => element.type !== "line")) {
      drawResizeHandles(ctx, bounds);
    }
  }
  if (selectedElements.value.length > 1) {
    drawPerElementHandles(ctx, selectedElements.value);
  } else if (selectedElements.value.length === 1 && selectedElements.value[0]?.type === "line") {
    drawLineEndpointHandles(ctx, selectedElements.value[0]);
  }

  if (marqueeSelection) {
    const marqueeRect = normalizeRect(
      marqueeSelection.startX,
      marqueeSelection.startY,
      marqueeSelection.currentX,
      marqueeSelection.currentY,
    );
    drawMarquee(ctx, marqueeRect);
  }
  if (envelopeDrawing) {
    const envelopeRect = normalizeRect(
      envelopeDrawing.startX,
      envelopeDrawing.startY,
      envelopeDrawing.currentX,
      envelopeDrawing.currentY,
    );
    drawMarquee(ctx, envelopeRect);
  }
}

function beginPan(clientX: number, clientY: number) {
  isPanning = true;
  updateCanvasCursor("grabbing");
  pointerStartX = clientX;
  pointerStartY = clientY;
  panStartX = canvasStore.state.viewport.x;
  panStartY = canvasStore.state.viewport.y;
}

function openTextEditor(element: CanvasElement) {
  if (element.locked) return;
  if (element.type !== "text" && element.type !== "note" && element.type !== "envelope") return;
  const bounds = element.type === "envelope" ? getEnvelopeTitleRect(element) : getElementRect(element);

  textEditor.value = {
    id: element.id,
    type: element.type,
    x: element.x,
    y: element.y,
    width: bounds.width,
    height: bounds.height,
    fontSize: element.fontSize ?? (element.type === "note" ? getNoteFontSize(element.width) : 20),
    textColor:
      element.type === "note" || element.type === "envelope"
        ? (element.textColor ?? "#1f2937")
        : element.fill,
    fontFamily: element.fontFamily ?? "system-ui",
    textAlign: element.textAlign ?? "left",
    textVerticalAlign: element.textVerticalAlign ?? "top",
    bold: element.bold ?? false,
    italic: element.italic ?? false,
    underline: element.underline ?? false,
    lineHeight: element.lineHeight ?? (element.type === "note" ? 1.3 : 1.2),
    letterSpacing: element.letterSpacing ?? 0,
    textTransform: element.textTransform ?? "none",
    text: element.text ?? "",
  };

  canvasStore.updatePresenceEditing(element.id);
  canvasStore.beginInteraction();

  nextTick(() => {
    editorRef.value?.focus();
    editorRef.value?.select();
  });
}

function closeTextEditor(save: boolean) {
  const editor = textEditor.value;
  if (!editor) return;

  if (save) {
    canvasStore.updateText(
      editor.id,
      editor.text.trim() || (editor.type === "envelope" ? "Enveloppe" : "Note"),
      false,
    );
    canvasStore.commitInteraction();
  } else {
    canvasStore.cancelInteraction();
  }

  canvasStore.updatePresenceEditing(null);
  textEditor.value = null;
}

function onEditorInput() {
  const editor = textEditor.value;
  if (!editor || editor.type !== "note") return;

  const nextSide = getRequiredNoteSide(
    editor.text,
    editor.width,
    editor.fontSize,
    editor.lineHeight,
    editor.letterSpacing,
    editor.textTransform,
    editor.fontFamily,
    editor.bold,
    editor.italic,
  );
  if (nextSide <= editor.width) return;

  editor.width = nextSide;
  editor.height = nextSide;

  canvasStore.updateElementSize(editor.id, nextSide, nextSide, editor.x, editor.y, undefined, false);
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function openContextMenu(
  target: "canvas" | "element",
  clientX: number,
  clientY: number,
  worldX: number,
  worldY: number,
  elementId: string | null = null,
  elementType: CanvasElement["type"] | null = null,
  elementLocked = false,
) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  contextMenu.value = {
    visible: true,
    target,
    x: clientX - rect.left,
    y: clientY - rect.top,
    worldX,
    worldY,
    elementId,
    elementType,
    elementLocked,
  };
}

function applyFillColor(color: string) {
  canvasStore.updateSelectedFill(color);
  closeContextMenu();
}

function applyShadowType(shadowType: ShadowType) {
  canvasStore.updateSelectedShadowType(shadowType);
  closeContextMenu();
}

function applyStrokeColor(color: string) {
  canvasStore.updateSelectedStroke(color);
  closeContextMenu();
}

function applyStrokeStyle(style: StrokeStyle) {
  canvasStore.updateSelectedStrokeStyle(style);
  canvasStore.updateSelectedLineStyle(style);
  closeContextMenu();
}

function applyTheme(fill: string, stroke: string) {
  canvasStore.updateSelectedTheme(fill, stroke);
  closeContextMenu();
}

function applyNoteTextColor(color: string) {
  canvasStore.updateSelectedNoteTextColor(color);
  closeContextMenu();
}

function onFillPickerInput(event: Event) {
  const target = event.target as HTMLInputElement;
  applyFillColor(target.value);
}

function onStrokePickerInput(event: Event) {
  const target = event.target as HTMLInputElement;
  applyStrokeColor(target.value);
}

function onNoteTextPickerInput(event: Event) {
  const target = event.target as HTMLInputElement;
  applyNoteTextColor(target.value);
}

function applyLineStyle(style: LineStyle) {
  canvasStore.updateSelectedLineStyle(style);
  closeContextMenu();
}

function applyLineRoute(route: LineRoute) {
  canvasStore.updateSelectedLineRoute(route);
  closeContextMenu();
}

function applyLineArrow(arrow: LineArrow) {
  canvasStore.updateSelectedLineArrow(arrow);
  closeContextMenu();
}

function applyLineArrowStyle(style: LineArrowStyle) {
  canvasStore.updateSelectedLineArrowStyle(style);
  closeContextMenu();
}

function applyLineLabelFromInput(event: Event) {
  const target = event.target as HTMLInputElement;
  canvasStore.updateSelectedLineLabel(target.value);
}

function applyLineLabelSize(event: Event) {
  const target = event.target as HTMLSelectElement;
  canvasStore.updateSelectedLineLabelSize(Number(target.value));
}

function applyLineLabelColor(color: string) {
  canvasStore.updateSelectedLineLabelColor(color);
}

function applyLineLabelBg(color: string) {
  canvasStore.updateSelectedLineLabelBg(color);
}

function onLineLabelColorPickerInput(event: Event) {
  const target = event.target as HTMLInputElement;
  applyLineLabelColor(target.value);
}

function onLineLabelBgPickerInput(event: Event) {
  const target = event.target as HTMLInputElement;
  applyLineLabelBg(target.value);
}

function applyLineWidth(strokeWidth: number) {
  canvasStore.updateSelectedLineWidth(strokeWidth);
  closeContextMenu();
}

function applyEnvelopeType(envelopeType: EnvelopeType) {
  canvasStore.updateSelectedEnvelopeType(envelopeType);
  closeContextMenu();
}

function applyTextFontFamily(fontFamily: string) {
  canvasStore.updateSelectedTextFontFamily(fontFamily);
}

function applyTextAlign(textAlign: TextAlign) {
  canvasStore.updateSelectedTextAlign(textAlign);
}

function applyTextVerticalAlign(textVerticalAlign: TextVerticalAlign) {
  canvasStore.updateSelectedTextVerticalAlign(textVerticalAlign);
}

function toggleTextBold() {
  canvasStore.updateSelectedTextBold(!(selectedTextStyle.value?.bold ?? false));
}

function toggleTextItalic() {
  canvasStore.updateSelectedTextItalic(!(selectedTextStyle.value?.italic ?? false));
}

function toggleTextUnderline() {
  canvasStore.updateSelectedTextUnderline(!(selectedTextStyle.value?.underline ?? false));
}

function applyTextFontSize(event: Event) {
  const target = event.target as HTMLSelectElement;
  canvasStore.updateSelectedTextFontSize(Number(target.value));
}

function applyTextFontFamilyFromSelect(event: Event) {
  const target = event.target as HTMLSelectElement;
  applyTextFontFamily(target.value);
}

function applyTextLineHeight(event: Event) {
  const target = event.target as HTMLSelectElement;
  canvasStore.updateSelectedTextLineHeight(Number(target.value));
}

function applyTextLetterSpacing(event: Event) {
  const target = event.target as HTMLSelectElement;
  canvasStore.updateSelectedTextLetterSpacing(Number(target.value));
}

function setTextTransform(textTransform: TextTransformMode) {
  canvasStore.updateSelectedTextTransform(textTransform);
}

function duplicateFromContext() {
  canvasStore.duplicateSelected();
  closeContextMenu();
}

function copyFromContext() {
  canvasStore.copySelected();
  closeContextMenu();
}

function pasteFromContext() {
  const x = maybeSnap(contextMenu.value.worldX);
  const y = maybeSnap(contextMenu.value.worldY);
  canvasStore.pasteAt(x, y);
  closeContextMenu();
}

function deleteFromContext() {
  canvasStore.deleteSelected();
  closeContextMenu();
}

function toggleLockFromContext() {
  if (isLockedContext.value) {
    canvasStore.unlockSelected();
  } else {
    canvasStore.lockSelected();
  }
  closeContextMenu();
}

function bringToFrontFromContext() {
  canvasStore.bringSelectedToFront();
  closeContextMenu();
}

function bringForwardFromContext() {
  canvasStore.bringSelectedForward();
  closeContextMenu();
}

function sendBackwardFromContext() {
  canvasStore.sendSelectedBackward();
  closeContextMenu();
}

function sendToBackFromContext() {
  canvasStore.sendSelectedToBack();
  closeContextMenu();
}

function excludeFromEnvelopeFromContext() {
  if (isLockedContext.value || !canExcludeFromEnvelope.value) return;

  const candidates = canvasStore.state.elements.filter((element) => {
    if (!canvasStore.state.selectedIds.includes(element.id)) return false;
    if (element.locked || element.type === "envelope") return false;
    return contextElementEnvelopes.value.some((envelope) => envelope.memberIds.includes(element.id));
  });
  if (candidates.length === 0) {
    closeContextMenu();
    return;
  }

  canvasStore.beginInteraction();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!candidate) continue;

    const containing = contextElementEnvelopes.value.find((envelope) => envelope.memberIds.includes(candidate.id));
    if (!containing) continue;

    canvasStore.removeMembersFromEnvelope(containing.id, [candidate.id], false);
    const envelopeRect = getEnvelopeBounds(containing);
    const elementRect = getElementRect(candidate);
    const targetX = envelopeRect.x + envelopeRect.width + 24 + index * 18;
    const targetY = elementRect.y;
    canvasStore.updateElementPosition(candidate.id, maybeSnap(targetX), maybeSnap(targetY), false);
  }
  canvasStore.commitInteraction();
  closeContextMenu();
}

async function createFromContext(type: ElementType) {
  const x = maybeSnap(contextMenu.value.worldX);
  const y = maybeSnap(contextMenu.value.worldY);
  if (type === "image") {
    const payload = await promptImageUpload();
    if (!payload) {
      closeContextMenu();
      return;
    }
    canvasStore.addImage(x, y, payload.src, payload.width, payload.height);
    canvasStore.setTool("select");
    closeContextMenu();
    return;
  }
  if (type === "envelope") {
    canvasStore.setTool("envelope");
    closeContextMenu();
    return;
  }
  if (type === "line") {
    canvasStore.setTool("line");
    closeContextMenu();
    return;
  }
  canvasStore.createElement(type, x, y);
  canvasStore.setTool("select");
  closeContextMenu();
}

function toggleGridFromContext() {
  canvasStore.toggleGrid();
  closeContextMenu();
}

function toggleSnapFromContext() {
  canvasStore.toggleSnapToGrid();
  closeContextMenu();
}

function selectAllFromContext() {
  canvasStore.selectAll();
  closeContextMenu();
}

function applyAlignment(
  mode: "left" | "hCenter" | "right" | "top" | "vCenter" | "bottom",
) {
  const items = multiSelectionElements.value;
  if (items.length < 2) return;
  const rectEntries = items.map((element) => ({ element, rect: getElementRect(element) }));
  const bounds = getRectsBounds(rectEntries.map((entry) => entry.rect));
  if (!bounds) return;

  canvasStore.beginInteraction();
  for (const entry of rectEntries) {
    let nextX = entry.element.x;
    let nextY = entry.element.y;

    if (mode === "left") {
      nextX += bounds.x - entry.rect.x;
    } else if (mode === "hCenter") {
      nextX += bounds.x + bounds.width / 2 - (entry.rect.x + entry.rect.width / 2);
    } else if (mode === "right") {
      nextX += bounds.x + bounds.width - (entry.rect.x + entry.rect.width);
    } else if (mode === "top") {
      nextY += bounds.y - entry.rect.y;
    } else if (mode === "vCenter") {
      nextY += bounds.y + bounds.height / 2 - (entry.rect.y + entry.rect.height / 2);
    } else {
      nextY += bounds.y + bounds.height - (entry.rect.y + entry.rect.height);
    }

    canvasStore.updateElementPosition(
      entry.element.id,
      maybeSnap(nextX),
      maybeSnap(nextY),
      false,
    );
  }
  canvasStore.commitInteraction();
  closeContextMenu();
}

function applyDistribution(mode: "horizontal" | "vertical") {
  const items = multiSelectionElements.value;
  if (items.length < 3) return;
  const entries = items.map((element) => ({ element, rect: getElementRect(element) }));
  const sorted = [...entries].sort((a, b) =>
    mode === "horizontal"
      ? a.rect.x + a.rect.width / 2 - (b.rect.x + b.rect.width / 2)
      : a.rect.y + a.rect.height / 2 - (b.rect.y + b.rect.height / 2),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return;

  const firstCenter = mode === "horizontal" ? first.rect.x + first.rect.width / 2 : first.rect.y + first.rect.height / 2;
  const lastCenter = mode === "horizontal" ? last.rect.x + last.rect.width / 2 : last.rect.y + last.rect.height / 2;
  const step = (lastCenter - firstCenter) / (sorted.length - 1);

  canvasStore.beginInteraction();
  for (let index = 1; index < sorted.length - 1; index += 1) {
    const entry = sorted[index];
    if (!entry) continue;
    const targetCenter = firstCenter + step * index;
    const currentCenter =
      mode === "horizontal"
        ? entry.rect.x + entry.rect.width / 2
        : entry.rect.y + entry.rect.height / 2;
    const delta = targetCenter - currentCenter;
    const nextX = mode === "horizontal" ? entry.element.x + delta : entry.element.x;
    const nextY = mode === "vertical" ? entry.element.y + delta : entry.element.y;
    canvasStore.updateElementPosition(entry.element.id, maybeSnap(nextX), maybeSnap(nextY), false);
  }
  canvasStore.commitInteraction();
  closeContextMenu();
}

function getContextActionLabel(action: ContextMenuActionDefinition) {
  if (action.id === "duplicate") return "Dupliquer";
  if (action.id === "copy") return "Copier";
  if (action.id === "paste") return "Coller";
  if (action.id === "delete") return "Supprimer";
  if (action.id === "toggleLock") {
    return isLockedContext.value ? "Déverrouiller" : "Verrouiller";
  }
  if (action.id === "toggleGrid") {
    return `Grid: ${canvasStore.state.showGrid ? "On" : "Off"}`;
  }
  if (action.id === "toggleSnap") {
    return `Snap to grid: ${canvasStore.state.snapToGrid ? "On" : "Off"}`;
  }
  return "Select all";
}

function isContextActionDisabled(action: ContextMenuActionDefinition) {
  if (action.target === "element" && isLockedContext.value && action.id !== "toggleLock") return true;
  if (action.id === "paste") return !canvasStore.hasClipboard();
  if (action.id === "toggleSnap") return !canvasStore.state.showGrid;
  return false;
}

function getContextActionIcon(action: ContextMenuActionDefinition) {
  if (action.id === "duplicate") return "clone";
  if (action.id === "copy") return "copy";
  if (action.id === "paste") return "paste";
  if (action.id === "delete") return "trash";
  if (action.id === "toggleLock") return isLockedContext.value ? "lock-open" : "lock";
  if (action.id === "toggleGrid") return "table-cells-large";
  if (action.id === "toggleSnap") return "magnet";
  return "object-group";
}

function runContextAction(action: ContextMenuActionDefinition) {
  if (action.id === "duplicate") {
    duplicateFromContext();
    return;
  }
  if (action.id === "copy") {
    copyFromContext();
    return;
  }
  if (action.id === "paste") {
    pasteFromContext();
    return;
  }
  if (action.id === "delete") {
    deleteFromContext();
    return;
  }
  if (action.id === "toggleLock") {
    toggleLockFromContext();
    return;
  }
  if (action.id === "toggleGrid") {
    toggleGridFromContext();
    return;
  }
  if (action.id === "toggleSnap") {
    toggleSnapFromContext();
    return;
  }
  selectAllFromContext();
}

function getDragIdsWithEnvelopeMembers(ids: string[]) {
  const queue = [...ids];
  const expanded = new Set<string>(ids);

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    const element = canvasStore.state.elements.find((item) => item.id === id);
    if (!element || element.type !== "envelope") continue;

    for (const memberId of element.memberIds) {
      const member = canvasStore.state.elements.find((item) => item.id === memberId);
      if (!member || member.locked || member.type === "envelope") continue;
      if (expanded.has(memberId)) continue;
      expanded.add(memberId);
      queue.push(memberId);
    }
  }

  return Array.from(expanded);
}

function updateEnvelopeMembershipAfterDrag(draggedPrimaryIds: string[]) {
  const movedElementIds = draggedPrimaryIds.filter((id) => {
    const element = canvasStore.state.elements.find((item) => item.id === id);
    return !!element && element.type !== "envelope";
  });
  if (movedElementIds.length === 0) return;

  const envelopes = canvasStore.state.elements.filter(
    (element): element is Extract<CanvasElement, { type: "envelope" }> => element.type === "envelope" && !element.locked,
  );
  if (envelopes.length === 0) return;

  for (const movedId of movedElementIds) {
    const moved = canvasStore.state.elements.find((element) => element.id === movedId);
    if (!moved || moved.type === "envelope") continue;
    const center = getMemberCenter(moved);

    for (const envelope of envelopes) {
      const isMember = envelope.memberIds.includes(moved.id);
      const inside = isPointInsideEnvelope(center.x, center.y, envelope);
      if (inside && !isMember) {
        canvasStore.addMembersToEnvelope(envelope.id, [moved.id]);
      }
    }
  }
}

function startDraggingSelection(ids: string[], worldX: number, worldY: number) {
  const expandedIds = getDragIdsWithEnvelopeMembers(ids).filter((id) => {
    const element = canvasStore.state.elements.find((item) => item.id === id);
    return !!element && !element.locked;
  });
  if (expandedIds.length === 0) return;

  const startPositions: Record<string, { x: number; y: number }> = {};
  const startRects: Record<string, Rect> = {};
  for (const id of expandedIds) {
    const element = canvasStore.state.elements.find((item) => item.id === id);
    if (!element) continue;
    startPositions[id] = { x: element.x, y: element.y };
    startRects[id] = getElementRect(element);
  }

  draggingSelection = {
    ids: expandedIds,
    primaryIds: [...ids],
    startPointerX: worldX,
    startPointerY: worldY,
    startPositions,
    startRects,
  };

  alignmentGuides.value = [];
  canvasStore.beginInteraction();
}

function startResizingSelection(handle: ResizeHandle, worldX: number, worldY: number) {
  const ids = [...canvasStore.state.selectedIds];
  if (ids.length === 0) return;

  const selected = canvasStore.state.elements.filter((el) => ids.includes(el.id));
  const bounds = getSelectionBounds(selected);
  if (!bounds) return;

  const startRects: Record<string, Rect> = {};
  const startFontSizes: Record<string, number> = {};
  const startTypes: Record<string, CanvasElement["type"]> = {};
  const startTexts: Record<string, string> = {};

  for (const element of selected) {
    startRects[element.id] = getElementRect(element);
    startFontSizes[element.id] = element.type === "text" ? (element.fontSize ?? 20) : 20;
    startTypes[element.id] = element.type;
    startTexts[element.id] =
      element.type === "text" || element.type === "note" || element.type === "envelope"
        ? element.text
        : "";
  }

  resizingSelection = {
    ids,
    handle,
    startPointerX: worldX,
    startPointerY: worldY,
    startBounds: bounds,
    startRects,
    startFontSizes,
    startTypes,
    startTexts,
  };

  canvasStore.beginInteraction();
}

async function onPointerDown(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  setHoveredElement(null);
  setHoveredLineAnchor(null);
  closeContextMenu();

  if (textEditor.value) {
    closeTextEditor(true);
  }

  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const world = screenToWorld(sx, sy);
  if (!draggingSelection && alignmentGuides.value.length > 0) {
    alignmentGuides.value = [];
  }
  if (canvasStore.state.tool !== "line" && !lineDrawing && !lineEndpointDrag) {
    setHoveredLineAnchor(null);
  }

  if (canvasStore.state.tool === "image") {
    if (event.button !== 0) {
      return;
    }
    const payload = await promptImageUpload();
    if (payload) {
      canvasStore.addImage(maybeSnap(world.x), maybeSnap(world.y), payload.src, payload.width, payload.height);
    }
    canvasStore.setTool("select");
    return;
  }

  canvas.setPointerCapture(event.pointerId);

  if (event.button === 1 || spacePressed) {
    beginPan(event.clientX, event.clientY);
    return;
  }

  if (canvasStore.state.tool === "rectangle") {
    canvasStore.addRectangle(maybeSnap(world.x), maybeSnap(world.y), 220, 130);
    canvasStore.setTool("select");
    return;
  }

  if (canvasStore.state.tool === "text") {
    canvasStore.addText(maybeSnap(world.x), maybeSnap(world.y));
    canvasStore.setTool("select");

    const nextSelected = canvasStore.selectedElement.value;
    if (nextSelected && nextSelected.type === "text") {
      openTextEditor(nextSelected);
    }
    return;
  }

  if (canvasStore.state.tool === "note") {
    canvasStore.addNote(maybeSnap(world.x), maybeSnap(world.y));
    canvasStore.setTool("select");

    const nextSelected = canvasStore.selectedElement.value;
    if (nextSelected && nextSelected.type === "note") {
      openTextEditor(nextSelected);
    }
    return;
  }

  if (canvasStore.state.tool === "line") {
    const startAnchor = getClosestAnchor(world.x, world.y);
    const startX = maybeSnap(startAnchor?.x ?? world.x);
    const startY = maybeSnap(startAnchor?.y ?? world.y);
    canvasStore.beginInteraction();
    canvasStore.addLine(startX, startY, startX, startY, "solid", false);
    const created = canvasStore.selectedElement.value;
    if (created && created.type === "line") {
      if (startAnchor) {
        canvasStore.updateLineStartAnchor(
          created.id,
          { elementId: startAnchor.elementId, position: startAnchor.position },
          false,
        );
      }
      lineDrawing = {
        id: created.id,
        startAnchor: startAnchor ? { elementId: startAnchor.elementId, position: startAnchor.position } : null,
        endAnchor: null,
      };
      updateCanvasCursor("crosshair");
      return;
    }
  }

  if (canvasStore.state.tool === "envelope") {
    if (event.button !== 0) return;
    envelopeDrawing = {
      startX: world.x,
      startY: world.y,
      currentX: world.x,
      currentY: world.y,
    };
    updateCanvasCursor("crosshair");
    return;
  }

  const titleHit = getEnvelopeTitleAt(world.x, world.y);
  if (titleHit && canvasStore.state.tool === "select") {
    if (!canvasStore.isSelected(titleHit.id)) {
      canvasStore.setSelected(titleHit.id);
    }
    if (titleHit.locked || isLockedByRemote(titleHit.id)) {
      if (isLockedByRemote(titleHit.id)) {
        notifyLockedByRemote(titleHit.id);
      }
      return;
    }
    envelopeTitleDrag = {
      id: titleHit.id,
      startPointerX: world.x,
      startPointerY: world.y,
      startOffsetX: titleHit.titleOffsetX ?? 8,
      startOffsetY: titleHit.titleOffsetY ?? -30,
    };
    canvasStore.beginInteraction();
    updateCanvasCursor("move");
    return;
  }

  const lineEndpoint = getLineEndpointAt(world.x, world.y);
  if (lineEndpoint) {
    if (isLockedByRemote(lineEndpoint.id)) {
      notifyLockedByRemote(lineEndpoint.id);
      return;
    }
    lineEndpointDrag = lineEndpoint;
    canvasStore.beginInteraction();
    updateCanvasCursor("crosshair");
    return;
  }

  const selectionBounds = getSelectionBounds(selectedElements.value);
  const hasLockedSelection = selectedElements.value.some((element) => element.locked);
  const hasNonResizableSelection = selectedElements.value.some(
    (element) => element.type === "line" || element.type === "envelope",
  );
  if (selectionBounds && !hasLockedSelection && !hasNonResizableSelection) {
    const handle = getResizeHandleAt(world.x, world.y, selectionBounds);
    if (handle) {
      startResizingSelection(handle, world.x, world.y);
      return;
    }
  }

  const hit = hitTest(world.x, world.y);
  if (hit) {
    if (event.shiftKey) {
      canvasStore.toggleSelected(hit.id);
      return;
    }

    if (!canvasStore.isSelected(hit.id)) {
      canvasStore.setSelected(hit.id);
    }

    if (hit.locked || isLockedByRemote(hit.id)) {
      if (isLockedByRemote(hit.id)) {
        notifyLockedByRemote(hit.id);
      }
      return;
    }

    const ids =
      canvasStore.state.selectedIds.length > 0
        ? canvasStore.state.selectedIds.filter((id) => {
            const element = canvasStore.state.elements.find((item) => item.id === id);
            return !!element && !element.locked;
          })
        : [hit.id];
    if (ids.length === 0) return;
    startDraggingSelection(ids, world.x, world.y);
    return;
  }

  marqueeSelection = {
    startX: world.x,
    startY: world.y,
    currentX: world.x,
    currentY: world.y,
    additive: event.shiftKey,
    baseIds: [...canvasStore.state.selectedIds],
  };

  if (!event.shiftKey) {
    canvasStore.clearSelection();
  }
}

function resizeSelectionFromHandle(worldX: number, worldY: number) {
  if (!resizingSelection) return;

  const minWidth = 20;
  const minHeight = 20;
  const start = resizingSelection.startBounds;
  const right = start.x + start.width;
  const bottom = start.y + start.height;

  let nextX = start.x;
  let nextY = start.y;
  let nextWidth = start.width;
  let nextHeight = start.height;

  if (resizingSelection.handle === "nw") {
    nextX = Math.min(worldX, right - minWidth);
    nextY = Math.min(worldY, bottom - minHeight);
    nextWidth = right - nextX;
    nextHeight = bottom - nextY;
  }

  if (resizingSelection.handle === "ne") {
    const nextRight = Math.max(worldX, start.x + minWidth);
    nextY = Math.min(worldY, bottom - minHeight);
    nextX = start.x;
    nextWidth = nextRight - start.x;
    nextHeight = bottom - nextY;
  }

  if (resizingSelection.handle === "sw") {
    nextX = Math.min(worldX, right - minWidth);
    const nextBottom = Math.max(worldY, start.y + minHeight);
    nextY = start.y;
    nextWidth = right - nextX;
    nextHeight = nextBottom - start.y;
  }

  if (resizingSelection.handle === "se") {
    const nextRight = Math.max(worldX, start.x + minWidth);
    const nextBottom = Math.max(worldY, start.y + minHeight);
    nextX = start.x;
    nextY = start.y;
    nextWidth = nextRight - start.x;
    nextHeight = nextBottom - start.y;
  }

  const snappedGroup = maybeSnapRect({
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight,
  });
  nextX = snappedGroup.x;
  nextY = snappedGroup.y;
  nextWidth = snappedGroup.width;
  nextHeight = snappedGroup.height;

  const scaleX = nextWidth / Math.max(1, start.width);
  const scaleY = nextHeight / Math.max(1, start.height);

  for (const id of resizingSelection.ids) {
    const initialRect = resizingSelection.startRects[id];
    if (!initialRect) continue;

    const elementType = resizingSelection.startTypes[id];
    const startFont = resizingSelection.startFontSizes[id] ?? 20;
    const startText = resizingSelection.startTexts[id] ?? "";

    let elementNextX = nextX + (initialRect.x - start.x) * scaleX;
    let elementNextY = nextY + (initialRect.y - start.y) * scaleY;
    let elementNextWidth = Math.max(8, initialRect.width * scaleX);
    let elementNextHeight = Math.max(8, initialRect.height * scaleY);
    let elementNextFontSize: number | undefined;

    if (elementType === "text") {
      const fontScale = (scaleX + scaleY) / 2;
      elementNextFontSize = Math.max(10, Math.min(96, startFont * fontScale));
      const textBounds = getTextBoundsFromValues(startText || "Note", elementNextFontSize, elementNextWidth, elementNextHeight);
      elementNextWidth = textBounds.width;
      elementNextHeight = textBounds.height;
    }

    if (elementType === "note") {
      const side = Math.max(40, Math.max(elementNextWidth, elementNextHeight));
      elementNextWidth = side;
      elementNextHeight = side;
    }

    if (elementType === "image") {
      const ratio = Math.max(0.01, initialRect.width / Math.max(1, initialRect.height));
      let constrainedWidth = elementNextWidth;
      let constrainedHeight = constrainedWidth / ratio;

      if (constrainedHeight > elementNextHeight) {
        constrainedHeight = elementNextHeight;
        constrainedWidth = constrainedHeight * ratio;
      }

      const widthDiff = elementNextWidth - constrainedWidth;
      const heightDiff = elementNextHeight - constrainedHeight;

      if (resizingSelection.handle === "nw") {
        elementNextX += widthDiff;
        elementNextY += heightDiff;
      } else if (resizingSelection.handle === "ne") {
        elementNextY += heightDiff;
      } else if (resizingSelection.handle === "sw") {
        elementNextX += widthDiff;
      }

      elementNextWidth = Math.max(8, constrainedWidth);
      elementNextHeight = Math.max(8, constrainedHeight);
    }

    canvasStore.updateElementSize(
      id,
      elementNextWidth,
      elementNextHeight,
      elementNextX,
      elementNextY,
      elementNextFontSize,
      false,
    );
  }
}

function updateMarqueeSelection() {
  if (!marqueeSelection) return;

  const selectionRect = normalizeRect(
    marqueeSelection.startX,
    marqueeSelection.startY,
    marqueeSelection.currentX,
    marqueeSelection.currentY,
  );

  const ids = canvasStore.state.elements
    .filter((element) => rectsIntersect(getElementRect(element), selectionRect))
    .map((element) => element.id);

  if (marqueeSelection.additive) {
    const merged = new Set([...marqueeSelection.baseIds, ...ids]);
    canvasStore.setSelectedMany(Array.from(merged));
    return;
  }

  canvasStore.setSelectedMany(ids);
}

function onPointerMove(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const world = screenToWorld(sx, sy);
  publishPresenceCursor(world.x, world.y);

  if (isPanning) {
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    const dx = event.clientX - pointerStartX;
    const dy = event.clientY - pointerStartY;
    canvasStore.setViewportPosition(panStartX + dx, panStartY + dy);
    updateCanvasCursor("grabbing");
    return;
  }

  if (resizingSelection) {
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    resizeSelectionFromHandle(world.x, world.y);
    updateCanvasCursor(getCursorForHandle(resizingSelection.handle));
    return;
  }

  if (lineDrawing) {
    setHoveredElement(null);
    const endAnchor = getClosestAnchor(world.x, world.y);
    setHoveredLineAnchor(endAnchor ? { elementId: endAnchor.elementId, position: endAnchor.position } : null);
    const endX = maybeSnap(endAnchor?.x ?? world.x);
    const endY = maybeSnap(endAnchor?.y ?? world.y);
    canvasStore.updateLineEnd(lineDrawing.id, endX, endY, false);
    canvasStore.updateLineEndAnchor(
      lineDrawing.id,
      endAnchor ? { elementId: endAnchor.elementId, position: endAnchor.position } : null,
      false,
    );
    lineDrawing.endAnchor = endAnchor
      ? { elementId: endAnchor.elementId, position: endAnchor.position }
      : null;
    updateCanvasCursor("crosshair");
    return;
  }

  if (lineEndpointDrag) {
    setHoveredElement(null);
    const endpointAnchor = getClosestAnchor(world.x, world.y);
    setHoveredLineAnchor(
      endpointAnchor ? { elementId: endpointAnchor.elementId, position: endpointAnchor.position } : null,
    );
    const endX = maybeSnap(endpointAnchor?.x ?? world.x);
    const endY = maybeSnap(endpointAnchor?.y ?? world.y);
    if (lineEndpointDrag.endpoint === "start") {
      canvasStore.updateLineStart(lineEndpointDrag.id, endX, endY, false);
      canvasStore.updateLineStartAnchor(
        lineEndpointDrag.id,
        endpointAnchor
          ? { elementId: endpointAnchor.elementId, position: endpointAnchor.position }
          : null,
        false,
      );
    } else {
      canvasStore.updateLineEnd(lineEndpointDrag.id, endX, endY, false);
      canvasStore.updateLineEndAnchor(
        lineEndpointDrag.id,
        endpointAnchor
          ? { elementId: endpointAnchor.elementId, position: endpointAnchor.position }
          : null,
        false,
      );
    }
    updateCanvasCursor("crosshair");
    return;
  }

  if (envelopeTitleDrag) {
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    const dx = world.x - envelopeTitleDrag.startPointerX;
    const dy = world.y - envelopeTitleDrag.startPointerY;
    canvasStore.updateEnvelopeTitleOffset(
      envelopeTitleDrag.id,
      envelopeTitleDrag.startOffsetX + dx,
      envelopeTitleDrag.startOffsetY + dy,
      false,
    );
    updateCanvasCursor("move");
    return;
  }

  if (draggingSelection) {
    const drag = draggingSelection;
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    const rawDx = world.x - drag.startPointerX;
    const rawDy = world.y - drag.startPointerY;
    let dx = rawDx;
    let dy = rawDy;

    if (!canvasStore.state.snapToGrid) {
      const movingRects = drag.ids
        .map((id) => drag.startRects[id])
        .filter((rect): rect is Rect => !!rect)
        .map((rect) => ({ ...rect, x: rect.x + rawDx, y: rect.y + rawDy }));
      const movingBounds = getRectsBounds(movingRects);
      const staticRects = canvasStore.state.elements
        .filter((element) => !drag.ids.includes(element.id))
        .map((element) => getElementRect(element));
      if (movingBounds && staticRects.length > 0) {
        const snap = computeAlignmentSnap(movingBounds, staticRects);
        dx += snap.deltaX;
        dy += snap.deltaY;
        alignmentGuides.value = snap.guides;
      } else {
        alignmentGuides.value = [];
      }
    } else {
      alignmentGuides.value = [];
    }

    for (const id of drag.ids) {
      const startPos = drag.startPositions[id];
      if (!startPos) continue;
      const nextPos = {
        x: startPos.x + dx,
        y: startPos.y + dy,
      };
      const snappedPos = canvasStore.state.snapToGrid
        ? { x: maybeSnap(nextPos.x), y: maybeSnap(nextPos.y) }
        : nextPos;

      canvasStore.updateElementPosition(id, snappedPos.x, snappedPos.y, false);
    }

    updateCanvasCursor("move");
    return;
  }

  if (marqueeSelection) {
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    marqueeSelection.currentX = world.x;
    marqueeSelection.currentY = world.y;
    updateMarqueeSelection();
    updateCanvasCursor("crosshair");
    return;
  }

  if (envelopeDrawing) {
    setHoveredElement(null);
    setHoveredLineAnchor(null);
    envelopeDrawing.currentX = world.x;
    envelopeDrawing.currentY = world.y;
    updateCanvasCursor("crosshair");
    render();
    return;
  }

  const bounds = getSelectionBounds(selectedElements.value);
  const hasLineSelection = selectedElements.value.some((element) => element.type === "line");
  const hasEnvelopeSelection = selectedElements.value.some((element) => element.type === "envelope");
  if (canvasStore.state.tool === "select") {
    const lineEndpoint = getLineEndpointAt(world.x, world.y);
    if (lineEndpoint) {
      updateCanvasCursor("crosshair");
      return;
    }
  }
  if (canvasStore.state.tool === "select" && bounds) {
    if (!hasLineSelection && !hasEnvelopeSelection) {
      const handle = getResizeHandleAt(world.x, world.y, bounds);
      if (handle) {
        updateCanvasCursor(getCursorForHandle(handle));
        return;
      }
    }
  }

  if (spacePressed) {
    updateCanvasCursor("grab");
    return;
  }

  const hit = hitTest(world.x, world.y);
  setHoveredElement(hit?.id ?? null);
  const titleHit = getEnvelopeTitleAt(world.x, world.y);
  if (!hit && titleHit) {
    setHoveredElement(titleHit.id);
  }
  if (titleHit && canvasStore.state.tool === "select") {
    updateCanvasCursor("move");
    return;
  }
  if (hit && canvasStore.state.tool === "select") {
    updateCanvasCursor("move");
    return;
  }

  if (canvasStore.state.tool === "line") {
    const hoveredAnchor = getClosestAnchor(world.x, world.y);
    setHoveredLineAnchor(
      hoveredAnchor ? { elementId: hoveredAnchor.elementId, position: hoveredAnchor.position } : null,
    );
    updateCanvasCursor("crosshair");
    return;
  }

  setHoveredLineAnchor(null);

  if (canvasStore.state.tool === "envelope") {
    updateCanvasCursor("crosshair");
    return;
  }

  if (canvasStore.state.tool === "image") {
    updateCanvasCursor("copy");
    return;
  }

  updateCanvasCursor("default");
}

function onPointerUp(event: PointerEvent) {
  if (isPanning) {
    isPanning = false;
  }

  if (resizingSelection) {
    canvasStore.commitInteraction();
    resizingSelection = null;
  }

  if (draggingSelection) {
    canvasStore.commitInteraction();
    updateEnvelopeMembershipAfterDrag(draggingSelection.primaryIds);
    draggingSelection = null;
  }
  alignmentGuides.value = [];

  if (lineDrawing) {
    const canvas = canvasRef.value;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const endAnchor = getClosestAnchor(world.x, world.y);
      if (endAnchor) {
        canvasStore.updateLineEnd(
          lineDrawing.id,
          maybeSnap(endAnchor.x),
          maybeSnap(endAnchor.y),
          false,
        );
        canvasStore.updateLineEndAnchor(
          lineDrawing.id,
          { elementId: endAnchor.elementId, position: endAnchor.position },
          false,
        );
        lineDrawing.endAnchor = { elementId: endAnchor.elementId, position: endAnchor.position };
      }
    }
    canvasStore.commitInteraction();
    lineDrawing = null;
    canvasStore.setTool("select");
  }

  if (lineEndpointDrag) {
    canvasStore.commitInteraction();
    lineEndpointDrag = null;
  }

  if (envelopeTitleDrag) {
    canvasStore.commitInteraction();
    envelopeTitleDrag = null;
  }

  if (marqueeSelection) {
    marqueeSelection = null;
  }

  if (envelopeDrawing) {
    const selectionRect = normalizeRect(
      envelopeDrawing.startX,
      envelopeDrawing.startY,
      envelopeDrawing.currentX,
      envelopeDrawing.currentY,
    );
    const memberIds = canvasStore.state.elements
      .filter((element) => element.type !== "envelope")
      .filter((element) => {
        const center = getMemberCenter(element);
        return (
          center.x >= selectionRect.x &&
          center.x <= selectionRect.x + selectionRect.width &&
          center.y >= selectionRect.y &&
          center.y <= selectionRect.y + selectionRect.height
        );
      })
      .map((element) => element.id);
    if (memberIds.length > 0) {
      canvasStore.addEnvelope(memberIds, "convex");
    }
    envelopeDrawing = null;
    canvasStore.setTool("select");
  }

  canvasRef.value?.releasePointerCapture(event.pointerId);
  setHoveredElement(null);
  setHoveredLineAnchor(null);
  updateCanvasCursor(spacePressed ? "grab" : "default");
  render();
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault();

  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const world = screenToWorld(sx, sy);
  const titleHit = getEnvelopeTitleAt(world.x, world.y);
  if (titleHit) {
    if (!canvasStore.isSelected(titleHit.id)) {
      canvasStore.setSelected(titleHit.id);
    }
    openContextMenu(
      "element",
      event.clientX,
      event.clientY,
      world.x,
      world.y,
      titleHit.id,
      "envelope",
      !!titleHit.locked || isLockedByRemote(titleHit.id),
    );
    return;
  }
  const hit = hitTest(world.x, world.y);

  if (hit) {
    if (!canvasStore.isSelected(hit.id)) {
      canvasStore.setSelected(hit.id);
    }
    openContextMenu(
      "element",
      event.clientX,
      event.clientY,
      world.x,
      world.y,
      hit.id,
      hit.type,
      !!hit.locked || isLockedByRemote(hit.id),
    );
    return;
  }

  openContextMenu("canvas", event.clientX, event.clientY, world.x, world.y);
}

function onDoubleClick(event: MouseEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  const world = screenToWorld(sx, sy);
  const titleHit = getEnvelopeTitleAt(world.x, world.y);
  if (titleHit && !titleHit.locked && !isLockedByRemote(titleHit.id)) {
    canvasStore.setSelected(titleHit.id);
    openTextEditor(titleHit);
    return;
  }
  if (titleHit && isLockedByRemote(titleHit.id)) {
    notifyLockedByRemote(titleHit.id);
    return;
  }
  const hit = hitTest(world.x, world.y);

  if (
    hit &&
    !hit.locked &&
    !isLockedByRemote(hit.id) &&
    (hit.type === "text" || hit.type === "note" || hit.type === "envelope")
  ) {
    canvasStore.setSelected(hit.id);
    openTextEditor(hit);
  }
  if (hit && isLockedByRemote(hit.id)) {
    notifyLockedByRemote(hit.id);
  }
}

function onWheel(event: WheelEvent) {
  event.preventDefault();
  closeContextMenu();

  const canvas = canvasRef.value;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;

  const factor = event.deltaY < 0 ? 1.1 : 0.9;
  canvasStore.zoomAt(canvasStore.state.viewport.zoom * factor, sx, sy);
}

function onKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isEditingText =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable === true;

  if (isEditingText) {
    return;
  }

  const isModifier = event.metaKey || event.ctrlKey;

  if (event.key === "Escape") {
    closeContextMenu();
  }

  if (event.code === "Space") {
    event.preventDefault();
    spacePressed = true;
    if (!isPanning) {
      updateCanvasCursor("grab");
    }
  }

  if (isModifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      canvasStore.redo();
    } else {
      canvasStore.undo();
    }
    return;
  }

  if (isModifier && event.key.toLowerCase() === "y") {
    event.preventDefault();
    canvasStore.redo();
    return;
  }

  if (event.key.toLowerCase() === "v") {
    canvasStore.setTool("select");
  }

  if (event.key.toLowerCase() === "r") {
    canvasStore.setTool("rectangle");
  }

  if (event.key.toLowerCase() === "t") {
    canvasStore.setTool("text");
  }

  if (event.key.toLowerCase() === "n") {
    canvasStore.setTool("note");
  }

  if (event.key.toLowerCase() === "l") {
    canvasStore.setTool("line");
  }

  if (event.key.toLowerCase() === "i") {
    canvasStore.setTool("image");
  }

  if (event.key.toLowerCase() === "e") {
    canvasStore.setTool("envelope");
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    canvasStore.deleteSelected();
  }
}

function onKeyUp(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const isEditingText =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable === true;

  if (isEditingText) {
    return;
  }

  if (event.code === "Space") {
    spacePressed = false;
    if (!isPanning) {
      updateCanvasCursor("default");
    }
  }
}

function onPointerLeave() {
  setHoveredElement(null);
  setHoveredLineAnchor(null);
  canvasStore.updatePresenceCursor(0, 0, false);
  if (!isPanning) {
    updateCanvasCursor("default");
  }
}

function onWindowPointerDown(event: PointerEvent) {
  if (!contextMenu.value.visible) return;
  const target = event.target as Node | null;
  if (menuRef.value && target && menuRef.value.contains(target)) return;
  closeContextMenu();
}

function onEditorKeyDown(event: KeyboardEvent) {
  const editor = textEditor.value;
  if (!editor) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeTextEditor(false);
  }

  if (editor.type === "text" && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    closeTextEditor(true);
  }

  if (
    (editor.type === "note" || editor.type === "envelope") &&
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter"
  ) {
    event.preventDefault();
    closeTextEditor(true);
  }
}

function incrementVoteForElement(elementId: string) {
  canvasStore.incrementVote(elementId);
}

function decrementVoteForElement(elementId: string) {
  canvasStore.decrementVote(elementId);
}

function closeVoteFromCanvas() {
  canvasStore.closeVoteSession();
  if (canvasStore.state.timerRunning) {
    canvasStore.stopTimer();
  }
}

function closeVoteResults() {
  canvasStore.hideVoteResults();
}

function setVoteResultCanvasRef(elementId: string, canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    voteResultCanvasRefs.delete(elementId);
    return;
  }
  voteResultCanvasRefs.set(elementId, canvas);
}

function drawVoteResultPreviews() {
  if (!canvasStore.state.voteResultsVisible) return;
  for (const row of voteResultRows.value) {
    const preview = voteResultCanvasRefs.get(row.id);
    if (!preview) continue;

    const ctx = preview.getContext("2d");
    if (!ctx) continue;
    const width = 140;
    const height = 72;
    preview.width = width;
    preview.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const element = canvasStore.state.elements.find((item) => item.id === row.id);
    if (!element) continue;

    if (element.type === "note") {
      ctx.fillStyle = element.fill;
      drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 10);
      ctx.fill();
      ctx.strokeStyle = element.stroke;
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, 8, 8, width - 16, height - 16, 10);
      ctx.stroke();
      ctx.fillStyle = element.textColor ?? "#0f172a";
      ctx.font = "600 12px system-ui";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const text = (element.text || "Note").slice(0, 18);
      ctx.fillText(text, width / 2, height / 2);
      continue;
    }

    if (element.type === "image") {
      const cached = imageCache.get(element.src);
      if (cached && cached.complete) {
        ctx.drawImage(cached, 8, 8, width - 16, height - 16);
      } else {
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(8, 8, width - 16, height - 16);
      }
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(8, 8, width - 16, height - 16);
    }
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportAsPng() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(`canvas-${stamp}.png`, blob);
  }, "image/png");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function exportAsSvg() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pngDataUrl = canvas.toDataURL("image/png");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<image href="${escapeXml(pngDataUrl)}" x="0" y="0" width="${width}" height="${height}" />`,
    "</svg>",
  ].join("");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadBlob(`canvas-${stamp}.svg`, new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
}

defineExpose({
  exportAsPng,
  exportAsSvg,
});

onMounted(() => {
  render();

  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(canvasRef.value);

    canvasRef.value.addEventListener("pointerdown", onPointerDown);
    canvasRef.value.addEventListener("pointermove", onPointerMove);
    canvasRef.value.addEventListener("pointerup", onPointerUp);
    canvasRef.value.addEventListener("pointercancel", onPointerUp);
    canvasRef.value.addEventListener("pointerleave", onPointerLeave);
    canvasRef.value.addEventListener("contextmenu", onContextMenu);
    canvasRef.value.addEventListener("dblclick", onDoubleClick);
    canvasRef.value.addEventListener("wheel", onWheel, { passive: false });
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerdown", onWindowPointerDown);
});

onUnmounted(() => {
  canvasStore.updatePresenceCursor(0, 0, false);
  canvasStore.updatePresenceEditing(null);
  resizeObserver?.disconnect();
  resizeObserver = null;

  if (canvasRef.value) {
    canvasRef.value.removeEventListener("pointerdown", onPointerDown);
    canvasRef.value.removeEventListener("pointermove", onPointerMove);
    canvasRef.value.removeEventListener("pointerup", onPointerUp);
    canvasRef.value.removeEventListener("pointercancel", onPointerUp);
    canvasRef.value.removeEventListener("pointerleave", onPointerLeave);
    canvasRef.value.removeEventListener("contextmenu", onContextMenu);
    canvasRef.value.removeEventListener("dblclick", onDoubleClick);
    canvasRef.value.removeEventListener("wheel", onWheel);
  }

  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("pointerdown", onWindowPointerDown);
});

watch(
  () => [
    canvasStore.state.viewport.x,
    canvasStore.state.viewport.y,
    canvasStore.state.viewport.zoom,
    canvasStore.state.gridSize,
    canvasStore.state.showGrid,
    canvasStore.state.snapToGrid,
    canvasStore.state.tool,
    canvasStore.state.presenceRevision,
    canvasStore.state.selectedIds,
    canvasStore.state.elements,
    marqueeSelection,
  ],
  render,
  { deep: true },
);

watch(
  () => [canvasStore.state.voteResultsVisible, canvasStore.state.voteResults, canvasStore.state.elements],
  () => {
    nextTick(() => {
      drawVoteResultPreviews();
    });
  },
  { deep: true },
);
</script>

<template>
  <section
    class="canvas-shell"
    :class="{ following: Boolean(followedUser) }"
    :style="followCanvasStyle"
    aria-label="Drawing stage"
  >
    <canvas ref="canvasRef"></canvas>
    <div v-if="followedUser" class="follow-indicator" :style="{ backgroundColor: followedUser.color }">
      Vous suivez actuellement {{ followedUser.username }}
    </div>
    <div v-if="canvasStore.state.timerRunning" class="canvas-timer" :class="{ warning: isTimerEnding }">
      {{ timerLabel }}
    </div>
    <div v-if="canvasStore.state.voteActive" class="vote-panel">
      <div class="vote-panel-title">Votes restants</div>
      <div class="vote-panel-count">{{ canvasStore.state.voteRemaining }}</div>
      <button type="button" class="vote-panel-btn" @click="closeVoteFromCanvas">Cloturer le vote</button>
    </div>
    <div
      v-for="item in voteControlItems"
      :key="`vote-control-${item.id}`"
      class="vote-controls"
      :style="{ left: `${item.left}px`, top: `${item.top}px` }"
    >
      <button type="button" :disabled="!item.canIncrement" @click="incrementVoteForElement(item.id)">+</button>
      <span>{{ item.votes }}</span>
      <button type="button" :disabled="!item.canDecrement" @click="decrementVoteForElement(item.id)">-</button>
    </div>
    <div v-if="canvasStore.state.voteResultsVisible" class="vote-results-modal">
      <div class="vote-results-card">
        <div class="vote-results-head">
          <h3>Resultats du vote</h3>
        </div>
        <div class="vote-results-grid">
          <div v-for="row in voteResultRows" :key="`vote-row-${row.id}`" class="vote-results-row">
            <div class="vote-results-item">
              <canvas
                class="vote-result-preview"
                :ref="
                  (el) =>
                    setVoteResultCanvasRef(
                      row.id,
                      (el as HTMLCanvasElement | null) ?? null,
                    )
                "
              ></canvas>
              <span>{{ row.label }}</span>
            </div>
            <div class="vote-results-score">{{ row.votes }}</div>
          </div>
        </div>
        <div class="vote-results-actions">
          <button type="button" @click="closeVoteResults">Fermer</button>
        </div>
      </div>
    </div>
    <textarea
      v-if="textEditor"
      ref="editorRef"
      v-model="textEditor.text"
      class="text-editor"
      :class="{ 'note-editor': textEditor.type === 'note' }"
      :style="textEditorStyle"
      @input="onEditorInput"
      @blur="closeTextEditor(true)"
      @keydown="onEditorKeyDown"
    />
    <div
      v-if="contextMenu.visible"
      ref="menuRef"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
    >
      <template v-if="contextMenu.target === 'element'">
        <div v-if="contextElementCapabilities?.supportsTheme && !isLockedContext" class="menu-section">
          <span class="menu-label">Thème</span>
          <div class="swatches">
            <button
              v-for="theme in THEMES"
              :key="`theme-${theme.name}`"
              type="button"
              class="swatch"
              :title="theme.name"
              :style="{ backgroundColor: theme.fill, borderColor: theme.stroke }"
              @click="applyTheme(theme.fill, theme.stroke)"
            ></button>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsFill" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading">
                  <font-awesome-icon :icon="contextElementCapabilities?.fillLabel === 'Fond' ? 'fill-drip' : 'font'" />
                </span>
                <span>{{ contextElementCapabilities?.fillLabel }}</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="swatches">
                <button
                  type="button"
                  class="swatch swatch-transparent"
                  title="Transparent"
                  @click="applyFillColor(TRANSPARENT_COLOR)"
                ></button>
                <button
                  v-for="color in SWATCHES"
                  :key="`fill-${color}`"
                  type="button"
                  class="swatch"
                  :style="{ backgroundColor: color }"
                  @click="applyFillColor(color)"
                ></button>
                <label class="swatch picker">
                  <input type="color" @change="onFillPickerInput" />
                </label>
              </div>
              <div class="submenu-separator"></div>
              <div class="submenu-actions">
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyShadowType('soft')">
                  Ombre douce
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyShadowType('offset')">
                  Ombre bas-droite
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyShadowType('glow')">
                  Glow
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyShadowType('none')">
                  Sans ombre
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsLineStyle" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                <span>Type de ligne</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="submenu-actions">
                <div class="menu-submenu-row">
                  <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
                    <span class="menu-item-content">
                      <span>Tracé</span>
                    </span>
                    <span class="menu-item-arrow">›</span>
                  </button>
                  <div class="submenu">
                    <div class="submenu-actions">
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineRoute === 'straight' }"
                        :disabled="isLockedContext"
                        @click="applyLineRoute('straight')"
                      >
                        Ligne droite
                        <span v-if="selectedLineStyle?.lineRoute === 'straight'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineRoute === 'orthogonal' }"
                        :disabled="isLockedContext"
                        @click="applyLineRoute('orthogonal')"
                      >
                        Ligne a angle droit
                        <span v-if="selectedLineStyle?.lineRoute === 'orthogonal'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineRoute === 'curve' }"
                        :disabled="isLockedContext"
                        @click="applyLineRoute('curve')"
                      >
                        Ligne courbe
                        <span v-if="selectedLineStyle?.lineRoute === 'curve'" class="menu-item-check">✓</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="menu-submenu-row">
                  <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
                    <span class="menu-item-content">
                      <span>Motif</span>
                    </span>
                    <span class="menu-item-arrow">›</span>
                  </button>
                  <div class="submenu">
                    <div class="submenu-actions">
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineStyle === 'solid' }"
                        :disabled="isLockedContext"
                        @click="applyLineStyle('solid')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                        Ligne pleine
                        <span v-if="selectedLineStyle?.lineStyle === 'solid'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineStyle === 'dotted' }"
                        :disabled="isLockedContext"
                        @click="applyLineStyle('dotted')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="ellipsis" /></span>
                        Pointillé
                        <span v-if="selectedLineStyle?.lineStyle === 'dotted'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineStyle === 'dashed' }"
                        :disabled="isLockedContext"
                        @click="applyLineStyle('dashed')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="grip-lines" /></span>
                        Tiret
                        <span v-if="selectedLineStyle?.lineStyle === 'dashed'" class="menu-item-check">✓</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="menu-submenu-row">
                  <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
                    <span class="menu-item-content">
                      <span>Flèches</span>
                    </span>
                    <span class="menu-item-arrow">›</span>
                  </button>
                  <div class="submenu">
                    <div class="submenu-actions">
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineArrow === 'start' }"
                        :disabled="isLockedContext"
                        @click="applyLineArrow('start')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="arrow-left" /></span>
                        Flèche au début
                        <span v-if="selectedLineStyle?.lineArrow === 'start'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineArrow === 'end' }"
                        :disabled="isLockedContext"
                        @click="applyLineArrow('end')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="arrow-right" /></span>
                        Flèche a la fin
                        <span v-if="selectedLineStyle?.lineArrow === 'end'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineArrow === 'both' }"
                        :disabled="isLockedContext"
                        @click="applyLineArrow('both')"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="arrows-left-right" /></span>
                        Flèche aux deux extrémités
                        <span v-if="selectedLineStyle?.lineArrow === 'both'" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.lineArrow === 'none' }"
                        :disabled="isLockedContext"
                        @click="applyLineArrow('none')"
                      >
                        Retirer les flèches
                        <span v-if="selectedLineStyle?.lineArrow === 'none'" class="menu-item-check">✓</span>
                      </button>
                      <div class="submenu-separator"></div>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{
                          active:
                            selectedLineStyle?.lineArrow !== 'none' &&
                            selectedLineStyle?.lineArrowStyle === 'filled',
                        }"
                        :disabled="isLockedContext"
                        @click="applyLineArrowStyle('filled')"
                      >
                        Flèche pleine
                        <span
                          v-if="
                            selectedLineStyle?.lineArrow !== 'none' &&
                            selectedLineStyle?.lineArrowStyle === 'filled'
                          "
                          class="menu-item-check"
                        >
                          ✓
                        </span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{
                          active:
                            selectedLineStyle?.lineArrow !== 'none' &&
                            selectedLineStyle?.lineArrowStyle === 'open',
                        }"
                        :disabled="isLockedContext"
                        @click="applyLineArrowStyle('open')"
                      >
                        Flèche ouverte
                        <span
                          v-if="
                            selectedLineStyle?.lineArrow !== 'none' &&
                            selectedLineStyle?.lineArrowStyle === 'open'
                          "
                          class="menu-item-check"
                        >
                          ✓
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="menu-submenu-row">
                  <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
                    <span class="menu-item-content">
                      <span>Épaisseur</span>
                    </span>
                    <span class="menu-item-arrow">›</span>
                  </button>
                  <div class="submenu">
                    <div class="submenu-actions">
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.strokeWidth === 1 }"
                        :disabled="isLockedContext"
                        @click="applyLineWidth(1)"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                        Épaisseur 1
                        <span v-if="selectedLineStyle?.strokeWidth === 1" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.strokeWidth === 2 }"
                        :disabled="isLockedContext"
                        @click="applyLineWidth(2)"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                        Épaisseur 2
                        <span v-if="selectedLineStyle?.strokeWidth === 2" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.strokeWidth === 4 }"
                        :disabled="isLockedContext"
                        @click="applyLineWidth(4)"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                        Épaisseur 4
                        <span v-if="selectedLineStyle?.strokeWidth === 4" class="menu-item-check">✓</span>
                      </button>
                      <button
                        type="button"
                        class="menu-item"
                        :class="{ active: selectedLineStyle?.strokeWidth === 8 }"
                        :disabled="isLockedContext"
                        @click="applyLineWidth(8)"
                      >
                        <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                        Épaisseur 8
                        <span v-if="selectedLineStyle?.strokeWidth === 8" class="menu-item-check">✓</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="menu-submenu-row">
                  <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
                    <span class="menu-item-content">
                      <span>Libellé</span>
                    </span>
                    <span class="menu-item-arrow">›</span>
                  </button>
                  <div class="submenu">
                    <div class="line-label-panel">
                      <label class="text-type-field">
                        <span>Libellé du connecteur</span>
                        <input
                          type="text"
                          :disabled="isLockedContext"
                          :value="selectedLineStyle?.label"
                          placeholder="Ex: API -> Service"
                          @input="applyLineLabelFromInput"
                        />
                      </label>
                      <label class="text-type-field">
                        <span>Taille du libellé</span>
                        <select :disabled="isLockedContext" :value="selectedLineStyle?.labelSize" @change="applyLineLabelSize">
                          <option v-for="size in LINE_LABEL_SIZE_OPTIONS" :key="`line-label-size-${size}`" :value="size">
                            {{ size }} px
                          </option>
                        </select>
                      </label>
                      <div class="line-label-colors">
                        <span>Texte</span>
                        <div class="swatches">
                          <button
                            v-for="color in SWATCHES"
                            :key="`line-label-color-${color}`"
                            type="button"
                            class="swatch"
                            :style="{ backgroundColor: color }"
                            @click="applyLineLabelColor(color)"
                          ></button>
                          <label class="swatch picker">
                            <input type="color" @change="onLineLabelColorPickerInput" />
                          </label>
                        </div>
                      </div>
                      <div class="line-label-colors">
                        <span>Fond du libellé</span>
                        <div class="swatches">
                          <button
                            type="button"
                            class="swatch swatch-transparent"
                            title="Transparent"
                            @click="applyLineLabelBg(TRANSPARENT_COLOR)"
                          ></button>
                          <button
                            v-for="color in SWATCHES"
                            :key="`line-label-bg-${color}`"
                            type="button"
                            class="swatch"
                            :style="{ backgroundColor: color }"
                            @click="applyLineLabelBg(color)"
                          ></button>
                          <label class="swatch picker">
                            <input type="color" @change="onLineLabelBgPickerInput" />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsTextType" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="font" /></span>
                <span>Type de texte</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="text-type-panel">
                <label class="text-type-field">
                  <span>Police</span>
                  <select
                    :disabled="isLockedContext"
                    :value="selectedTextStyle?.fontFamily"
                    @change="applyTextFontFamilyFromSelect"
                  >
                    <option v-for="option in TEXT_FONT_OPTIONS" :key="option.label" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <div class="text-type-row">
                  <span>Alignement</span>
                  <div class="icon-group">
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textAlign === 'left' }"
                      :disabled="isLockedContext"
                      @click="applyTextAlign('left')"
                    >
                      <font-awesome-icon icon="align-left" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textAlign === 'center' }"
                      :disabled="isLockedContext"
                      @click="applyTextAlign('center')"
                    >
                      <font-awesome-icon icon="align-center" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textAlign === 'right' }"
                      :disabled="isLockedContext"
                      @click="applyTextAlign('right')"
                    >
                      <font-awesome-icon icon="align-right" />
                    </button>
                  </div>
                </div>
                <div class="text-type-row">
                  <span>Alignement vertical</span>
                  <div class="icon-group">
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textVerticalAlign === 'top' }"
                      :disabled="isLockedContext"
                      @click="applyTextVerticalAlign('top')"
                    >
                      <font-awesome-icon icon="arrow-up" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textVerticalAlign === 'middle' }"
                      :disabled="isLockedContext"
                      @click="applyTextVerticalAlign('middle')"
                    >
                      <font-awesome-icon icon="grip-lines" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textVerticalAlign === 'bottom' }"
                      :disabled="isLockedContext"
                      @click="applyTextVerticalAlign('bottom')"
                    >
                      <font-awesome-icon icon="arrow-down" />
                    </button>
                  </div>
                </div>
                <div class="text-type-row">
                  <span>Style</span>
                  <div class="icon-group">
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.bold }"
                      :disabled="isLockedContext"
                      @click="toggleTextBold"
                    >
                      <font-awesome-icon icon="bold" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.italic }"
                      :disabled="isLockedContext"
                      @click="toggleTextItalic"
                    >
                      <font-awesome-icon icon="italic" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.underline }"
                      :disabled="isLockedContext"
                      @click="toggleTextUnderline"
                    >
                      <font-awesome-icon icon="underline" />
                    </button>
                  </div>
                </div>
                <label class="text-type-field">
                  <span>Taille</span>
                  <select :disabled="isLockedContext" :value="selectedTextStyle?.fontSize" @change="applyTextFontSize">
                    <option v-for="size in TEXT_SIZE_OPTIONS" :key="`text-size-${size}`" :value="size">
                      {{ size }} px
                    </option>
                  </select>
                </label>
                <label class="text-type-field">
                  <span>Interligne</span>
                  <select :disabled="isLockedContext" :value="selectedTextStyle?.lineHeight" @change="applyTextLineHeight">
                    <option v-for="value in TEXT_LINE_HEIGHT_OPTIONS" :key="`line-height-${value}`" :value="value">
                      {{ value.toFixed(1) }}
                    </option>
                  </select>
                </label>
                <label class="text-type-field">
                  <span>Espacement</span>
                  <select
                    :disabled="isLockedContext"
                    :value="selectedTextStyle?.letterSpacing"
                    @change="applyTextLetterSpacing"
                  >
                    <option v-for="value in TEXT_LETTER_SPACING_OPTIONS" :key="`letter-spacing-${value}`" :value="value">
                      {{ value }} px
                    </option>
                  </select>
                </label>
                <div class="text-type-row">
                  <span>Majuscules</span>
                  <div class="icon-group">
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textTransform === 'uppercase' }"
                      :disabled="isLockedContext"
                      @click="setTextTransform('uppercase')"
                    >
                      <font-awesome-icon icon="arrow-up-a-z" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textTransform === 'capitalize' }"
                      :disabled="isLockedContext"
                      @click="setTextTransform('capitalize')"
                    >
                      <font-awesome-icon icon="text-height" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn"
                      :class="{ active: selectedTextStyle?.textTransform === 'none' }"
                      :disabled="isLockedContext"
                      @click="setTextTransform('none')"
                    >
                      <font-awesome-icon icon="xmark" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsEnvelopeType" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="object-group" /></span>
                <span>Type d'enveloppe</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="submenu-actions">
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyEnvelopeType('convex')">
                  Convexe
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyEnvelopeType('rectangle')">
                  Rectangle
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyEnvelopeType('rounded')">
                  Arrondi
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsStroke" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="border-all" /></span>
                <span>Bordure</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="swatches">
                <button
                  v-for="color in SWATCHES"
                  :key="`stroke-${color}`"
                  type="button"
                  class="swatch"
                  :style="{ backgroundColor: color }"
                  @click="applyStrokeColor(color)"
                ></button>
                <label class="swatch picker">
                  <input type="color" @change="onStrokePickerInput" />
                </label>
              </div>
              <div class="submenu-separator"></div>
              <div class="submenu-actions">
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyStrokeStyle('solid')">
                  <span class="menu-item-leading"><font-awesome-icon icon="minus" /></span>
                  Ligne pleine
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyStrokeStyle('dashed')">
                  <span class="menu-item-leading"><font-awesome-icon icon="grip-lines" /></span>
                  Tiret
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyStrokeStyle('dotted')">
                  <span class="menu-item-leading"><font-awesome-icon icon="ellipsis" /></span>
                  Pointillé
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-if="contextElementCapabilities?.supportsNoteTextColor" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="font" /></span>
                <span>Couleur du texte</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="swatches">
                <button
                  v-for="color in SWATCHES"
                  :key="`note-text-${color}`"
                  type="button"
                  class="swatch"
                  :style="{ backgroundColor: color }"
                  @click="applyNoteTextColor(color)"
                ></button>
                <label class="swatch picker">
                  <input type="color" @change="onNoteTextPickerInput" />
                </label>
              </div>
            </div>
          </div>
        </div>
        <div v-if="canAlignSelection" class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="align-left" /></span>
                <span>Aligner / Distribuer</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="submenu-actions">
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('left')">
                  Aligner à gauche
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('hCenter')">
                  Centrer horizontalement
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('right')">
                  Aligner à droite
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('top')">
                  Aligner en haut
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('vCenter')">
                  Centrer verticalement
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="applyAlignment('bottom')">
                  Aligner en bas
                </button>
                <div class="submenu-separator"></div>
                <button
                  type="button"
                  class="menu-item"
                  :disabled="isLockedContext || !canDistributeSelection"
                  @click="applyDistribution('horizontal')"
                >
                  Distribuer horizontalement
                </button>
                <button
                  type="button"
                  class="menu-item"
                  :disabled="isLockedContext || !canDistributeSelection"
                  @click="applyDistribution('vertical')"
                >
                  Distribuer verticalement
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="menu-section">
          <div class="menu-submenu-row" :class="{ disabled: isLockedContext }">
            <button type="button" class="menu-item menu-item-submenu" :disabled="isLockedContext">
              <span class="menu-item-content">
                <span class="menu-item-leading"><font-awesome-icon icon="layer-group" /></span>
                <span>Déplacer devant/derrière</span>
              </span>
              <span class="menu-item-arrow">›</span>
            </button>
            <div class="submenu">
              <div class="submenu-actions">
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="bringToFrontFromContext">
                  <span class="menu-item-leading"><font-awesome-icon icon="angles-up" /></span>
                  Amener au premier plan
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="bringForwardFromContext">
                  <span class="menu-item-leading"><font-awesome-icon icon="arrow-up" /></span>
                  Avancer vers le premier plan
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="sendBackwardFromContext">
                  <span class="menu-item-leading"><font-awesome-icon icon="arrow-down" /></span>
                  Reculer vers l'arrière plan
                </button>
                <button type="button" class="menu-item" :disabled="isLockedContext" @click="sendToBackFromContext">
                  <span class="menu-item-leading"><font-awesome-icon icon="angles-down" /></span>
                  Placer a l'arriere plan
                </button>
              </div>
            </div>
          </div>
        </div>
        <button
          v-if="canExcludeFromEnvelope"
          type="button"
          class="menu-item"
          :disabled="isLockedContext"
          @click="excludeFromEnvelopeFromContext"
        >
          <span class="menu-item-leading"><font-awesome-icon icon="right-from-bracket" /></span>
          Exclure de l'enveloppe
        </button>
        <button
          v-if="elementLockAction"
          type="button"
          class="menu-item menu-item-with-separator"
          :class="{ danger: elementLockAction.variant === 'danger' }"
          :disabled="isContextActionDisabled(elementLockAction)"
          @click="runContextAction(elementLockAction)"
        >
          <span class="menu-item-leading"><font-awesome-icon :icon="getContextActionIcon(elementLockAction)" /></span>
          {{ getContextActionLabel(elementLockAction) }}
        </button>
        <button
          v-for="action in elementContextActionsAfterLock"
          :key="`element-action-${action.id}`"
          type="button"
          class="menu-item"
          :class="{ danger: action.variant === 'danger' }"
          :disabled="isContextActionDisabled(action)"
          @click="runContextAction(action)"
        >
          <span class="menu-item-leading"><font-awesome-icon :icon="getContextActionIcon(action)" /></span>
          {{ getContextActionLabel(action) }}
        </button>
      </template>
      <template v-else>
        <div class="menu-icons">
          <button
            v-for="element in ADDABLE_ELEMENTS"
            :key="`add-${element.id}`"
            type="button"
            :title="element.title"
            @click="createFromContext(element.id)"
          >
            <font-awesome-icon :icon="element.icon" />
          </button>
        </div>
        <button
          v-for="action in canvasContextActions"
          :key="`canvas-action-${action.id}`"
          type="button"
          class="menu-item"
          :class="{ danger: action.variant === 'danger' }"
          :disabled="isContextActionDisabled(action)"
          @click="runContextAction(action)"
        >
          <span class="menu-item-leading"><font-awesome-icon :icon="getContextActionIcon(action)" /></span>
          {{ getContextActionLabel(action) }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.canvas-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  border: 1px solid #d0d7de;
  border-left: 0;
  border-top: 0;
  border-radius: 0 0 12px 0;
  overflow: hidden;
  background: #ffffff;
}

.canvas-shell.following {
  box-shadow: inset 0 0 0 2px var(--follow-color);
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

.canvas-timer {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 12;
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  font: 700 1.5rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.canvas-timer.warning {
  color: #b91c1c;
  border-color: #fecaca;
}

.follow-indicator {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 12;
  padding: 6px 12px;
  border-radius: 999px;
  color: #ffffff;
  font: 700 0.78rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.28);
}

.vote-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 12;
  width: 150px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.97);
  padding: 10px;
  display: grid;
  gap: 8px;
}

.vote-panel-title {
  color: #64748b;
  font: 600 0.72rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-panel-count {
  color: #0f172a;
  font: 700 1.3rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-panel-btn {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  padding: 6px 8px;
  font: 600 0.74rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.vote-controls {
  position: absolute;
  z-index: 12;
  transform: translateY(-50%);
  display: grid;
  justify-items: center;
  gap: 4px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  padding: 4px;
}

.vote-controls button {
  width: 24px;
  height: 24px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f8fafc;
  cursor: pointer;
  font: 700 0.85rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-controls span {
  min-width: 20px;
  text-align: center;
  color: #0f172a;
  font: 700 0.82rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-results-modal {
  position: absolute;
  inset: 0;
  z-index: 25;
  background: rgba(15, 23, 42, 0.24);
  display: flex;
  align-items: center;
  justify-content: center;
}

.vote-results-card {
  width: min(780px, calc(100% - 32px));
  max-height: calc(100% - 32px);
  overflow: auto;
  border: 1px solid #d0d7de;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  padding: 14px;
  display: grid;
  gap: 10px;
}

.vote-results-head h3 {
  margin: 0;
  color: #0f172a;
  font: 700 1rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-results-grid {
  display: grid;
  gap: 8px;
}

.vote-results-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 74px;
  gap: 8px;
  align-items: center;
}

.vote-results-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vote-result-preview {
  width: 140px;
  height: 72px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #ffffff;
  flex-shrink: 0;
}

.vote-results-item span {
  color: #334155;
  font: 600 0.8rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vote-results-score {
  justify-self: end;
  color: #0f172a;
  font: 700 1rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.vote-results-actions {
  display: flex;
  justify-content: flex-end;
}

.vote-results-actions button {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  padding: 6px 10px;
  font: 600 0.8rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.text-editor {
  position: absolute;
  z-index: 10;
  border: 1px solid #93c5fd;
  border-radius: 8px;
  outline: none;
  padding: 4px 8px;
  line-height: 1.3;
  font-weight: 600;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #0f172a;
  background: #ffffff;
  resize: none;
}

.note-editor {
  font-weight: 500;
  line-height: 1.35;
}

.context-menu {
  position: absolute;
  z-index: 30;
  min-width: 240px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
  padding: 8px;
}

.menu-section {
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #eef2f6;
}

.menu-label {
  display: block;
  margin-bottom: 6px;
  color: #475569;
  font: 600 0.74rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.menu-submenu-row {
  position: relative;
}

.menu-item-submenu {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.menu-submenu-row.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.menu-item-leading {
  display: inline-flex;
  width: 16px;
  margin-right: 8px;
  justify-content: center;
  color: #64748b;
}

.menu-item-arrow {
  color: #64748b;
  font-size: 0.9rem;
}

.submenu {
  display: none;
  position: absolute;
  top: -8px;
  left: 100%;
  z-index: 40;
  min-width: 190px;
  padding: 8px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
}

.submenu::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -8px;
  width: 8px;
}

.menu-submenu-row:hover > .submenu {
  display: block;
}

.submenu-actions {
  min-width: 220px;
}

.submenu-separator {
  margin: 4px 0 6px;
  border-top: 1px solid #eef2f6;
}

.text-type-panel {
  min-width: 240px;
  display: grid;
  gap: 8px;
}

.text-type-field {
  display: grid;
  gap: 4px;
  font: 600 0.74rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #475569;
}

.text-type-field select {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  padding: 6px 8px;
  font: 500 0.78rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.text-type-field input {
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  padding: 6px 8px;
  font: 500 0.78rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.line-label-panel {
  min-width: 260px;
  display: grid;
  gap: 8px;
}

.line-label-colors {
  display: grid;
  gap: 4px;
  font: 600 0.74rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #475569;
}

.text-type-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font: 600 0.74rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #475569;
}

.icon-group {
  display: flex;
  gap: 6px;
}

.icon-btn {
  width: 30px;
  height: 28px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  cursor: pointer;
}

.icon-btn:hover {
  background: #eef2f6;
}

.icon-btn.active {
  background: #dbeafe;
  border-color: #60a5fa;
  color: #1e3a8a;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.swatch {
  width: 24px;
  height: 24px;
  border: 1px solid #d0d7de;
  border-radius: 999px;
  cursor: pointer;
}

.swatch-transparent {
  background:
    linear-gradient(
      45deg,
      #e2e8f0 0 25%,
      #ffffff 25% 50%,
      #e2e8f0 50% 75%,
      #ffffff 75% 100%
    );
  background-size: 12px 12px;
}

.swatch.picker {
  position: relative;
  overflow: hidden;
  background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
}

.swatch.picker input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: 8px;
  color: #0f172a;
  font: 500 0.8rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.menu-item-with-separator {
  margin-bottom: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eef2f6;
}

.menu-item:hover {
  background: #f1f5f9;
}

.menu-item.active {
  background: #e2e8f0;
  color: #0f172a;
  font-weight: 600;
}

.menu-item-check {
  margin-left: auto;
  color: #0f172a;
  font-weight: 700;
}

.menu-item:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-item.danger {
  color: #b91c1c;
}

.menu-icons {
  display: flex;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #eef2f6;
}

.menu-icons button {
  width: 34px;
  height: 34px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  cursor: pointer;
}

.menu-icons button:hover {
  background: #eef2f6;
}

@media (max-width: 760px) {
  .canvas-shell {
    border-left: 1px solid #d0d7de;
    border-radius: 0 0 12px 12px;
  }
}
</style>


