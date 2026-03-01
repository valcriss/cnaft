import type { CanvasElement } from "./elements";

export const DOCUMENT_SCHEMA = "canvas-framework";
export const DOCUMENT_VERSION = 1;

export type DocumentViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasDocumentState = {
  elements: CanvasElement[];
  viewport: DocumentViewport;
  gridSize: number;
  showGrid: boolean;
  snapToGrid: boolean;
};

export type VersionedCanvasDocument = {
  schema: typeof DOCUMENT_SCHEMA;
  version: typeof DOCUMENT_VERSION;
  meta: {
    revision: number;
    clientId: string;
    exportedAt: string;
  };
  state: CanvasDocumentState;
};

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
