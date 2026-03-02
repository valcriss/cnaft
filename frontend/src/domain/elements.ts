import { randomUUID } from "../utils/uuid";

export type LineStyle = "solid" | "dashed" | "dotted";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type LineRoute = "straight" | "orthogonal" | "curve";
export type LineArrow = "none" | "start" | "end" | "both";
export type LineArrowStyle = "filled" | "open";
export type TextAlign = "left" | "center" | "right";
export type TextVerticalAlign = "top" | "middle" | "bottom";
export type TextTransformMode = "none" | "uppercase" | "capitalize";
export type ShadowType = "none" | "soft" | "offset" | "glow";
export type EnvelopeType = "convex" | "rectangle" | "rounded";
export type AnchorPosition =
  | "top"
  | "topRight"
  | "right"
  | "bottomRight"
  | "bottom"
  | "bottomLeft"
  | "left"
  | "topLeft";
export type ElementType = "rectangle" | "text" | "note" | "line" | "image" | "envelope";
export type Tool = "select" | ElementType;

type BaseCanvasElement = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeStyle?: StrokeStyle;
  locked?: boolean;
  shadowType?: ShadowType;
};

export type RectangleElement = BaseCanvasElement & {
  type: "rectangle";
};

export type TextElement = BaseCanvasElement & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  textVerticalAlign: TextVerticalAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformMode;
};

export type NoteElement = BaseCanvasElement & {
  type: "note";
  text: string;
  textColor?: string;
  noteReactions?: Record<string, string>;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  textVerticalAlign: TextVerticalAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformMode;
};

export type LineElement = BaseCanvasElement & {
  type: "line";
  x2: number;
  y2: number;
  lineStyle: LineStyle;
  lineRoute: LineRoute;
  lineArrow: LineArrow;
  lineArrowStyle: LineArrowStyle;
  label: string;
  labelColor: string;
  labelBg: string;
  labelSize: number;
  strokeWidth: number;
  startAnchor?: { elementId: string; position: AnchorPosition } | null;
  endAnchor?: { elementId: string; position: AnchorPosition } | null;
};

export type ImageElement = BaseCanvasElement & {
  type: "image";
  src: string;
};

export type EnvelopeElement = BaseCanvasElement & {
  type: "envelope";
  memberIds: string[];
  envelopeType: EnvelopeType;
  text: string;
  titleOffsetX: number;
  titleOffsetY: number;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  textVerticalAlign: TextVerticalAlign;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  textTransform: TextTransformMode;
};

export type CanvasElement =
  | RectangleElement
  | TextElement
  | NoteElement
  | LineElement
  | ImageElement
  | EnvelopeElement;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_TEXT_SIZE = 20;

type CreateParams<T extends CanvasElement> = {
  id?: string;
  x: number;
  y: number;
  overrides?: Partial<Omit<T, "id" | "type" | "x" | "y">>;
};

type BoundsContext = {
  measureTextBounds: (
    text: string,
    fontSize: number,
    fallbackWidth: number,
    fallbackHeight: number,
  ) => { width: number; height: number };
};

type ElementDefinition<T extends CanvasElement> = {
  type: T["type"];
  create: (params: CreateParams<T>) => T;
  getBounds: (element: T, context: BoundsContext) => Rect;
};

const rectangleDefinition: ElementDefinition<RectangleElement> = {
  type: "rectangle",
  create: ({ id, x, y, overrides }) => ({
    id: id ?? randomUUID(),
    type: "rectangle",
    x,
    y,
    width: overrides?.width ?? 220,
    height: overrides?.height ?? 130,
    fill: overrides?.fill ?? "#fef08a",
    stroke: overrides?.stroke ?? "#ca8a04",
    strokeStyle: overrides?.strokeStyle ?? "solid",
    locked: overrides?.locked ?? false,
    shadowType: overrides?.shadowType ?? "none",
  }),
  getBounds: (element) => ({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }),
};

