/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { detectImportFormat, importDocumentContent } from "./documentImport";

const draftFixture = readFileSync(resolve(process.cwd(), "../resources/Rétro Light Sprint 40.drft"), "utf8");
const excalidrawFixture = readFileSync(resolve(process.cwd(), "../resources/ul-incub-1.excalidraw"), "utf8");

describe("detectImportFormat", () => {
  it("detects a Draft file from extension and content", () => {
    expect(detectImportFormat("retro.drft", draftFixture)).toBe("draft");
    expect(detectImportFormat(undefined, draftFixture)).toBe("draft");
  });

  it("detects an Excalidraw file from extension and content", () => {
    expect(detectImportFormat("board.excalidraw", excalidrawFixture)).toBe("excalidraw");
    expect(detectImportFormat(undefined, excalidrawFixture)).toBe("excalidraw");
  });

  it("detects native JSON from schema", () => {
    const native = JSON.stringify({
      schema: "canvas-framework",
      version: 1,
      meta: { revision: 1, clientId: "client-1", exportedAt: "2026-07-17T12:00:00.000Z" },
      state: {
        elements: [{ id: "n1", type: "note", x: 10, y: 20, width: 100, height: 100, text: "A", fill: "#fff", stroke: "#000" }],
        viewport: { x: 0, y: 0, zoom: 1 },
        gridSize: 24,
        showGrid: true,
        snapToGrid: false,
      },
    });

    expect(detectImportFormat("doc.json", native)).toBe("native-json");
  });

  it("returns null for incoherent JSON", () => {
    expect(detectImportFormat("odd.json", "{\"foo\":true}")).toBeNull();
  });
});

