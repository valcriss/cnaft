import { createCanvasElement, type CanvasElement, type ElementType, type LineArrow, type LineArrowStyle, type LineStyle, type StrokeStyle } from "../domain/elements";
import {
  DOCUMENT_SCHEMA,
  DOCUMENT_VERSION,
  type CanvasDocumentState,
  type VersionedCanvasDocument,
  isObject,
} from "../domain/documentSchema";
import { randomUUID } from "../utils/uuid";

export type ImportFormat = "native-json" | "draft" | "excalidraw";

export type ImportStats = {
  imported: number;
  ignored: number;
  byType: Record<ElementType, number>;
};

export type DocumentImportSuccess = {
  ok: true;
  format: ImportFormat;
  documentState: CanvasDocumentState;
  warnings: string[];
  stats: ImportStats;
};

export type DocumentImportFailure = {
  ok: false;
  format: ImportFormat | null;
  error: string;
  warnings: string[];
  stats: ImportStats;
};

export type DocumentImportResult = DocumentImportSuccess | DocumentImportFailure;

type DraftVertex = Record<string, unknown>;
type ExcalidrawFileMap = Record<string, { dataURL?: string; mimeType?: string }>;

const EMPTY_STATS: ImportStats = {
  imported: 0,
  ignored: 0,
  byType: {
    rectangle: 0,
    text: 0,
    note: 0,
    line: 0,
    image: 0,
    envelope: 0,
  },
};

export function detectImportFormat(fileName: string | undefined, jsonText: string): ImportFormat | null {
  const normalizedName = (fileName ?? "").trim().toLowerCase();
  if (normalizedName.endsWith(".drft")) return "draft";
  if (normalizedName.endsWith(".excalidraw")) return "excalidraw";
  if (normalizedName.endsWith(".json")) return detectImportFormatFromContent(jsonText);
  return detectImportFormatFromContent(jsonText);
}

export function importDocumentContent(fileName: string | undefined, jsonText: string): DocumentImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return makeFailure(null, "Le fichier JSON est invalide.");
  }

  const format = detectImportFormat(fileName, jsonText);
  if (!format) {
    return makeFailure(null, "Format de fichier non reconnu.");
  }

  if (format === "native-json") {
    return importNativeJson(parsed);
  }
  if (format === "draft") {
    return importDraft(parsed);
  }
  return importExcalidraw(parsed);
}

function detectImportFormatFromContent(jsonText: string): ImportFormat | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.schema === DOCUMENT_SCHEMA) return "native-json";
  if (Array.isArray(parsed.vertices) && Array.isArray(parsed.maps)) return "draft";
  if (
    parsed.type === "excalidraw" ||
    (typeof parsed.source === "string" && parsed.source.includes("excalidraw")) ||
    Array.isArray(parsed.elements)
  ) {
    return "excalidraw";
  }
  return null;
}

function importNativeJson(parsed: unknown): DocumentImportResult {
  if (!isObject(parsed)) {
    return makeFailure("native-json", "Format de document invalide.");
  }
  if (parsed.schema !== DOCUMENT_SCHEMA) {
    return makeFailure("native-json", "Schéma inconnu. Fichier non compatible.");
  }
  if (parsed.version !== DOCUMENT_VERSION) {
    return makeFailure(
      "native-json",
      `Version non supportée (${String(parsed.version)}). Version attendue: ${DOCUMENT_VERSION}.`,
    );
  }
  if (!isObject(parsed.state)) {
    return makeFailure("native-json", "Contenu du document invalide (state manquant).");
  }

  const document = parsed as VersionedCanvasDocument;
  const normalizedState = normalizeCanvasDocumentState(document.state);
  if (normalizedState.elements.length === 0) {
    return makeFailure("native-json", "Le fichier ne contient aucun élément importable.");
  }

  return makeSuccess("native-json", normalizedState, [], buildStats(normalizedState.elements, 0));
}

function importDraft(parsed: unknown): DocumentImportResult {
  if (!isObject(parsed) || !Array.isArray(parsed.vertices) || !Array.isArray(parsed.maps)) {
    return makeFailure("draft", "Structure Draft invalide.");
  }

  const warnings = new Set<string>();
  const vertices = [...parsed.vertices].filter(isObject).sort((a, b) => getDraftZ(a) - getDraftZ(b));
  const elements: CanvasElement[] = [];
  let ignored = 0;

  for (const vertex of vertices) {
    const converted = convertDraftVertex(vertex);
    if (!converted) {
      ignored += 1;
      const view = typeof vertex["tm.view"] === "string" ? vertex["tm.view"] : "inconnu";
      warnings.add(`Éléments Draft ignorés: ${view}.`);
      continue;
    }
    elements.push(converted);
  }

  if (elements.length === 0) {
    return makeFailure("draft", "Aucun élément Draft importable trouvé.", Array.from(warnings), {
      ...EMPTY_STATS,
      ignored,
    });
  }

  return makeSuccess("draft", createDefaultDocumentState(elements), Array.from(warnings), buildStats(elements, ignored));
}