const textDefinition: ElementDefinition<TextElement> = {
  type: "text",
  create: ({ id, x, y, overrides }) => {
    const text = overrides?.text ?? "Nouvelle note";
    const fontSize = overrides?.fontSize ?? DEFAULT_TEXT_SIZE;

    return {
      id: id ?? randomUUID(),
      type: "text",
      x,
      y,
      width: overrides?.width ?? Math.max(120, text.length * fontSize * 0.55),
      height: overrides?.height ?? Math.max(32, fontSize * 1.5),
      fill: overrides?.fill ?? "#0f172a",
      stroke: overrides?.stroke ?? "#0f172a",
      strokeStyle: overrides?.strokeStyle ?? "solid",
      locked: overrides?.locked ?? false,
      shadowType: overrides?.shadowType ?? "none",
      text,
      fontSize,
      fontFamily: overrides?.fontFamily ?? "system-ui",
      textAlign: overrides?.textAlign ?? "left",
      textVerticalAlign: overrides?.textVerticalAlign ?? "top",
      bold: overrides?.bold ?? false,
      italic: overrides?.italic ?? false,
      underline: overrides?.underline ?? false,
      lineHeight: overrides?.lineHeight ?? 1.2,
      letterSpacing: overrides?.letterSpacing ?? 0,
      textTransform: overrides?.textTransform ?? "none",
    };
  },
  getBounds: (element) => ({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }),
};

const noteDefinition: ElementDefinition<NoteElement> = {
  type: "note",
  create: ({ id, x, y, overrides }) => ({
    id: id ?? randomUUID(),
    type: "note",
    x,
    y,
    width: overrides?.width ?? 180,
    height: overrides?.height ?? 180,
    fill: overrides?.fill ?? "#fef08a",
    stroke: overrides?.stroke ?? "#ca8a04",
    strokeStyle: overrides?.strokeStyle ?? "solid",
    locked: overrides?.locked ?? false,
    shadowType: overrides?.shadowType ?? "none",
    textColor: overrides?.textColor ?? "#1f2937",
    noteReactions: overrides?.noteReactions ?? {},
    text: overrides?.text ?? "Nouvelle note carree",
    fontSize: overrides?.fontSize ?? 20,
    fontFamily: overrides?.fontFamily ?? "system-ui",
    textAlign: overrides?.textAlign ?? "center",
    textVerticalAlign: overrides?.textVerticalAlign ?? "middle",
    bold: overrides?.bold ?? false,
    italic: overrides?.italic ?? false,
    underline: overrides?.underline ?? false,
    lineHeight: overrides?.lineHeight ?? 1.3,
    letterSpacing: overrides?.letterSpacing ?? 0,
    textTransform: overrides?.textTransform ?? "none",
  }),
  getBounds: (element) => ({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }),
};

const lineDefinition: ElementDefinition<LineElement> = {
  type: "line",
  create: ({ id, x, y, overrides }) => {
    const x2 = overrides?.x2 ?? x + 180;
    const y2 = overrides?.y2 ?? y;
    return {
      id: id ?? randomUUID(),
      type: "line",
      x,
      y,
      x2,
      y2,
      width: Math.max(1, Math.abs(x2 - x)),
      height: Math.max(1, Math.abs(y2 - y)),
      fill: overrides?.fill ?? "transparent",
      stroke: overrides?.stroke ?? "#334155",
      strokeStyle: overrides?.strokeStyle ?? "solid",
      locked: overrides?.locked ?? false,
      shadowType: overrides?.shadowType ?? "none",
      lineStyle: overrides?.lineStyle ?? "solid",
      lineRoute: overrides?.lineRoute ?? "straight",
      lineArrow: overrides?.lineArrow ?? "none",
      lineArrowStyle: overrides?.lineArrowStyle ?? "filled",
      label: overrides?.label ?? "",
      labelColor: overrides?.labelColor ?? "#0f172a",
      labelBg: overrides?.labelBg ?? "#ffffff",
      labelSize: overrides?.labelSize ?? 12,
      strokeWidth: overrides?.strokeWidth ?? 2,
      startAnchor: overrides?.startAnchor ?? null,
      endAnchor: overrides?.endAnchor ?? null,
    };
  },
  getBounds: (element) => ({
    x: Math.min(element.x, element.x2),
    y: Math.min(element.y, element.y2),
    width: Math.max(1, Math.abs(element.x2 - element.x)),
    height: Math.max(1, Math.abs(element.y2 - element.y)),
  }),
};

