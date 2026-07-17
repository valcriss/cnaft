import { beforeEach, describe, expect, it } from "vitest";
import { createCanvasElement } from "../domain/elements";
import { useCanvasStore } from "./useCanvasStore";

const store = useCanvasStore();

function resetStore() {
  store.replaceDocumentState({
    elements: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    gridSize: 24,
    showGrid: true,
    snapToGrid: false,
  });
  store.clearSelection();
}

describe("useCanvasStore groups", () => {
  beforeEach(() => {
    resetStore();
  });

  it("groups selected elements with a shared groupId", () => {
    const first = createCanvasElement("rectangle", { id: "r1", x: 10, y: 10 });
    const second = createCanvasElement("rectangle", { id: "r2", x: 180, y: 10 });

    store.replaceDocumentState({
      elements: [first, second],
      viewport: { x: 0, y: 0, zoom: 1 },
      gridSize: 24,
      showGrid: true,
      snapToGrid: false,
    });

    store.setSelectedMany(["r1", "r2"]);
    store.groupSelected();

    const elements = store.state.elements.filter((element) => element.id === "r1" || element.id === "r2");
    const groupIds = new Set(elements.map((element) => element.groupId));
    expect(groupIds.size).toBe(1);
    expect(elements.every((element) => typeof element.groupId === "string" && element.groupId.length > 0)).toBe(true);
  });

  it("selects all members when selecting one grouped element", () => {
    const groupId = "group-1";
    const first = createCanvasElement("rectangle", { id: "r1", x: 10, y: 10, overrides: { groupId } });
    const second = createCanvasElement("rectangle", { id: "r2", x: 180, y: 10, overrides: { groupId } });

    store.replaceDocumentState({
      elements: [first, second],
      viewport: { x: 0, y: 0, zoom: 1 },
      gridSize: 24,
      showGrid: true,
      snapToGrid: false,
    });

    store.setSelected("r1");

    expect(new Set(store.state.selectedIds)).toEqual(new Set(["r1", "r2"]));
  });

  it("ungroups the current group selection", () => {
    const groupId = "group-1";
    const first = createCanvasElement("rectangle", { id: "r1", x: 10, y: 10, overrides: { groupId } });
    const second = createCanvasElement("rectangle", { id: "r2", x: 180, y: 10, overrides: { groupId } });

    store.replaceDocumentState({
      elements: [first, second],
      viewport: { x: 0, y: 0, zoom: 1 },
      gridSize: 24,
      showGrid: true,
      snapToGrid: false,
    });

    store.setSelected("r1");
    store.ungroupSelected();

    expect(store.state.elements.every((element) => element.groupId == null)).toBe(true);
  });

  it("duplicates a group with a fresh groupId", () => {
    const groupId = "group-1";
    const first = createCanvasElement("rectangle", { id: "r1", x: 10, y: 10, overrides: { groupId } });
    const second = createCanvasElement("rectangle", { id: "r2", x: 180, y: 10, overrides: { groupId } });

    store.replaceDocumentState({
      elements: [first, second],
      viewport: { x: 0, y: 0, zoom: 1 },
      gridSize: 24,
      showGrid: true,
      snapToGrid: false,
    });

    store.setSelected("r1");
    store.duplicateSelected();

    const duplicated = store.state.elements.filter((element) => !["r1", "r2"].includes(element.id));
    expect(duplicated).toHaveLength(2);
    const duplicatedGroupIds = new Set(duplicated.map((element) => element.groupId));
    expect(duplicatedGroupIds.size).toBe(1);
    expect(duplicated[0]?.groupId).not.toBe(groupId);
  });
});
