import { describe, expect, it } from "vitest";
import { getTransparentRectangleHitMode, isPointInsideRect, isPointOnRectBorder } from "./hitTesting";

describe("hitTesting", () => {
  const rect = { x: 100, y: 100, width: 200, height: 120 };

  it("detects when a point is inside a rectangle", () => {
    expect(isPointInsideRect(150, 150, rect)).toBe(true);
    expect(isPointInsideRect(50, 150, rect)).toBe(false);
  });

  it("detects rectangle border hits with tolerance", () => {
    expect(isPointOnRectBorder(102, 160, rect, 6)).toBe(true);
    expect(isPointOnRectBorder(200, 160, rect, 6)).toBe(false);
  });

  it("treats transparent rectangle borders as selectable when stroke is visible", () => {
    expect(getTransparentRectangleHitMode(102, 160, rect, "#111827", 1)).toBe("border");
  });

  it("treats the interior of a transparent rectangle as pass-through", () => {
    expect(getTransparentRectangleHitMode(200, 160, rect, "#111827", 1)).toBe("interior");
    expect(getTransparentRectangleHitMode(102, 160, rect, "transparent", 1)).toBe("interior");
  });
});