const imageDefinition: ElementDefinition<ImageElement> = {
  type: "image",
  create: ({ id, x, y, overrides }) => ({
    id: id ?? randomUUID(),
    type: "image",
    x,
    y,
    width: overrides?.width ?? 220,
    height: overrides?.height ?? 160,
    fill: overrides?.fill ?? "transparent",
    stroke: overrides?.stroke ?? "transparent",
    strokeStyle: overrides?.strokeStyle ?? "solid",
    locked: overrides?.locked ?? false,
    shadowType: overrides?.shadowType ?? "none",
    src: overrides?.src ?? "",
  }),
  getBounds: (element) => ({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }),
};

const envelopeDefinition: ElementDefinition<EnvelopeElement> = {
  type: "envelope",
  create: ({ id, x, y, overrides }) => ({
    id: id ?? randomUUID(),
    type: "envelope",
    x,
    y,
    width: overrides?.width ?? 240,
    height: overrides?.height ?? 180,
    fill: overrides?.fill ?? "#e2e8f0",
    stroke: overrides?.stroke ?? "#475569",
    strokeStyle: overrides?.strokeStyle ?? "solid",
    locked: overrides?.locked ?? false,
    shadowType: overrides?.shadowType ?? "none",
    memberIds: overrides?.memberIds ?? [],
    envelopeType: overrides?.envelopeType ?? "convex",
    text: overrides?.text ?? "Enveloppe",
    titleOffsetX: overrides?.titleOffsetX ?? 8,
    titleOffsetY: overrides?.titleOffsetY ?? -30,
    textColor: overrides?.textColor ?? "#0f172a",
    fontSize: overrides?.fontSize ?? 18,
    fontFamily: overrides?.fontFamily ?? "system-ui",
    textAlign: overrides?.textAlign ?? "center",
    textVerticalAlign: overrides?.textVerticalAlign ?? "middle",
    bold: overrides?.bold ?? true,
    italic: overrides?.italic ?? false,
    underline: overrides?.underline ?? false,
    lineHeight: overrides?.lineHeight ?? 1.2,
    letterSpacing: overrides?.letterSpacing ?? 0,
    textTransform: overrides?.textTransform ?? "none",
  }),
  getBounds: (element) => ({
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  }),
};

const definitions = {
  rectangle: rectangleDefinition,
  text: textDefinition,
  note: noteDefinition,
  line: lineDefinition,
  image: imageDefinition,
  envelope: envelopeDefinition,
} as const;

export const ELEMENT_TYPES = Object.keys(definitions) as ElementType[];

export function createCanvasElement(
  type: "rectangle",
  params: CreateParams<RectangleElement>,
): RectangleElement;
export function createCanvasElement(
  type: "text",
  params: CreateParams<TextElement>,
): TextElement;
export function createCanvasElement(
  type: "note",
  params: CreateParams<NoteElement>,
): NoteElement;
export function createCanvasElement(
  type: "line",
  params: CreateParams<LineElement>,
): LineElement;
export function createCanvasElement(
  type: "image",
  params: CreateParams<ImageElement>,
): ImageElement;
export function createCanvasElement(
  type: "envelope",
  params: CreateParams<EnvelopeElement>,
): EnvelopeElement;
export function createCanvasElement(
  type: ElementType,
  params: CreateParams<CanvasElement>,
): CanvasElement {
  if (type === "rectangle") {
    return rectangleDefinition.create(params as CreateParams<RectangleElement>);
  }

  if (type === "text") {
    return textDefinition.create(params as CreateParams<TextElement>);
  }

  if (type === "note") {
    return noteDefinition.create(params as CreateParams<NoteElement>);
  }

  if (type === "line") {
    return lineDefinition.create(params as CreateParams<LineElement>);
  }

  if (type === "image") {
    return imageDefinition.create(params as CreateParams<ImageElement>);
  }

  return envelopeDefinition.create(params as CreateParams<EnvelopeElement>);
}

export function getElementBounds(
  element: CanvasElement,
  context: BoundsContext,
): Rect {
  if (element.type === "rectangle") {
    return rectangleDefinition.getBounds(element, context);
  }

  if (element.type === "text") {
    return textDefinition.getBounds(element, context);
  }

  if (element.type === "note") {
    return noteDefinition.getBounds(element, context);
  }

  if (element.type === "line") {
    return lineDefinition.getBounds(element, context);
  }

  if (element.type === "image") {
    return imageDefinition.getBounds(element, context);
  }

  return envelopeDefinition.getBounds(element, context);
}