function importExcalidraw(parsed: unknown): DocumentImportResult {
  if (!isObject(parsed) || !Array.isArray(parsed.elements)) {
    return makeFailure("excalidraw", "Structure Excalidraw invalide.");
  }

  const warnings = new Set<string>();
  const files = isObject(parsed.files) ? (parsed.files as ExcalidrawFileMap) : {};
  const elements: CanvasElement[] = [];
  let ignored = 0;

  for (const item of parsed.elements) {
    if (!isObject(item) || item.isDeleted === true) continue;
    const converted = convertExcalidrawElement(item, files);
    if (!converted) {
      ignored += 1;
      const type = typeof item.type === "string" ? item.type : "inconnu";
      warnings.add(`Éléments Excalidraw ignorés: ${type}.`);
      continue;
    }
    elements.push(converted);
  }

  if (elements.length === 0) {
    return makeFailure("excalidraw", "Aucun élément Excalidraw importable trouvé.", Array.from(warnings), {
      ...EMPTY_STATS,
      ignored,
    });
  }

  normalizeImportedGroups(elements);
  return makeSuccess(
    "excalidraw",
    createDefaultDocumentState(elements),
    Array.from(warnings),
    buildStats(elements, ignored),
  );
}

function normalizeCanvasDocumentState(state: CanvasDocumentState): CanvasDocumentState {
  const normalizedElements: CanvasElement[] = [];
  for (const item of state.elements ?? []) {
    if (!isObject(item)) continue;
    const type = item.type;
    const x = typeof item.x === "number" ? item.x : 0;
    const y = typeof item.y === "number" ? item.y : 0;
    const id = typeof item.id === "string" ? item.id : randomUUID();
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
    normalizedElements.push(normalizeElementFromImport({ ...(item as CanvasElement), id, x, y }));
  }
  normalizeImportedGroups(normalizedElements);

  return {
    elements: normalizedElements,
    viewport: {
      x: typeof state.viewport?.x === "number" ? state.viewport.x : 0,
      y: typeof state.viewport?.y === "number" ? state.viewport.y : 0,
      zoom: typeof state.viewport?.zoom === "number" ? state.viewport.zoom : 1,
    },
    gridSize: typeof state.gridSize === "number" ? state.gridSize : 24,
    showGrid: typeof state.showGrid === "boolean" ? state.showGrid : true,
    snapToGrid: typeof state.snapToGrid === "boolean" ? state.snapToGrid : false,
  };
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

function convertDraftVertex(vertex: DraftVertex): CanvasElement | null {
  const view = typeof vertex["tm.view"] === "string" ? vertex["tm.view"] : "";
  const id = typeof vertex.id === "string" ? vertex.id : randomUUID();
  const locked = Boolean(vertex["tm.locked"]);

  if (view === "Postit3") {
    const rect = getDraftRect(vertex["tm.rect"]);
    if (!rect) return null;
    return createCanvasElement("note", {
      id,
      x: rect.x,
      y: rect.y,
      overrides: {
        width: rect.width,
        height: rect.height,
        text: getString(vertex["tm.text"], "Nouvelle note carree"),
        fill: normalizeColor(vertex["tm.style.backgroundColor"], "#fef08a"),
        stroke: normalizeColor(vertex["tm.style.borderColor"], "#ca8a04"),
        textColor: normalizeColor(vertex["tm.style.color"], "#1f2937"),
        fontSize: clampNumber(vertex["tm.style.fontSize"], 20, 8, 96),
        fontFamily: normalizeFontFamily(vertex["tm.style.fontFamily"]),
        bold: Boolean(vertex["tm.style.bold"]),
        italic: Boolean(vertex["tm.style.italic"]),
        underline: Boolean(vertex["tm.style.underline"]),
        locked,
      },
    });
  }

  if (view === "Textbox") {
    const rect = getDraftRect(vertex["tm.rect"]);
    if (!rect) return null;
    const textColor = normalizeColor(vertex["tm.style.color"], "#0f172a");
    return createCanvasElement("text", {
      id,
      x: rect.x,
      y: rect.y,
      overrides: {
        width: rect.width,
        height: rect.height,
        text: getString(vertex["tm.text"], "Nouvelle note"),
        fill: textColor,
        stroke: textColor,
        fontSize: clampNumber(vertex["tm.style.fontSize"], 20, 8, 96),
        fontFamily: normalizeFontFamily(vertex["tm.style.fontFamily"]),
        bold: Boolean(vertex["tm.style.bold"]),
        italic: Boolean(vertex["tm.style.italic"]),
        underline: Boolean(vertex["tm.style.underline"]),
        locked,
      },
    });
  }

  if (view === "Line") {
    const from = getPair(vertex["tm.from.coords"]);
    const to = getPair(vertex["tm.to.coords"]);
    if (!from || !to) return null;
    return createCanvasElement("line", {
      id,
      x: from[0],
      y: from[1],
      overrides: {
        x2: to[0],
        y2: to[1],
        stroke: normalizeColor(vertex["tm.style.color"], "#334155"),
        strokeWidth: clampNumber(vertex["tm.style.thickness"], 2, 1, 24),
        lineStyle: normalizeLineStyle(vertex["tm.style.stroke-dasharray"]),
        locked,
      },
    });
  }

  return null;
}

function convertExcalidrawElement(item: Record<string, unknown>, files: ExcalidrawFileMap): CanvasElement | null {
  const type = typeof item.type === "string" ? item.type : "";
  const id = typeof item.id === "string" ? item.id : randomUUID();
  const groupId = getExcalidrawGroupId(item);
  const x = typeof item.x === "number" ? item.x : 0;
  const y = typeof item.y === "number" ? item.y : 0;
  const width = clampNumber(item.width, 120, 1, 10000);
  const height = clampNumber(item.height, 120, 1, 10000);
  const locked = Boolean(item.locked);
  const stroke = normalizeColor(item.strokeColor, "#334155");
  const fill = normalizeColor(item.backgroundColor, "transparent");
  const strokeStyle = normalizeStrokeStyle(item.strokeStyle);
  const strokeWidth = clampNumber(item.strokeWidth, 2, 1, 24);

  if (type === "rectangle") {
    return createCanvasElement("rectangle", {
      id,
      x,
      y,
      overrides: {
        width,
        height,
        fill,
        stroke,
        strokeStyle,
        locked,
        groupId,
        cornerRadius: normalizeExcalidrawCornerRadius(item.roundness),
      },
    });
  }

  if (type === "text") {
    const textColor = normalizeColor(item.strokeColor, "#0f172a");
    return createCanvasElement("text", {
      id,
      x,
      y,
      overrides: {
        width,
        height,
        text: getString(item.text, "Nouvelle note"),
        fill: textColor,
        stroke: textColor,
        strokeStyle,
        fontSize: clampNumber(item.fontSize, 20, 8, 96),
        fontFamily: normalizeExcalidrawFontFamily(item.fontFamily),
        textAlign: normalizeTextAlign(item.textAlign),
        bold: false,
        italic: false,
        underline: false,
        locked,
        groupId,
      },
    });
  }

  if (type === "line" || type === "arrow") {
    const endpoints = getExcalidrawLineEndpoints(item);
    if (!endpoints) return null;
    return createCanvasElement("line", {
      id,
      x: endpoints.x,
      y: endpoints.y,
      overrides: {
        x2: endpoints.x2,
        y2: endpoints.y2,
        stroke,
        strokeWidth,
        strokeStyle,
        lineStyle: normalizeStrokeStyleToLineStyle(item.strokeStyle),
        lineArrow: type === "arrow" ? normalizeExcalidrawArrow(item) : "none",
        lineArrowStyle: normalizeExcalidrawArrowStyle(item),
        label: getString(item.text, ""),
        locked,
        groupId,
      },
    });
  }

  if (type === "image") {
    const fileId = typeof item.fileId === "string" ? item.fileId : "";
    const file = fileId ? files[fileId] : undefined;
    const src = file?.dataURL?.trim();
    if (!src) return null;
    return createCanvasElement("image", {
      id,
      x,
      y,
      overrides: { width, height, src, locked, groupId, stroke: "transparent", fill: "transparent" },
    });
  }

  return null;
}

function getDraftZ(vertex: DraftVertex) {
  return typeof vertex["tm.z"] === "number" ? vertex["tm.z"] : Number.MAX_SAFE_INTEGER;
}

function getDraftRect(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const coords = getPair(value[0]);
  const dims = getPair(value[1]);
  if (!coords || !dims) return null;
  return {
    x: coords[0],
    y: coords[1],
    width: Math.max(1, dims[0]),
    height: Math.max(1, dims[1]),
  };
}

function getPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = typeof value[0] === "number" ? value[0] : null;
  const y = typeof value[1] === "number" ? value[1] : null;
  if (x === null || y === null) return null;
  return [x, y];
}

