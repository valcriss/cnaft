import type { CanvasElement } from "../../stores/useCanvasStore";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isPointInsideRect(x: number, y: number, rect: Rect | null) {
  if (!rect) return false;
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

export function shouldPreserveMultiSelectionForContextMenu(
  selectedElements: CanvasElement[],
  selectionBounds: Rect | null,
  worldX: number,
  worldY: number,
) {
  if (selectedElements.length <= 1) return false;
  return isPointInsideRect(worldX, worldY, selectionBounds);
}

export function getSelectionContextElementType(selectedElements: CanvasElement[]): CanvasElement["type"] | null {
  const firstType = selectedElements[0]?.type;
  if (!firstType) return null;
  return selectedElements.every((element) => element.type === firstType) ? firstType : null;
}
