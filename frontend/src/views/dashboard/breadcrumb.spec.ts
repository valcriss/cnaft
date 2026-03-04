import { describe, expect, it } from "vitest";
import { buildFolderBreadcrumbSegments, getReadableTextColor } from "./breadcrumb";

describe("getReadableTextColor", () => {
  it("returns white for dark backgrounds", () => {
    expect(getReadableTextColor("#0f172a")).toBe("#ffffff");
  });

  it("returns dark text for light backgrounds", () => {
    expect(getReadableTextColor("#e2e8f0")).toBe("#0f172a");
  });

  it("falls back to default for invalid hex", () => {
    expect(getReadableTextColor("not-a-color")).toBe("#ffffff");
  });
});

describe("buildFolderBreadcrumbSegments", () => {
  const allFoldersId = "__all__";
  const unassignedFoldersId = "__unassigned__";
  const folderNamesById = new Map<string, string>([
    ["rootA", "Clients"],
    ["childA", "2026"],
    ["leafA", "Acme"],
  ]);
  const folderColorsById = new Map<string, string>([
    ["rootA", "#2563eb"],
    ["childA", "#0ea5e9"],
    ["leafA", "#10b981"],
  ]);
  const folderParentById = new Map<string, string | null>([
    ["rootA", null],
    ["childA", "rootA"],
    ["leafA", "childA"],
  ]);

  it("builds a special path for all documents", () => {
    const result = buildFolderBreadcrumbSegments({
      selectedFolderId: allFoldersId,
      allFoldersId,
      unassignedFoldersId,
      folderNamesById,
      folderColorsById,
      folderParentById,
    });

    expect(result).toEqual([{ id: allFoldersId, label: "Tous les documents", color: null, isActive: true }]);
  });

  it("builds a special path for unassigned", () => {
    const result = buildFolderBreadcrumbSegments({
      selectedFolderId: unassignedFoldersId,
      allFoldersId,
      unassignedFoldersId,
      folderNamesById,
      folderColorsById,
      folderParentById,
    });

    expect(result).toEqual([
      { id: allFoldersId, label: "Tous les documents", color: null, isActive: false },
      { id: unassignedFoldersId, label: "Sans dossier", color: null, isActive: true },
    ]);
  });

  it("builds the nested folder path with each folder color", () => {
    const result = buildFolderBreadcrumbSegments({
      selectedFolderId: "leafA",
      allFoldersId,
      unassignedFoldersId,
      folderNamesById,
      folderColorsById,
      folderParentById,
    });

    expect(result).toEqual([
      { id: allFoldersId, label: "Tous les documents", color: null, isActive: false },
      { id: "rootA", label: "Clients", color: "#2563eb", isActive: false },
      { id: "childA", label: "2026", color: "#0ea5e9", isActive: false },
      { id: "leafA", label: "Acme", color: "#10b981", isActive: true },
    ]);
  });
});