function getExcalidrawLineEndpoints(item: Record<string, unknown>) {
  const points = Array.isArray(item.points) ? item.points : null;
  const baseX = typeof item.x === "number" ? item.x : 0;
  const baseY = typeof item.y === "number" ? item.y : 0;
  if (points && points.length >= 2) {
    const first = getPair(points[0]);
    const last = getPair(points[points.length - 1]);
    if (first && last) {
      return {
        x: baseX + first[0],
        y: baseY + first[1],
        x2: baseX + last[0],
        y2: baseY + last[1],
      };
    }
  }
  const width = typeof item.width === "number" ? item.width : 0;
  const height = typeof item.height === "number" ? item.height : 0;
  return { x: baseX, y: baseY, x2: baseX + width, y2: baseY + height };
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "auto") return fallback;
  return trimmed;
}

function normalizeFontFamily(value: unknown) {
  if (typeof value !== "string") return "system-ui";
  const trimmed = value.trim();
  return trimmed || "system-ui";
}

function normalizeExcalidrawFontFamily(value: unknown) {
  if (typeof value === "number") {
    if (value === 1) return "Virgil, system-ui";
    if (value === 2) return "Helvetica, Arial, sans-serif";
    if (value === 3) return "Cascadia, monospace";
  }
  return normalizeFontFamily(value);
}

