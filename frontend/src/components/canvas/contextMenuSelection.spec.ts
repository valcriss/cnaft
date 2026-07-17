import { describe, expect, it } from "vitest";
import { createCanvasElement } from "../../domain/elements";
import {
  getSelectionContextElementType,
  isPointInsideRect,
  shouldPreserveMultiSelectionForContextMenu,
} from "./contextMenuSelection";

describe("contextMenuSelection", () => {
  it("preserves a multi-selection when right click stays inside its bounds", () => {
    const first = createCanvasElement("rectangle", { x: 10, y: 20 });
    const second = createCanvasElement("rectangle", { x: 200, y: 120 });

    expect(
      shouldPreserveMultiSelectionForContextMenu(
        [first, second],
        { x: 10, y: 20, width: 310, height: 220 },
        150,
        80,
      ),
    ).toBe(true);
  });

  it("does not preserve a single-element selection", () => {
    const rectangle = createCanvasElement("rectangle", { x: 10, y: 20 });

    expect(
      shouldPreserveMultiSelectionForContextMenu(
        [rectangle],
        { x: 10, y: 20, width: 120, height: 120 },
        30,
        40,
      ),
    ).toBe(false);
  });

  it("uses a common type only when the full selection matches", () => {
    const rectangleA = createCanvasElement("rectangle", { x: 0, y: 0 });
    const rectangleB = createCanvasElement("rectangle", { x: 50, y: 50 });
    const note = createCanvasElement("note", { x: 100, y: 100 });

    expect(getSelectionContextElementType([rectangleA, rectangleB])).toBe("rectangle");
    expect(getSelectionContextElementType([rectangleA, note])).toBeNull();
  });

  it("checks inclusion inside a rectangle bounds", () => {
    expect(isPointInsideRect(20, 30, { x: 10, y: 20, width: 100, height: 100 })).toBe(true);
    expect(isPointInsideRect(200, 30, { x: 10, y: 20, width: 100, height: 100 })).toBe(false);
  });
});
