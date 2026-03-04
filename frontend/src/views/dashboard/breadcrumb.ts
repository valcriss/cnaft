export type BreadcrumbSegment = {
  id: string;
  label: string;
  color: string | null;
  isActive: boolean;
};

export function getReadableTextColor(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#64748b";
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.62 ? "#0f172a" : "#ffffff";
}

type BuildFolderBreadcrumbSegmentsParams = {
  selectedFolderId: string;
  allFoldersId: string;
  unassignedFoldersId: string;
  folderNamesById: Map<string, string>;
  folderColorsById: Map<string, string>;
  folderParentById: Map<string, string | null>;
};

export function buildFolderBreadcrumbSegments(params: BuildFolderBreadcrumbSegmentsParams): BreadcrumbSegment[] {
  const {
    selectedFolderId,
    allFoldersId,
    unassignedFoldersId,
    folderNamesById,
    folderColorsById,
    folderParentById,
  } = params;

  if (selectedFolderId === allFoldersId) {
    return [{ id: allFoldersId, label: "Tous les documents", color: null, isActive: true }];
  }
  if (selectedFolderId === unassignedFoldersId) {
    return [
      { id: allFoldersId, label: "Tous les documents", color: null, isActive: false },
      { id: unassignedFoldersId, label: "Sans dossier", color: null, isActive: true },
    ];
  }

  const chain: string[] = [];
  let cursor: string | null = selectedFolderId;
  while (cursor && folderNamesById.has(cursor)) {
    chain.push(cursor);
    cursor = folderParentById.get(cursor) ?? null;
  }
  chain.reverse();

  const segments: BreadcrumbSegment[] = [
    { id: allFoldersId, label: "Tous les documents", color: null, isActive: false },
  ];

  for (let i = 0; i < chain.length; i += 1) {
    const id = chain[i];
    if (!id) continue;
    segments.push({
      id,
      label: folderNamesById.get(id) ?? "Dossier",
      color: folderColorsById.get(id) ?? null,
      isActive: i === chain.length - 1,
    });
  }

  return segments;
}