function normalizeTextAlign(value: unknown): "left" | "center" | "right" {
  if (value === "center" || value === "right") return value;
  return "left";
}

function normalizeLineStyle(value: unknown): LineStyle {
  if (typeof value === "string" && value.trim()) {
    return "dashed";
  }
  return "solid";
}

function normalizeStrokeStyle(value: unknown): StrokeStyle {
  if (value === "dashed" || value === "dotted") return value;
  return "solid";
}

function normalizeStrokeStyleToLineStyle(value: unknown): LineStyle {
  if (value === "dashed" || value === "dotted") return value;
  return "solid";
}

function normalizeExcalidrawArrow(item: Record<string, unknown>): LineArrow {
  const start = item.startArrowhead;
  const end = item.endArrowhead;
  if (start && end) return "both";
  if (start) return "start";
  if (end) return "end";
  return "end";
}

function normalizeExcalidrawArrowStyle(item: Record<string, unknown>): LineArrowStyle {
  const end = typeof item.endArrowhead === "string" ? item.endArrowhead : "";
  const start = typeof item.startArrowhead === "string" ? item.startArrowhead : "";
  if (end === "arrow" || start === "arrow") return "open";
  return "filled";
}

function normalizeExcalidrawCornerRadius(value: unknown): 0 | 16 | 32 {
  if (!value) return 0;
  if (typeof value === "number") {
    return value >= 24 ? 32 : 16;
  }
  if (isObject(value)) {
    const type = typeof value.type === "number" ? value.type : null;
    const radius = typeof value.value === "number" ? value.value : null;
    if (radius !== null) {
      return radius >= 24 ? 32 : 16;
    }
    if (type === 3) return 32;
    return 16;
  }
  return 16;
}

function getExcalidrawGroupId(item: Record<string, unknown>) {
  if (!Array.isArray(item.groupIds)) return null;
  for (const groupId of item.groupIds) {
    if (typeof groupId === "string" && groupId.trim()) {
      return groupId;
    }
  }
  return null;
}

function normalizeImportedGroups(elements: CanvasElement[]) {
  const counts = new Map<string, number>();
  for (const element of elements) {
    if (!element.groupId) continue;
    counts.set(element.groupId, (counts.get(element.groupId) ?? 0) + 1);
  }

  for (const element of elements) {
    if (element.groupId && (counts.get(element.groupId) ?? 0) < 2) {
      element.groupId = null;
    }
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function createDefaultDocumentState(elements: CanvasElement[]): CanvasDocumentState {
  return {
    elements,
    viewport: { x: 0, y: 0, zoom: 1 },
    gridSize: 24,
    showGrid: true,
    snapToGrid: false,
  };
}

function buildStats(elements: CanvasElement[], ignored: number): ImportStats {
  const byType = { ...EMPTY_STATS.byType };
  for (const element of elements) {
    byType[element.type] += 1;
  }
  return {
    imported: elements.length,
    ignored,
    byType,
  };
}

function makeSuccess(
  format: ImportFormat,
  documentState: CanvasDocumentState,
  warnings: string[],
  stats: ImportStats,
): DocumentImportSuccess {
  return { ok: true, format, documentState, warnings, stats };
}

function makeFailure(
  format: ImportFormat | null,
  error: string,
  warnings: string[] = [],
  stats: ImportStats = EMPTY_STATS,
): DocumentImportFailure {
  return { ok: false, format, error, warnings, stats };
}
