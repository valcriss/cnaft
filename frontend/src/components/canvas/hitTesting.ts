import type { Rect } from "../../domain/elements";

export function isPointInsideRect(worldX: number, worldY: number, rect: Rect) {
  return (
    worldX >= rect.x &&
    worldX <= rect.x + rect.width &&
    worldY >= rect.y &&
    worldY <= rect.y + rect.height
  );
}

export function isPointOnRectBorder(worldX: number, worldY: number, rect: Rect, tolerance: number) {
  if (!isPointInsideRect(worldX, worldY, rect)) return false;

  const leftDistance = Math.abs(worldX - rect.x);
  const rightDistance = Math.abs(worldX - (rect.x + rect.width));
  const topDistance = Math.abs(worldY - rect.y);
  const bottomDistance = Math.abs(worldY - (rect.y + rect.height));

  return (
    leftDistance <= tolerance ||
    rightDistance <= tolerance ||
    topDistance <= tolerance ||
    bottomDistance <= tolerance
  );
}

export function getTransparentRectangleHitMode(
  worldX: number,
  worldY: number,
  rect: Rect,
  stroke: string,
  zoom: number,
) {
  if (!isPointInsideRect(worldX, worldY, rect)) return "miss" as const;
  if (stroke !== "transparent" && isPointOnRectBorder(worldX, worldY, rect, 6 / zoom)) {
    return "border" as const;
  }
  return "interior" as const;
}