describe("importDocumentContent", () => {
  it("imports Draft notes, textboxes, and lines", () => {
    const result = importDocumentContent("retro.drft", draftFixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("draft");
    expect(result.stats.byType.note).toBeGreaterThan(0);
    expect(result.stats.byType.text).toBeGreaterThan(0);
    expect(result.stats.byType.line).toBeGreaterThan(0);
    const textbox = result.documentState.elements.find((element) => element.type === "text");
    expect(textbox?.type).toBe("text");
    if (textbox?.type === "text") {
      expect(textbox.fill).not.toBe("transparent");
    }
    expect(result.warnings.join(" ")).toContain("Icon");
  });

  it("imports Excalidraw rectangles and text while ignoring unsupported images without data", () => {
    const withImage = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "img-1",
          type: "image",
          x: 10,
          y: 10,
          width: 120,
          height: 120,
          strokeColor: "transparent",
          backgroundColor: "transparent",
          strokeWidth: 1,
          strokeStyle: "solid",
          fileId: "missing-file",
          locked: false,
        },
        {
          id: "rect-1",
          type: "rectangle",
          x: 50,
          y: 40,
          width: 140,
          height: 90,
          strokeColor: "#111827",
          backgroundColor: "#fef08a",
          strokeWidth: 2,
          strokeStyle: "solid",
          locked: false,
        },
        {
          id: "text-1",
          type: "text",
          x: 60,
          y: 50,
          width: 100,
          height: 32,
          strokeColor: "#0f172a",
          backgroundColor: "transparent",
          text: "hello",
          fontSize: 24,
          textAlign: "center",
          locked: false,
        },
      ],
      files: {},
    });
    const result = importDocumentContent("board.excalidraw", withImage);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("excalidraw");
    expect(result.stats.byType.rectangle).toBeGreaterThan(0);
    expect(result.stats.byType.text).toBeGreaterThan(0);
    const text = result.documentState.elements.find((element) => element.type === "text");
    expect(text?.type).toBe("text");
    if (text?.type === "text") {
      expect(text.fill).toBe("#0f172a");
    }
    expect(result.stats.ignored).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toContain("image");
  });

  it("imports a native JSON document", () => {
    const native = JSON.stringify({
      schema: "canvas-framework",
      version: 1,
      meta: { revision: 1, clientId: "client-1", exportedAt: "2026-07-17T12:00:00.000Z" },
      state: {
        elements: [
          {
            id: "r1",
            type: "rectangle",
            x: 10,
            y: 20,
            width: 120,
            height: 80,
            fill: "#ffffff",
            stroke: "#000000",
            cornerRadius: 16,
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
        gridSize: 24,
        showGrid: true,
        snapToGrid: false,
      },
    });

    const result = importDocumentContent("doc.json", native);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe("native-json");
    expect(result.stats.byType.rectangle).toBe(1);
    const rectangle = result.documentState.elements[0];
    expect(rectangle?.type).toBe("rectangle");
    if (rectangle?.type === "rectangle") {
      expect(rectangle.cornerRadius).toBe(16);
    }
  });

  it("rejects a recognized format with no importable elements", () => {
    const emptyDraft = JSON.stringify({ vertices: [{ id: "x", "tm.view": "Icon" }], maps: [] });
    const result = importDocumentContent("empty.drft", emptyDraft);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.format).toBe("draft");
    expect(result.error).toContain("Aucun élément");
  });

  it("maps an Excalidraw arrow to a line with arrow metadata", () => {
    const arrowFile = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "a1",
          type: "arrow",
          x: 10,
          y: 20,
          width: 100,
          height: 40,
          strokeColor: "#111827",
          backgroundColor: "transparent",
          strokeWidth: 3,
          strokeStyle: "dashed",
          points: [
            [0, 0],
            [100, 40],
          ],
          endArrowhead: "triangle",
          locked: false,
        },
      ],
    });

    const result = importDocumentContent("arrow.excalidraw", arrowFile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.documentState.elements[0];
    expect(line?.type).toBe("line");
    if (line?.type !== "line") return;
    expect(line.lineArrow).toBe("end");
    expect(line.lineStyle).toBe("dashed");
    expect(line.strokeWidth).toBe(3);
  });

  it("imports Excalidraw rectangle roundness into a rounded preset", () => {
    const roundedRectangle = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "rounded-rect",
          type: "rectangle",
          x: 20,
          y: 30,
          width: 200,
          height: 100,
          strokeColor: "#111827",
          backgroundColor: "#fef08a",
          strokeWidth: 2,
          strokeStyle: "solid",
          roundness: { type: 2 },
          locked: false,
        },
      ],
    });

    const result = importDocumentContent("rounded.excalidraw", roundedRectangle);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rectangle = result.documentState.elements[0];
    expect(rectangle?.type).toBe("rectangle");
    if (rectangle?.type === "rectangle") {
      expect(rectangle.cornerRadius).toBe(16);
    }
  });

  it("recreates flat Excalidraw groups and flattens incomplete groups", () => {
    const groupedFile = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [
        {
          id: "rect-1",
          type: "rectangle",
          x: 20,
          y: 30,
          width: 120,
          height: 80,
          strokeColor: "#111827",
          backgroundColor: "#fef08a",
          strokeWidth: 2,
          strokeStyle: "solid",
          groupIds: ["group-a"],
        },
        {
          id: "text-1",
          type: "text",
          x: 40,
          y: 50,
          width: 100,
          height: 30,
          strokeColor: "#0f172a",
          backgroundColor: "transparent",
          text: "hello",
          fontSize: 24,
          groupIds: ["group-a"],
        },
        {
          id: "diamond-1",
          type: "diamond",
          x: 220,
          y: 30,
          width: 120,
          height: 80,
          strokeColor: "#111827",
          backgroundColor: "#fef08a",
          strokeWidth: 2,
          strokeStyle: "solid",
          groupIds: ["group-b"],
        },
        {
          id: "rect-2",
          type: "rectangle",
          x: 240,
          y: 50,
          width: 120,
          height: 80,
          strokeColor: "#111827",
          backgroundColor: "#fef08a",
          strokeWidth: 2,
          strokeStyle: "solid",
          groupIds: ["group-b"],
        },
      ],
    });

    const result = importDocumentContent("groups.excalidraw", groupedFile);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rect1 = result.documentState.elements.find((element) => element.id === "rect-1");
    const text1 = result.documentState.elements.find((element) => element.id === "text-1");
    const rect2 = result.documentState.elements.find((element) => element.id === "rect-2");

    expect(rect1?.groupId).toBe("group-a");
    expect(text1?.groupId).toBe("group-a");
    expect(rect2?.groupId).toBeNull();
  });
});
