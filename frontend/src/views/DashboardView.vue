<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import UserAccountMenu from "../components/auth/UserAccountMenu.vue";
import { ApiError, useAuthStore } from "../stores/useAuthStore";
import { buildFolderBreadcrumbSegments, getReadableTextColor } from "./dashboard/breadcrumb";

type DocTile = {
  id: string;
  title: string;
  thumbnailJson: unknown;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
  archivedByCurrentUser: boolean;
  folderId?: string | null;
};

type SvgThumbnailPayload = {
  kind: "svg";
  svg: string;
};

type FolderNode = {
  id: string;
  name: string;
  color: string;
  children: FolderNode[];
};

type FolderRow = {
  id: string;
  name: string;
  color: string;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

type FolderApiItem = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  sortIndex: number;
};

type TemplateTile = {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "shared";
  thumbnailJson: unknown;
  updatedAt: string;
  createdById: string;
  canEdit: boolean;
  createdBy?: {
    displayName: string;
    email: string;
  };
};

const ALL_FOLDERS_ID = "__all__";
const UNASSIGNED_FOLDERS_ID = "__unassigned__";
const TEMPLATES_ID = "__templates__";
const DND_DEBUG = false;

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const creating = ref(false);
const errorMessage = ref("");
const docs = ref<DocTile[]>([]);
const templates = ref<TemplateTile[]>([]);
const nowTs = ref(Date.now());
const includeArchived = ref(false);
const isFilterMenuOpen = ref(false);
const docMenuOpenFor = ref<string | null>(null);
const docMenuPosition = ref({ x: 0, y: 0 });
const actionLoadingFor = ref<string | null>(null);
const templateMenuOpenFor = ref<string | null>(null);
const templateMenuPosition = ref({ x: 0, y: 0 });
const templateActionLoadingFor = ref<string | null>(null);

const isCreateDocumentOpen = ref(false);
const templatePickerSearch = ref("");
const templatePickerFilter = ref<"all" | "private" | "shared">("all");
const isCreateTemplateOpen = ref(false);
const templateSourceDoc = ref<DocTile | null>(null);
const templateFormName = ref("");
const templateFormDescription = ref("");
const templateFormVisibility = ref<"private" | "shared">("private");
const templateFormSaving = ref(false);
const templateFormError = ref("");

const isRenameTemplateOpen = ref(false);
const renameTemplate = ref<TemplateTile | null>(null);
const renameTemplateName = ref("");
const renameTemplateDescription = ref("");
const renameTemplateVisibility = ref<"private" | "shared">("private");
const renameTemplateSaving = ref(false);
const renameTemplateError = ref("");

const isDeleteTemplateOpen = ref(false);
const deleteTemplate = ref<TemplateTile | null>(null);
const deleteTemplateSaving = ref(false);
const deleteTemplateError = ref("");

const isRenameOpen = ref(false);
const renameDoc = ref<DocTile | null>(null);
const renameValue = ref("");
const renameSaving = ref(false);
const renameError = ref("");

const isDeleteOpen = ref(false);
const deleteDoc = ref<DocTile | null>(null);
const deleteSaving = ref(false);
const deleteError = ref("");
const isDeleteFolderOpen = ref(false);
const deleteFolderId = ref<string | null>(null);
const deleteFolderName = ref("");
const deleteFolderSaving = ref(false);
const deleteFolderError = ref("");
const folderMenuOpenFor = ref<string | null>(null);
const folderMenuPosition = ref({ x: 0, y: 0 });
const isEditFolderOpen = ref(false);
const editFolderId = ref<string | null>(null);
const editFolderName = ref("");
const editFolderColor = ref("#64748b");
const editFolderSaving = ref(false);
const editFolderError = ref("");
const isAddFolderOpen = ref(false);
const addFolderValue = ref("");
const addFolderColor = ref("#64748b");
const addFolderError = ref("");

const isDirectoriesOpen = ref(true);
const isMobile = ref(false);
const initialRouteFolder = typeof route.query.folder === "string" && route.query.folder.trim() ? route.query.folder : ALL_FOLDERS_ID;
const selectedFolderId = ref<string>(initialRouteFolder);
const draggingDocId = ref<string | null>(null);
const dropTargetFolderId = ref<string | null>(null);
const draggingFolderId = ref<string | null>(null);
const dropTargetTreeFolderId = ref<string | null>(null);
const dropTargetTreePosition = ref<"before" | "after" | "inside" | null>(null);
const isTreeRootDropActive = ref(false);
const docFolders = ref<Record<string, string | null>>({});
const expandedFolders = ref<Record<string, boolean>>({
  projects: true,
  team: true,
  "projects/sales": true,
  "team/design": true,
});
const folderTree = ref<FolderNode[]>([]);

let nowTickIntervalId: number | null = null;
let folderPointerDragActive = false;
let folderPointerDragCandidate: { folderId: string; startX: number; startY: number } | null = null;
const activeDoc = computed(() => docs.value.find((doc) => doc.id === docMenuOpenFor.value) ?? null);
const activeTemplate = computed(() => templates.value.find((template) => template.id === templateMenuOpenFor.value) ?? null);
const activeFolder = computed(() => (folderMenuOpenFor.value ? folderRowsById.value.get(folderMenuOpenFor.value) ?? null : null));
const folderRows = computed(() => {
  const rows: FolderRow[] = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isExpanded = hasChildren ? expandedFolders.value[node.id] !== false : false;
      rows.push({ id: node.id, name: node.name, color: node.color, depth, hasChildren, isExpanded });
      if (hasChildren && isExpanded) walk(node.children, depth + 1);
    }
  };
  walk(folderTree.value, 0);
  return rows;
});
const folderRowsById = computed(() => {
  const index = new Map<string, FolderRow>();
  for (const row of folderRows.value) index.set(row.id, row);
  return index;
});
const folderNamesById = computed(() => {
  const index = new Map<string, string>();
  const walk = (nodes: FolderNode[]) => {
    for (const node of nodes) {
      index.set(node.id, node.name);
      if (node.children.length) walk(node.children);
    }
  };
  walk(folderTree.value);
  return index;
});
const folderColorsById = computed(() => {
  const index = new Map<string, string>();
  const walk = (nodes: FolderNode[]) => {
    for (const node of nodes) {
      index.set(node.id, node.color);
      if (node.children.length) walk(node.children);
    }
  };
  walk(folderTree.value);
  return index;
});
const folderParentById = computed(() => {
  const parentById = new Map<string, string | null>();
  const walk = (nodes: FolderNode[], parentId: string | null) => {
    for (const node of nodes) {
      parentById.set(node.id, parentId);
      if (node.children.length) walk(node.children, node.id);
    }
  };
  walk(folderTree.value, null);
  return parentById;
});
const folderBreadcrumbSegments = computed(() => {
  if (selectedFolderId.value === TEMPLATES_ID) {
    return [{ id: TEMPLATES_ID, label: "Templates", color: null, isActive: true }];
  }
  return buildFolderBreadcrumbSegments({
    selectedFolderId: selectedFolderId.value,
    allFoldersId: ALL_FOLDERS_ID,
    unassignedFoldersId: UNASSIGNED_FOLDERS_ID,
    folderNamesById: folderNamesById.value,
    folderColorsById: folderColorsById.value,
    folderParentById: folderParentById.value,
  });
});
const visibleDocs = computed(() => {
  if (selectedFolderId.value === TEMPLATES_ID) return [];
  if (selectedFolderId.value === ALL_FOLDERS_ID) return docs.value;
  if (selectedFolderId.value === UNASSIGNED_FOLDERS_ID) {
    return docs.value.filter((doc) => !docFolders.value[doc.id]);
  }
  return docs.value.filter((doc) => docFolders.value[doc.id] === selectedFolderId.value);
});
const unassignedDocCount = computed(() => docs.value.filter((doc) => !docFolders.value[doc.id]).length);
const selectedFolderLabel = computed(() => {
  if (selectedFolderId.value === ALL_FOLDERS_ID) return "Tous les documents";
  if (selectedFolderId.value === UNASSIGNED_FOLDERS_ID) return "Non classés";
  if (selectedFolderId.value === TEMPLATES_ID) return "Templates";
  return folderNamesById.value.get(selectedFolderId.value) ?? "Répertoire";
});
const docCountLabel = computed(() => {
  if (selectedFolderId.value === TEMPLATES_ID) return `${templates.value.length} template(s)`;
  if (selectedFolderId.value === ALL_FOLDERS_ID) return `${docs.value.length} document(s)`;
  return `${visibleDocs.value.length} / ${docs.value.length} document(s)`;
});
const emptyStateTitle = computed(() =>
  selectedFolderId.value === TEMPLATES_ID ? "Aucun template" :
  selectedFolderId.value === ALL_FOLDERS_ID ? "Aucun document" : `Aucun document dans ${selectedFolderLabel.value}`,
);
const emptyStateText = computed(() =>
  selectedFolderId.value === TEMPLATES_ID
    ? "Créez un template depuis le menu d'un document existant."
    :
  selectedFolderId.value === ALL_FOLDERS_ID
    ? "Créez un document pour commencer."
    : "Les nouveaux documents seront créés dans ce répertoire.",
);
const filteredTemplateChoices = computed(() => {
  const query = templatePickerSearch.value.trim().toLocaleLowerCase("fr-FR");
  return templates.value.filter((template) => {
    if (templatePickerFilter.value !== "all" && template.visibility !== templatePickerFilter.value) return false;
    if (!query) return true;
    return `${template.name} ${template.description} ${template.createdBy?.displayName ?? ""} ${template.createdBy?.email ?? ""}`
      .toLocaleLowerCase("fr-FR")
      .includes(query);
  });
});
const shouldShowDrawerOverlay = computed(() => isMobile.value && isDirectoriesOpen.value);
const directoriesPanelClasses = computed(() => ({
  "is-mobile": isMobile.value,
  "is-open": isDirectoriesOpen.value,
}));

function dndDebug(event: string, payload: Record<string, unknown> = {}) {
  if (!DND_DEBUG) return;
  console.debug(`[folders-dnd] ${event}`, payload);
}

function breadcrumbSegmentStyle(color: string | null, isActive: boolean) {
  if (!color) return {};
  return {
    backgroundColor: color,
    borderColor: color,
    color: getReadableTextColor(color),
    opacity: isActive ? "1" : "0.88",
  };
}

function onBreadcrumbSegmentClick(segmentId: string, isActive: boolean) {
  if (isActive) return;
  selectFolder(segmentId);
}

function clearFolderDragTargets() {
  dropTargetTreeFolderId.value = null;
  dropTargetTreePosition.value = null;
  isTreeRootDropActive.value = false;
}

function cleanupFolderPointerDrag() {
  window.removeEventListener("pointermove", onFolderHandlePointerMove);
  window.removeEventListener("pointerup", onFolderHandlePointerUp);
  window.removeEventListener("pointercancel", onFolderHandlePointerUp);
  document.body.style.userSelect = "";
  folderPointerDragActive = false;
  folderPointerDragCandidate = null;
}

function onFolderHandlePointerDown(folderId: string, event: PointerEvent) {
  if (event.button !== 0) return;
  folderPointerDragCandidate = {
    folderId,
    startX: event.clientX,
    startY: event.clientY,
  };
  window.addEventListener("pointermove", onFolderHandlePointerMove);
  window.addEventListener("pointerup", onFolderHandlePointerUp);
  window.addEventListener("pointercancel", onFolderHandlePointerUp);
  dndDebug("pointer:candidate", { folderId, x: event.clientX, y: event.clientY });
}

function onFolderHandlePointerMove(event: PointerEvent) {
  if (!folderPointerDragActive) {
    if (!folderPointerDragCandidate) return;
    const dx = Math.abs(event.clientX - folderPointerDragCandidate.startX);
    const dy = Math.abs(event.clientY - folderPointerDragCandidate.startY);
    if (dx < 4 && dy < 4) return;
    draggingDocId.value = null;
    dropTargetFolderId.value = null;
    draggingFolderId.value = folderPointerDragCandidate.folderId;
    clearFolderDragTargets();
    folderPointerDragActive = true;
    document.body.style.userSelect = "none";
    dndDebug("pointer:start", {
      folderId: folderPointerDragCandidate.folderId,
      startX: folderPointerDragCandidate.startX,
      startY: folderPointerDragCandidate.startY,
      x: event.clientX,
      y: event.clientY,
    });
  }
  if (!draggingFolderId.value) return;
  const sourceFolderId = draggingFolderId.value;
  const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  if (!element) {
    clearFolderDragTargets();
    return;
  }

  const row = element.closest(".folder-row") as HTMLElement | null;
  if (row) {
    const targetFolderId = row.dataset.folderId ?? null;
    if (!targetFolderId || targetFolderId === sourceFolderId) {
      clearFolderDragTargets();
      return;
    }
    const rect = row.getBoundingClientRect();
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const position: "before" | "after" | "inside" = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
    if (position === "inside" && isFolderInSubtree(sourceFolderId, targetFolderId)) {
      clearFolderDragTargets();
      return;
    }
    dropTargetTreeFolderId.value = targetFolderId;
    dropTargetTreePosition.value = position;
    isTreeRootDropActive.value = false;
    dndDebug("pointer:over-row", { sourceFolderId, targetFolderId, position, ratio });
    return;
  }

  const tree = element.closest(".folders-tree");
  if (tree) {
    dropTargetTreeFolderId.value = null;
    dropTargetTreePosition.value = null;
    isTreeRootDropActive.value = true;
    dndDebug("pointer:over-root", { sourceFolderId });
    return;
  }

  clearFolderDragTargets();
}

function onFolderHandlePointerUp(event: PointerEvent) {
  if (!folderPointerDragActive || !draggingFolderId.value) {
    cleanupFolderPointerDrag();
    return;
  }
  const sourceFolderId = draggingFolderId.value;
  const targetFolderId = dropTargetTreeFolderId.value;
  const targetPosition = dropTargetTreePosition.value;
  const shouldDropToRoot = isTreeRootDropActive.value;
  dndDebug("pointer:end", {
    sourceFolderId,
    targetFolderId,
    targetPosition,
    shouldDropToRoot,
    x: event.clientX,
    y: event.clientY,
  });
  cleanupFolderPointerDrag();

  const finalize = async () => {
    if (targetFolderId && targetPosition) {
      await moveFolderRelative(sourceFolderId, targetFolderId, targetPosition);
    } else if (shouldDropToRoot) {
      await moveFolderToRoot(sourceFolderId);
    }
    draggingFolderId.value = null;
    clearFolderDragTargets();
  };
  void finalize();
}

function onFoldersTreeDragOverCapture(event: DragEvent) {
  const target = event.target as HTMLElement | null;
  dndDebug("capture:dragover", {
    targetClass: target?.className ?? null,
    currentTargetClass: (event.currentTarget as HTMLElement | null)?.className ?? null,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    draggingFolderId: draggingFolderId.value,
    draggingDocId: draggingDocId.value,
  });
}

function onFoldersTreeDropCapture(event: DragEvent) {
  const target = event.target as HTMLElement | null;
  dndDebug("capture:drop", {
    targetClass: target?.className ?? null,
    currentTargetClass: (event.currentTarget as HTMLElement | null)?.className ?? null,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    draggingFolderId: draggingFolderId.value,
    draggingDocId: draggingDocId.value,
    payloadFolderId: event.dataTransfer?.getData("application/x-folder-id"),
    payloadText: event.dataTransfer?.getData("text/plain"),
  });
}

function mapApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.data === "object" && error.data && "error" in error.data) {
      return String((error.data as { error: unknown }).error);
    }
    return `Erreur API (${error.status})`;
  }
  return "Une erreur est survenue.";
}

function buildFolderTree(flat: FolderApiItem[]) {
  const byParent = new Map<string | null, FolderApiItem[]>();
  for (const item of flat) {
    const parentKey = item.parentId ?? null;
    const list = byParent.get(parentKey) ?? [];
    list.push(item);
    byParent.set(parentKey, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sortIndex - b.sortIndex);
  }
  const build = (parentId: string | null): FolderNode[] => {
    const children = byParent.get(parentId) ?? [];
    return children.map((item) => ({
      id: item.id,
      name: item.name,
      color: item.color,
      children: build(item.id),
    }));
  };
  return build(null);
}

async function loadFolders() {
  try {
    const data = await auth.apiRequest<{ folders: FolderApiItem[] }>("/folders", { auth: true });
    folderTree.value = buildFolderTree(data.folders);
    pruneDocFolderMapping();
  } catch (error) {
    errorMessage.value = mapApiError(error);
  }
}

async function loadDocuments() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const query = includeArchived.value ? "?includeArchived=1" : "";
    const data = await auth.apiRequest<{ documents: DocTile[] }>(`/documents${query}`, { auth: true });
    docs.value = data.documents;
    const nextFolders: Record<string, string | null> = {};
    for (const doc of data.documents) {
      nextFolders[doc.id] = doc.folderId ?? null;
    }
    docFolders.value = nextFolders;
    pruneDocFolderMapping();
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    loading.value = false;
  }
}

async function loadTemplates() {
  try {
    const data = await auth.apiRequest<{ templates: TemplateTile[] }>("/document-templates", { auth: true });
    templates.value = data.templates;
  } catch (error) {
    errorMessage.value = mapApiError(error);
  }
}

function selectedRealFolderId() {
  return folderNamesById.value.has(selectedFolderId.value) ? selectedFolderId.value : null;
}

function dashboardReturnPath() {
  const query = new URLSearchParams();
  query.set("folder", selectedFolderId.value);
  return `/dashboard?${query.toString()}`;
}

function workspaceLocation(path: string) {
  return {
    path,
    query: {
      from: dashboardReturnPath(),
    },
  };
}

function openCreateDocumentDialog() {
  isCreateDocumentOpen.value = true;
  templatePickerSearch.value = "";
  templatePickerFilter.value = "all";
  errorMessage.value = "";
}

function closeCreateDocumentDialog() {
  isCreateDocumentOpen.value = false;
}

async function createDocument() {
  creating.value = true;
  errorMessage.value = "";
  try {
    const initial = {
      elements: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      gridSize: 24,
      showGrid: true,
      snapToGrid: false,
    };
    const data = await auth.apiRequest<{ document: { id: string } }>("/documents", {
      method: "POST",
      auth: true,
      body: {
        title: "Nouveau document",
        contentJson: initial,
      },
    });
    const folderId = selectedRealFolderId();
    if (folderId) {
      await moveDocumentToFolder(data.document.id, folderId);
    }
    closeCreateDocumentDialog();
    await router.push(workspaceLocation(`/documents/${data.document.id}`));
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    creating.value = false;
  }
}

async function createDocumentFromTemplate(template: TemplateTile) {
  templateActionLoadingFor.value = template.id;
  errorMessage.value = "";
  try {
    const data = await auth.apiRequest<{ document: { id: string } }>(`/document-templates/${template.id}/create-document`, {
      method: "POST",
      auth: true,
      body: {
        folderId: selectedRealFolderId(),
      },
    });
    closeCreateDocumentDialog();
    closeTemplateMenu();
    await router.push(workspaceLocation(`/documents/${data.document.id}`));
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    templateActionLoadingFor.value = null;
  }
}

function openDocument(id: string) {
  router.push(workspaceLocation(`/documents/${id}`));
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSvgThumbnailPayload(value: unknown): SvgThumbnailPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== "svg") return null;
  if (typeof v.svg !== "string" || !v.svg.trim()) return null;
  return { kind: "svg", svg: v.svg };
}

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toggleFilterMenu() {
  isFilterMenuOpen.value = !isFilterMenuOpen.value;
}

function toggleDirectoriesPanel() {
  isDirectoriesOpen.value = !isDirectoriesOpen.value;
}

function openDirectoriesPanel() {
  isDirectoriesOpen.value = true;
}

async function toggleIncludeArchived() {
  await loadDocuments();
}

function toggleDocMenu(docId: string, event: MouseEvent) {
  if (docMenuOpenFor.value === docId) {
    docMenuOpenFor.value = null;
    return;
  }

  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  docMenuPosition.value = {
    x: rect ? rect.right : event.clientX,
    y: rect ? rect.bottom + 6 : event.clientY + 6,
  };
  docMenuOpenFor.value = docId;
}

function closeDocMenu() {
  docMenuOpenFor.value = null;
}

function toggleTemplateMenu(templateId: string, event: MouseEvent) {
  if (templateMenuOpenFor.value === templateId) {
    templateMenuOpenFor.value = null;
    return;
  }

  const target = event.currentTarget as HTMLElement | null;
  const rect = target?.getBoundingClientRect();
  templateMenuPosition.value = {
    x: rect ? rect.right : event.clientX,
    y: rect ? rect.bottom + 6 : event.clientY + 6,
  };
  templateMenuOpenFor.value = templateId;
}

function closeTemplateMenu() {
  templateMenuOpenFor.value = null;
}

function openFolderContextMenu(folder: FolderRow, event: MouseEvent) {
  event.preventDefault();
  const x = Math.min(event.clientX, window.innerWidth - 220);
  const y = Math.min(event.clientY, window.innerHeight - 160);
  folderMenuPosition.value = { x, y };
  folderMenuOpenFor.value = folder.id;
}

function closeFolderMenu() {
  folderMenuOpenFor.value = null;
}

function selectFolder(folderId: string) {
  selectedFolderId.value = folderId;
  if (isMobile.value) isDirectoriesOpen.value = false;
}

function toggleFolderExpansion(folderId: string) {
  expandedFolders.value = {
    ...expandedFolders.value,
    [folderId]: expandedFolders.value[folderId] === false,
  };
}

function openAddFolderDialog() {
  isAddFolderOpen.value = true;
  addFolderValue.value = "";
  addFolderColor.value = "#64748b";
  addFolderError.value = "";
}

function closeAddFolderDialog() {
  isAddFolderOpen.value = false;
  addFolderValue.value = "";
  addFolderColor.value = "#64748b";
  addFolderError.value = "";
}

async function confirmAddFolder() {
  const name = addFolderValue.value.trim();
  if (!name) {
    addFolderError.value = "Le nom du répertoire est requis.";
    return;
  }

  const parentId = folderNamesById.value.has(selectedFolderId.value) ? selectedFolderId.value : null;
  addFolderError.value = "";
  try {
    const data = await auth.apiRequest<{ folder: { id: string } }>("/folders", {
      method: "POST",
      auth: true,
      body: {
        name,
        parentId,
        color: addFolderColor.value,
      },
    });
    await loadFolders();
    selectedFolderId.value = data.folder.id;
    if (parentId) {
      expandedFolders.value = {
        ...expandedFolders.value,
        [parentId]: true,
      };
    }
    closeAddFolderDialog();
  } catch (error) {
    addFolderError.value = mapApiError(error);
  }
}

function findFolderNode(nodes: FolderNode[], folderId: string): FolderNode | null {
  for (const node of nodes) {
    if (node.id === folderId) return node;
    const child = findFolderNode(node.children, folderId);
    if (child) return child;
  }
  return null;
}

function isFolderInSubtree(sourceFolderId: string, potentialChildId: string) {
  const source = findFolderNode(folderTree.value, sourceFolderId);
  if (!source) return false;
  const walk = (nodes: FolderNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === potentialChildId) return true;
      if (walk(node.children)) return true;
    }
    return false;
  };
  return walk(source.children);
}

async function moveFolderToRoot(sourceFolderId: string) {
  await moveFolder(sourceFolderId, null, null);
}

async function moveFolder(sourceFolderId: string, parentId: string | null, beforeId: string | null) {
  dndDebug("moveFolder:request", { sourceFolderId, parentId, beforeId });
  try {
    await auth.apiRequest(`/folders/${sourceFolderId}/move`, {
      method: "PATCH",
      auth: true,
      body: {
        parentId,
        beforeId,
      },
    });
    if (parentId) {
      expandedFolders.value = {
        ...expandedFolders.value,
        [parentId]: true,
      };
    }
    await loadFolders();
    dndDebug("moveFolder:success", { sourceFolderId, parentId, beforeId });
  } catch (error) {
    dndDebug("moveFolder:error", {
      sourceFolderId,
      parentId,
      beforeId,
      error: mapApiError(error),
    });
    errorMessage.value = mapApiError(error);
  }
}

function findParentAndSiblings(folderId: string): { parentId: string | null; siblingIds: string[] } | null {
  const walk = (nodes: FolderNode[], parentId: string | null): { parentId: string | null; siblingIds: string[] } | null => {
    const siblingIds = nodes.map((node) => node.id);
    if (siblingIds.includes(folderId)) return { parentId, siblingIds };
    for (const node of nodes) {
      const found = walk(node.children, node.id);
      if (found) return found;
    }
    return null;
  };
  return walk(folderTree.value, null);
}

async function moveFolderRelative(sourceFolderId: string, targetFolderId: string, position: "before" | "after" | "inside") {
  dndDebug("moveFolderRelative:start", { sourceFolderId, targetFolderId, position });
  if (sourceFolderId === targetFolderId) return;
  if (position === "inside") {
    if (isFolderInSubtree(sourceFolderId, targetFolderId)) return;
    await moveFolder(sourceFolderId, targetFolderId, null);
    return;
  }

  const info = findParentAndSiblings(targetFolderId);
  if (!info) return;
  if (info.parentId && (info.parentId === sourceFolderId || isFolderInSubtree(sourceFolderId, info.parentId))) return;
  const siblings = info.siblingIds.filter((id) => id !== sourceFolderId);
  const targetIndex = siblings.indexOf(targetFolderId);
  if (targetIndex < 0) return;
  if (position === "before") {
    await moveFolder(sourceFolderId, info.parentId, targetFolderId);
    return;
  }
  const nextSiblingId = siblings[targetIndex + 1] ?? null;
  dndDebug("moveFolderRelative:computed", { sourceFolderId, targetFolderId, position, parentId: info.parentId, nextSiblingId });
  await moveFolder(sourceFolderId, info.parentId, nextSiblingId);
}

function onDocumentDragStart(docId: string, event: DragEvent) {
  draggingFolderId.value = null;
  dropTargetTreeFolderId.value = null;
  dropTargetTreePosition.value = null;
  isTreeRootDropActive.value = false;
  draggingDocId.value = docId;
  event.dataTransfer?.setData("text/plain", docId);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onDocumentDragEnd() {
  draggingDocId.value = null;
  dropTargetFolderId.value = null;
}

function onFolderDragOver(folderId: string, event: DragEvent) {
  const isFolderDrag = event.dataTransfer?.types?.includes("application/x-folder-id") || Boolean(draggingFolderId.value);
  const isDocDrag = !isFolderDrag && (event.dataTransfer?.types?.includes("text/plain") || Boolean(draggingDocId.value));
  dndDebug("dragover:folder:enter", {
    folderId,
    isFolderDrag,
    isDocDrag,
    draggingFolderId: draggingFolderId.value,
    draggingDocId: draggingDocId.value,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
  });

  if (isDocDrag) {
    event.preventDefault();
    dropTargetFolderId.value = folderId;
    return;
  }
  if (isFolderDrag && draggingFolderId.value) {
    if (!folderNamesById.value.has(folderId)) {
      dndDebug("dragover:folder:skip:not-in-tree", { folderId });
      return;
    }
    if (draggingFolderId.value === folderId) {
      dndDebug("dragover:folder:skip:self", { folderId });
      return;
    }
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const ratio = rect ? (event.clientY - rect.top) / rect.height : 0.5;
    const position: "before" | "after" | "inside" = ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside";
    if (position === "inside" && isFolderInSubtree(draggingFolderId.value, folderId)) {
      dndDebug("dragover:folder:skip:inside-subtree", {
        sourceFolderId: draggingFolderId.value,
        folderId,
      });
      return;
    }
    event.preventDefault();
    dropTargetTreeFolderId.value = folderId;
    dropTargetTreePosition.value = position;
    isTreeRootDropActive.value = false;
    dndDebug("dragover:folder", {
      sourceFolderId: draggingFolderId.value,
      folderId,
      position,
      ratio,
      targetClass: (event.currentTarget as HTMLElement | null)?.className ?? null,
    });
  }
}

async function onFolderDrop(folderId: string, event: DragEvent) {
  const droppedFolderIdFromPayload = event.dataTransfer?.getData("application/x-folder-id");
  dndDebug("drop:folder:received", {
    folderId,
    droppedFolderIdFromPayload,
    draggingFolderId: draggingFolderId.value,
    draggingDocId: draggingDocId.value,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
    dropTargetTreeFolderId: dropTargetTreeFolderId.value,
    dropTargetTreePosition: dropTargetTreePosition.value,
  });
  if (droppedFolderIdFromPayload || draggingFolderId.value) {
    event.preventDefault();
    if (!folderNamesById.value.has(folderId)) {
      dndDebug("drop:folder:skip:not-in-tree", { folderId });
      return;
    }
    const droppedFolderId = droppedFolderIdFromPayload || draggingFolderId.value;
    if (!droppedFolderId) {
      dndDebug("drop:folder:skip:no-source", { folderId });
      return;
    }
    const position = dropTargetTreeFolderId.value === folderId ? dropTargetTreePosition.value ?? "inside" : "inside";
    dndDebug("drop:folder:apply", { droppedFolderId, folderId, position });
    await moveFolderRelative(droppedFolderId, folderId, position);
    dropTargetTreeFolderId.value = null;
    dropTargetTreePosition.value = null;
    draggingFolderId.value = null;
    return;
  }

  if (draggingDocId.value) {
    event.preventDefault();
    const droppedDocId = event.dataTransfer?.getData("text/plain") || draggingDocId.value;
    if (!droppedDocId) return;
    const targetFolder = folderId === ALL_FOLDERS_ID || folderId === UNASSIGNED_FOLDERS_ID ? null : folderId;
    await moveDocumentToFolder(droppedDocId, targetFolder);
    dropTargetFolderId.value = null;
    draggingDocId.value = null;
    return;
  }

}

function onFoldersTreeDragOver(event: DragEvent) {
  const isFolderDrag = event.dataTransfer?.types?.includes("application/x-folder-id") || Boolean(draggingFolderId.value);
  if (!isFolderDrag || !draggingFolderId.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".folder-row")) return;
  event.preventDefault();
  isTreeRootDropActive.value = true;
  dropTargetTreeFolderId.value = null;
  dropTargetTreePosition.value = null;
  dndDebug("dragover:root", {
    sourceFolderId: draggingFolderId.value,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
  });
}

async function onFoldersTreeDrop(event: DragEvent) {
  const droppedFolderIdFromPayload = event.dataTransfer?.getData("application/x-folder-id");
  dndDebug("drop:root:received", {
    droppedFolderIdFromPayload,
    draggingFolderId: draggingFolderId.value,
    types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
  });
  if (!droppedFolderIdFromPayload && !draggingFolderId.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".folder-row")) return;
  event.preventDefault();
  const droppedFolderId = droppedFolderIdFromPayload || draggingFolderId.value;
  if (!droppedFolderId) return;
  dndDebug("drop:root:apply", { droppedFolderId });
  await moveFolderToRoot(droppedFolderId);
  isTreeRootDropActive.value = false;
  dropTargetTreeFolderId.value = null;
  dropTargetTreePosition.value = null;
  draggingFolderId.value = null;
}

async function moveDocumentToFolder(docId: string, folderId: string | null) {
  const targetFolder = folderId && folderNamesById.value.has(folderId) ? folderId : null;
  const previous = docFolders.value[docId] ?? null;
  docFolders.value = {
    ...docFolders.value,
    [docId]: targetFolder,
  };
  try {
    await auth.apiRequest(`/documents/${docId}/folder`, {
      method: "PATCH",
      auth: true,
      body: {
        folderId: targetFolder,
      },
    });
  } catch (error) {
    docFolders.value = {
      ...docFolders.value,
      [docId]: previous,
    };
    errorMessage.value = mapApiError(error);
  }
}

function folderNameForDoc(docId: string) {
  const folderId = docFolders.value[docId];
  if (!folderId) return "Sans dossier";
  return folderNamesById.value.get(folderId) ?? "Sans dossier";
}

function folderBadgeStyleForDoc(docId: string) {
  const folderId = docFolders.value[docId];
  if (!folderId) return {};
  const color = folderColorsById.value.get(folderId);
  if (!color) return {};
  return {
    backgroundColor: color,
    borderColor: color,
    color: getReadableTextColor(color),
  };
}

function templateVisibilityLabel(template: TemplateTile) {
  return template.visibility === "shared" ? "Partagé" : "Privé";
}

function templateAuthorLabel(template: TemplateTile) {
  if (template.canEdit) return "Vous";
  return template.createdBy?.displayName || template.createdBy?.email || "Utilisateur";
}

function folderHasDocuments(folderId: string) {
  const collectIds = (nodes: FolderNode[]): string[] => {
    for (const node of nodes) {
      if (node.id !== folderId) {
        const nested = collectIds(node.children);
        if (nested.length) return nested;
        continue;
      }
      const ids: string[] = [node.id];
      const walk = (children: FolderNode[]) => {
        for (const child of children) {
          ids.push(child.id);
          if (child.children.length) walk(child.children);
        }
      };
      walk(node.children);
      return ids;
    }
    return [];
  };

  const subtreeIds = new Set(collectIds(folderTree.value));
  if (!subtreeIds.size) return false;
  for (const docId of Object.keys(docFolders.value)) {
    const assignedFolderId = docFolders.value[docId];
    if (assignedFolderId && subtreeIds.has(assignedFolderId)) return true;
  }
  return false;
}

function openDeleteFolderDialog(folder: FolderRow) {
  isDeleteFolderOpen.value = true;
  deleteFolderId.value = folder.id;
  deleteFolderName.value = folder.name;
  deleteFolderError.value = "";
}

function closeDeleteFolderDialog() {
  isDeleteFolderOpen.value = false;
  deleteFolderId.value = null;
  deleteFolderName.value = "";
  deleteFolderError.value = "";
}

async function confirmDeleteFolder() {
  if (!deleteFolderId.value) return;
  deleteFolderSaving.value = true;
  deleteFolderError.value = "";
  try {
    await auth.apiRequest(`/folders/${deleteFolderId.value}`, {
      method: "DELETE",
      auth: true,
    });
    if (selectedFolderId.value === deleteFolderId.value) {
      selectedFolderId.value = ALL_FOLDERS_ID;
    }
    await loadFolders();
    closeDeleteFolderDialog();
  } catch (error) {
    deleteFolderError.value = mapApiError(error);
  } finally {
    deleteFolderSaving.value = false;
  }
}

function openEditFolderDialog(folder: FolderRow) {
  isEditFolderOpen.value = true;
  editFolderId.value = folder.id;
  editFolderName.value = folder.name;
  editFolderColor.value = folder.color;
  editFolderError.value = "";
  closeFolderMenu();
}

function closeEditFolderDialog() {
  isEditFolderOpen.value = false;
  editFolderId.value = null;
  editFolderName.value = "";
  editFolderColor.value = "#64748b";
  editFolderError.value = "";
}

async function confirmEditFolder() {
  if (!editFolderId.value) return;
  const name = editFolderName.value.trim();
  if (!name) {
    editFolderError.value = "Le nom du dossier est requis.";
    return;
  }
  editFolderSaving.value = true;
  editFolderError.value = "";
  try {
    await auth.apiRequest(`/folders/${editFolderId.value}`, {
      method: "PATCH",
      auth: true,
      body: {
        name,
        color: editFolderColor.value,
      },
    });
    await loadFolders();
    closeEditFolderDialog();
  } catch (error) {
    editFolderError.value = mapApiError(error);
  } finally {
    editFolderSaving.value = false;
  }
}

function pruneDocFolderMapping() {
  const knownDocIds = new Set(docs.value.map((doc) => doc.id));
  const next: Record<string, string | null> = {};
  for (const [docId, folderId] of Object.entries(docFolders.value)) {
    if (!knownDocIds.has(docId)) continue;
    next[docId] = folderId && folderNamesById.value.has(folderId) ? folderId : null;
  }
  docFolders.value = next;
}

function syncViewportMode() {
  const wasMobile = isMobile.value;
  const nextIsMobile = window.matchMedia("(max-width: 920px)").matches;
  isMobile.value = nextIsMobile;
  if (!wasMobile && nextIsMobile) {
    isDirectoriesOpen.value = false;
  } else if (wasMobile && !nextIsMobile) {
    isDirectoriesOpen.value = true;
  }
}

function restoreSelectedFolderFromRoute() {
  const folder = route.query.folder;
  if (typeof folder !== "string") return;
  if (folder === ALL_FOLDERS_ID || folder === UNASSIGNED_FOLDERS_ID || folder === TEMPLATES_ID || folderNamesById.value.has(folder)) {
    selectedFolderId.value = folder;
    return;
  }
  selectedFolderId.value = ALL_FOLDERS_ID;
}

async function toggleArchive(doc: DocTile) {
  closeDocMenu();
  actionLoadingFor.value = doc.id;
  errorMessage.value = "";
  try {
    await auth.apiRequest(`/documents/${doc.id}/archive`, {
      method: "PATCH",
      auth: true,
      body: { archived: !doc.archivedByCurrentUser },
    });
    await loadDocuments();
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    actionLoadingFor.value = null;
  }
}

function openRenameDialog(doc: DocTile) {
  closeDocMenu();
  if (doc.role !== "owner") return;
  renameDoc.value = doc;
  renameValue.value = doc.title;
  renameError.value = "";
  isRenameOpen.value = true;
}

function openCreateTemplateDialog(doc: DocTile) {
  closeDocMenu();
  if (doc.role !== "owner") return;
  templateSourceDoc.value = doc;
  templateFormName.value = doc.title;
  templateFormDescription.value = "";
  templateFormVisibility.value = "private";
  templateFormError.value = "";
  isCreateTemplateOpen.value = true;
}

function closeCreateTemplateDialog() {
  isCreateTemplateOpen.value = false;
  templateSourceDoc.value = null;
  templateFormName.value = "";
  templateFormDescription.value = "";
  templateFormVisibility.value = "private";
  templateFormError.value = "";
}

async function confirmCreateTemplate() {
  if (!templateSourceDoc.value) return;
  const name = templateFormName.value.trim();
  if (!name) {
    templateFormError.value = "Le nom du template est requis.";
    return;
  }
  templateFormSaving.value = true;
  templateFormError.value = "";
  try {
    await auth.apiRequest(`/documents/${templateSourceDoc.value.id}/template`, {
      method: "POST",
      auth: true,
      body: {
        name,
        description: templateFormDescription.value.trim(),
        visibility: templateFormVisibility.value,
      },
    });
    await loadTemplates();
    closeCreateTemplateDialog();
    selectedFolderId.value = TEMPLATES_ID;
  } catch (error) {
    templateFormError.value = mapApiError(error);
  } finally {
    templateFormSaving.value = false;
  }
}

function openRenameTemplateDialog(template: TemplateTile) {
  closeTemplateMenu();
  if (!template.canEdit) return;
  renameTemplate.value = template;
  renameTemplateName.value = template.name;
  renameTemplateDescription.value = template.description;
  renameTemplateVisibility.value = template.visibility;
  renameTemplateError.value = "";
  isRenameTemplateOpen.value = true;
}

function closeRenameTemplateDialog() {
  isRenameTemplateOpen.value = false;
  renameTemplate.value = null;
  renameTemplateName.value = "";
  renameTemplateDescription.value = "";
  renameTemplateVisibility.value = "private";
  renameTemplateError.value = "";
}

async function confirmRenameTemplate() {
  if (!renameTemplate.value) return;
  const name = renameTemplateName.value.trim();
  if (!name) {
    renameTemplateError.value = "Le nom du template est requis.";
    return;
  }
  renameTemplateSaving.value = true;
  renameTemplateError.value = "";
  try {
    await auth.apiRequest(`/document-templates/${renameTemplate.value.id}`, {
      method: "PATCH",
      auth: true,
      body: {
        name,
        description: renameTemplateDescription.value.trim(),
        visibility: renameTemplateVisibility.value,
      },
    });
    await loadTemplates();
    closeRenameTemplateDialog();
  } catch (error) {
    renameTemplateError.value = mapApiError(error);
  } finally {
    renameTemplateSaving.value = false;
  }
}

function openDeleteTemplateDialog(template: TemplateTile) {
  closeTemplateMenu();
  if (!template.canEdit) return;
  deleteTemplate.value = template;
  deleteTemplateError.value = "";
  isDeleteTemplateOpen.value = true;
}

function closeDeleteTemplateDialog() {
  isDeleteTemplateOpen.value = false;
  deleteTemplate.value = null;
  deleteTemplateError.value = "";
}

async function confirmDeleteTemplate() {
  if (!deleteTemplate.value) return;
  deleteTemplateSaving.value = true;
  deleteTemplateError.value = "";
  try {
    await auth.apiRequest(`/document-templates/${deleteTemplate.value.id}`, {
      method: "DELETE",
      auth: true,
    });
    await loadTemplates();
    closeDeleteTemplateDialog();
  } catch (error) {
    deleteTemplateError.value = mapApiError(error);
  } finally {
    deleteTemplateSaving.value = false;
  }
}

function editTemplate(template: TemplateTile) {
  closeTemplateMenu();
  router.push(workspaceLocation(`/templates/${template.id}`));
}

function closeRenameDialog() {
  isRenameOpen.value = false;
  renameDoc.value = null;
  renameValue.value = "";
  renameError.value = "";
}

async function confirmRename() {
  if (!renameDoc.value) return;
  const title = renameValue.value.trim();
  if (!title) {
    renameError.value = "Le nom du document est requis.";
    return;
  }

  renameSaving.value = true;
  renameError.value = "";
  try {
    await auth.apiRequest(`/documents/${renameDoc.value.id}/title`, {
      method: "PATCH",
      auth: true,
      body: { title },
    });
    await loadDocuments();
    closeRenameDialog();
  } catch (error) {
    renameError.value = mapApiError(error);
  } finally {
    renameSaving.value = false;
  }
}

function openDeleteDialog(doc: DocTile) {
  closeDocMenu();
  if (doc.role !== "owner") return;
  deleteDoc.value = doc;
  deleteError.value = "";
  isDeleteOpen.value = true;
}

function closeDeleteDialog() {
  isDeleteOpen.value = false;
  deleteDoc.value = null;
  deleteError.value = "";
}

async function confirmDelete() {
  if (!deleteDoc.value) return;
  deleteSaving.value = true;
  deleteError.value = "";
  try {
    await auth.apiRequest(`/documents/${deleteDoc.value.id}`, {
      method: "DELETE",
      auth: true,
    });
    await loadDocuments();
    closeDeleteDialog();
  } catch (error) {
    deleteError.value = mapApiError(error);
  } finally {
    deleteSaving.value = false;
  }
}

function onWindowClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest(".filter-menu-wrap")) {
    isFilterMenuOpen.value = false;
  }
  if (!target?.closest(".doc-actions-wrap") && !target?.closest(".doc-menu-global")) {
    closeDocMenu();
  }
  if (!target?.closest(".template-actions-wrap") && !target?.closest(".template-menu-global")) {
    closeTemplateMenu();
  }
  if (!target?.closest(".folder-menu-global")) {
    closeFolderMenu();
  }
}

onMounted(async () => {
  syncViewportMode();
  await loadFolders();
  restoreSelectedFolderFromRoute();
  await loadDocuments();
  await loadTemplates();
  nowTickIntervalId = window.setInterval(() => {
    nowTs.value = Date.now();
  }, 10_000);
  window.addEventListener("click", onWindowClick);
  window.addEventListener("resize", syncViewportMode);
});

onUnmounted(() => {
  cleanupFolderPointerDrag();
  window.removeEventListener("click", onWindowClick);
  window.removeEventListener("resize", syncViewportMode);
  if (nowTickIntervalId !== null) {
    window.clearInterval(nowTickIntervalId);
    nowTickIntervalId = null;
  }
});
</script>

<template>
  <main class="dashboard-page">
    <section class="dashboard-shell">
      <header class="dashboard-head">
        <div class="title-block">
          <h1>Documents</h1>
          <p v-if="auth.state.user" class="subtitle">{{ docCountLabel }}</p>
        </div>

        <UserAccountMenu />
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <section class="dashboard-layout" :class="{ 'directories-collapsed': !isDirectoriesOpen }">
        <aside class="directories-panel" :class="directoriesPanelClasses">
          <div class="directories-header">
            <div v-if="isDirectoriesOpen" class="directories-heading">
              <h2 class="directories-title">Répertoires</h2>
              <button type="button" class="folder-add-inline" title="Ajouter un dossier" aria-label="Ajouter un dossier" @click="openAddFolderDialog">
                <font-awesome-icon icon="plus" />
              </button>
            </div>
            <button
              type="button"
              class="directories-toggle"
              :title="isDirectoriesOpen ? 'Replier les répertoires' : 'Déplier les répertoires'"
              @click="toggleDirectoriesPanel"
            >
              <font-awesome-icon :icon="isDirectoriesOpen ? 'chevron-left' : 'chevron-right'" />
            </button>
          </div>

          <div v-if="isDirectoriesOpen" class="directories-content">
            <div
              class="folders-tree"
              :class="{ 'root-dropzone': isTreeRootDropActive }"
              @dragover.capture="onFoldersTreeDragOverCapture"
              @drop.capture="onFoldersTreeDropCapture"
              @dragover="onFoldersTreeDragOver"
              @drop="onFoldersTreeDrop"
            >
              <button
                type="button"
                class="folder-system-row"
                :class="{
                  selected: selectedFolderId === ALL_FOLDERS_ID,
                  dropzone: dropTargetFolderId === ALL_FOLDERS_ID,
                }"
                @click="selectFolder(ALL_FOLDERS_ID)"
                @dragover.prevent="onFolderDragOver(ALL_FOLDERS_ID, $event)"
                @drop="onFolderDrop(ALL_FOLDERS_ID, $event)"
              >
                <span class="folder-system-icon"><font-awesome-icon icon="layer-group" /></span>
                <span class="folder-system-label">Tous les documents</span>
                <span class="folder-count">{{ docs.length }}</span>
              </button>
              <button
                type="button"
                class="folder-system-row"
                :class="{
                  selected: selectedFolderId === UNASSIGNED_FOLDERS_ID,
                  dropzone: dropTargetFolderId === UNASSIGNED_FOLDERS_ID,
                }"
                @click="selectFolder(UNASSIGNED_FOLDERS_ID)"
                @dragover.prevent="onFolderDragOver(UNASSIGNED_FOLDERS_ID, $event)"
                @drop="onFolderDrop(UNASSIGNED_FOLDERS_ID, $event)"
              >
                <span class="folder-system-icon"><font-awesome-icon icon="file" /></span>
                <span class="folder-system-label">Non classés</span>
                <span class="folder-count">{{ unassignedDocCount }}</span>
              </button>
              <button
                type="button"
                class="folder-system-row"
                :class="{ selected: selectedFolderId === TEMPLATES_ID }"
                @click="selectFolder(TEMPLATES_ID)"
              >
                <span class="folder-system-icon"><font-awesome-icon icon="clone" /></span>
                <span class="folder-system-label">Templates</span>
                <span class="folder-count">{{ templates.length }}</span>
              </button>
              <div class="folder-section-label">Dossiers</div>
              <div
                v-if="draggingFolderId"
                class="folder-root-target"
                @dragover.prevent="isTreeRootDropActive = true"
                @drop="onFoldersTreeDrop"
              >
                Déposer ici pour mettre à la racine
              </div>

              <div
                v-for="folder in folderRows"
                :key="folder.id"
                class="folder-row"
                :data-folder-id="folder.id"
                :class="{
                  selected: selectedFolderId === folder.id,
                  dropzone: dropTargetFolderId === folder.id,
                  'tree-drop-inside': dropTargetTreeFolderId === folder.id && dropTargetTreePosition === 'inside',
                  'tree-drop-before': dropTargetTreeFolderId === folder.id && dropTargetTreePosition === 'before',
                  'tree-drop-after': dropTargetTreeFolderId === folder.id && dropTargetTreePosition === 'after',
                  dragging: draggingFolderId === folder.id,
                }"
                :style="{ '--depth': String(folder.depth) }"
                @contextmenu.prevent="openFolderContextMenu(folder, $event)"
                @dragover.prevent="onFolderDragOver(folder.id, $event)"
                @drop="onFolderDrop(folder.id, $event)"
              >
                <button
                  v-if="folder.hasChildren"
                  type="button"
                  class="folder-expand"
                  :style="{ color: folder.color }"
                  :title="folder.isExpanded ? 'Réduire' : 'Développer'"
                  @click.stop="toggleFolderExpansion(folder.id)"
                  @dragover.prevent="onFolderDragOver(folder.id, $event)"
                  @drop="onFolderDrop(folder.id, $event)"
                >
                  <font-awesome-icon :icon="folder.isExpanded ? 'folder-minus' : 'folder-plus'" />
                </button>
                <button
                  v-else
                  type="button"
                  class="folder-leaf-icon"
                  :style="{ color: folder.color }"
                  @click="selectFolder(folder.id)"
                  @pointerdown="onFolderHandlePointerDown(folder.id, $event)"
                  @dragover.prevent="onFolderDragOver(folder.id, $event)"
                  @drop="onFolderDrop(folder.id, $event)"
                >
                  <font-awesome-icon :icon="folderHasDocuments(folder.id) ? 'folder' : ['far', 'folder']" />
                </button>
                <button
                  type="button"
                  class="folder-select"
                  @click="selectFolder(folder.id)"
                  @pointerdown="onFolderHandlePointerDown(folder.id, $event)"
                  @dragover.prevent="onFolderDragOver(folder.id, $event)"
                  @drop="onFolderDrop(folder.id, $event)"
                >
                  <span class="folder-row-name">{{ folder.name }}</span>
                </button>
                <button
                  type="button"
                  class="folder-menu-btn"
                  title="Actions du dossier"
                  aria-label="Actions du dossier"
                  @click.stop="openFolderContextMenu(folder, $event)"
                >
                  <font-awesome-icon icon="ellipsis-vertical" />
                </button>
              </div>
            </div>
          </div>

          <div v-else class="directories-collapsed-label">
            <span role="button" tabindex="0" @click="openDirectoriesPanel" @keydown.enter.prevent="openDirectoriesPanel" @keydown.space.prevent="openDirectoriesPanel">Répertoires</span>
          </div>
        </aside>

        <section class="docs-pane">
          <div class="tiles-toolbar">
            <div class="toolbar-left">
              <button v-if="isMobile" type="button" class="icon-btn" title="Répertoires" @click.stop="openDirectoriesPanel">
                <font-awesome-icon icon="folder" />
              </button>
              <div class="folder-title-block">
                <strong>{{ selectedFolderLabel }}</strong>
                <span>{{ docCountLabel }}</span>
              </div>
              <nav class="folder-breadcrumb" aria-label="Fil d'ariane des dossiers">
                <template v-for="(segment, index) in folderBreadcrumbSegments" :key="segment.id">
                  <button
                    type="button"
                    class="breadcrumb-segment"
                    :class="{ active: segment.isActive }"
                    :style="breadcrumbSegmentStyle(segment.color, segment.isActive)"
                    :disabled="segment.isActive"
                    @click="onBreadcrumbSegmentClick(segment.id, segment.isActive)"
                  >
                    {{ segment.label }}
                  </button>
                  <span v-if="index < folderBreadcrumbSegments.length - 1" class="breadcrumb-separator">
                    <font-awesome-icon icon="chevron-right" />
                  </span>
                </template>
              </nav>
            </div>
            <div class="filter-menu-wrap">
              <button type="button" class="icon-btn" title="Filtrer" @click.stop="toggleFilterMenu">
                <font-awesome-icon icon="filter" />
              </button>
              <div v-if="isFilterMenuOpen" class="filter-menu" role="menu">
                <label class="filter-check">
                  <input v-model="includeArchived" type="checkbox" @change="toggleIncludeArchived" />
                  <span>Afficher les documents archivés</span>
                </label>
              </div>
            </div>
          </div>

          <section v-if="selectedFolderId === TEMPLATES_ID && templates.length > 0" class="tiles-grid templates-grid">
            <article
              v-for="template in templates"
              :key="template.id"
              class="doc-tile template-tile"
              role="button"
              tabindex="0"
              @click="editTemplate(template)"
              @keydown.enter.prevent="editTemplate(template)"
              @keydown.space.prevent="editTemplate(template)"
            >
              <div class="tile-thumb">
                <img
                  v-if="getSvgThumbnailPayload(template.thumbnailJson)"
                  :src="svgToDataUrl(getSvgThumbnailPayload(template.thumbnailJson)!.svg)"
                  alt="Miniature du template"
                />
                <pre v-else>{{ JSON.stringify(template.thumbnailJson ?? {}, null, 2).slice(0, 150) }}</pre>
              </div>
              <div class="tile-meta">
                <div class="tile-meta-head">
                  <strong :title="template.name">{{ template.name }}</strong>
                  <div class="template-actions-wrap">
                    <button
                      type="button"
                      class="doc-menu-btn"
                      :disabled="templateActionLoadingFor === template.id"
                      @click.stop="toggleTemplateMenu(template.id, $event)"
                    >
                      <font-awesome-icon icon="ellipsis-vertical" />
                    </button>
                  </div>
                </div>
                <small v-if="template.description" class="template-description">{{ template.description }}</small>
                <small class="muted">par {{ templateAuthorLabel(template) }} - {{ formatDate(template.updatedAt) }}</small>
                <small class="template-visibility-tag" :class="template.visibility">{{ templateVisibilityLabel(template) }}</small>
              </div>
            </article>
          </section>

          <section v-else-if="!loading && visibleDocs.length === 0" class="empty-docs-state">
            <h2>{{ emptyStateTitle }}</h2>
            <p>{{ emptyStateText }}</p>
            <button v-if="selectedFolderId !== TEMPLATES_ID" type="button" class="doc-tile create-tile" :disabled="creating" @click="openCreateDocumentDialog">
              <span class="create-plus">+</span>
              <span class="create-label">Nouveau document</span>
            </button>
          </section>

          <section v-else class="tiles-grid">
            <button type="button" class="doc-tile create-tile" :disabled="creating" @click="openCreateDocumentDialog">
              <span class="create-plus">+</span>
              <span class="create-label">Nouveau document</span>
            </button>

            <article
              v-for="doc in visibleDocs"
              :key="doc.id"
              class="doc-tile"
              :class="{ dragging: draggingDocId === doc.id }"
              role="button"
              tabindex="0"
              draggable="true"
              @dragstart="onDocumentDragStart(doc.id, $event)"
              @dragend="onDocumentDragEnd"
              @click="openDocument(doc.id)"
              @keydown.enter.prevent="openDocument(doc.id)"
              @keydown.space.prevent="openDocument(doc.id)"
            >
              <div class="tile-thumb">
                <img
                  v-if="getSvgThumbnailPayload(doc.thumbnailJson)"
                  :src="svgToDataUrl(getSvgThumbnailPayload(doc.thumbnailJson)!.svg)"
                  alt="Miniature du document"
                />
                <pre v-else>{{ JSON.stringify(doc.thumbnailJson ?? {}, null, 2).slice(0, 150) }}</pre>
              </div>
              <div class="tile-meta">
                <div class="tile-meta-head">
                  <strong :title="doc.title">{{ doc.title }}</strong>
                  <div class="doc-actions-wrap">
                    <button
                      type="button"
                      class="doc-menu-btn"
                      :disabled="actionLoadingFor === doc.id"
                      @click.stop="toggleDocMenu(doc.id, $event)"
                    >
                      <font-awesome-icon icon="ellipsis-vertical" />
                    </button>
                  </div>
                </div>
                <small>{{ doc.role }} - {{ formatDate(doc.updatedAt) }}</small>
                <small class="muted">maj: {{ Math.max(0, Math.floor((nowTs - new Date(doc.updatedAt).getTime()) / 60000)) }} min</small>
                <small class="folder-tag" :style="folderBadgeStyleForDoc(doc.id)">{{ folderNameForDoc(doc.id) }}</small>
                <small v-if="doc.archivedByCurrentUser" class="archived-tag">Archivé</small>
              </div>
            </article>
          </section>
        </section>
      </section>

      <p v-if="loading" class="loading-state">Chargement...</p>
    </section>
  </main>

  <div v-if="shouldShowDrawerOverlay" class="drawer-overlay" @click="isDirectoriesOpen = false" />

  <Teleport to="body">
    <div
      v-if="activeDoc"
      class="doc-menu doc-menu-global"
      role="menu"
      :style="{ left: `${docMenuPosition.x}px`, top: `${docMenuPosition.y}px` }"
    >
      <button type="button" class="doc-menu-item" @click.stop="toggleArchive(activeDoc)">
        <span class="leading"><font-awesome-icon icon="box-archive" /></span>
        <span>{{ activeDoc.archivedByCurrentUser ? "Désarchiver" : "Archiver" }}</span>
      </button>
      <button v-if="activeDoc.role === 'owner'" type="button" class="doc-menu-item" @click.stop="openRenameDialog(activeDoc)">
        <span class="leading"><font-awesome-icon icon="pen-to-square" /></span>
        <span>Renommer</span>
      </button>
      <button v-if="activeDoc.role === 'owner'" type="button" class="doc-menu-item" @click.stop="openCreateTemplateDialog(activeDoc)">
        <span class="leading"><font-awesome-icon icon="clone" /></span>
        <span>Créer un template</span>
      </button>
      <button v-if="activeDoc.role === 'owner'" type="button" class="doc-menu-item danger" @click.stop="openDeleteDialog(activeDoc)">
        <span class="leading"><font-awesome-icon icon="trash" /></span>
        <span>Supprimer</span>
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="activeTemplate"
      class="doc-menu template-menu-global"
      role="menu"
      :style="{ left: `${templateMenuPosition.x}px`, top: `${templateMenuPosition.y}px` }"
    >
      <button type="button" class="doc-menu-item" @click.stop="createDocumentFromTemplate(activeTemplate)">
        <span class="leading"><font-awesome-icon icon="file" /></span>
        <span>Créer un document</span>
      </button>
      <button v-if="activeTemplate.canEdit" type="button" class="doc-menu-item" @click.stop="editTemplate(activeTemplate)">
        <span class="leading"><font-awesome-icon icon="pen-to-square" /></span>
        <span>Editer</span>
      </button>
      <button v-if="activeTemplate.canEdit" type="button" class="doc-menu-item" @click.stop="openRenameTemplateDialog(activeTemplate)">
        <span class="leading"><font-awesome-icon icon="font" /></span>
        <span>Renommer</span>
      </button>
      <button v-if="activeTemplate.canEdit" type="button" class="doc-menu-item danger" @click.stop="openDeleteTemplateDialog(activeTemplate)">
        <span class="leading"><font-awesome-icon icon="trash" /></span>
        <span>Supprimer</span>
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="activeFolder"
      class="doc-menu folder-menu-global"
      role="menu"
      :style="{ left: `${folderMenuPosition.x}px`, top: `${folderMenuPosition.y}px` }"
    >
      <button type="button" class="doc-menu-item" @click.stop="openEditFolderDialog(activeFolder)">
        <span class="leading"><font-awesome-icon icon="pen-to-square" /></span>
        <span>Editer le dossier</span>
      </button>
      <div class="folder-menu-separator" />
      <button type="button" class="doc-menu-item danger" @click.stop="openDeleteFolderDialog(activeFolder); closeFolderMenu();">
        <span class="leading"><font-awesome-icon icon="trash" /></span>
        <span>Supprimer le dossier</span>
      </button>
    </div>
  </Teleport>

  <div v-if="isAddFolderOpen" class="dialog-overlay">
    <section class="dialog-card">
      <h3>Ajouter un répertoire</h3>
      <label class="dialog-field">
        <span>Nom du répertoire</span>
        <input v-model="addFolderValue" type="text" maxlength="120" @keydown.enter.prevent="confirmAddFolder" />
      </label>
      <label class="dialog-field dialog-color-field">
        <span>Couleur</span>
        <input v-model="addFolderColor" type="color" />
      </label>
      <p v-if="addFolderError" class="dialog-error">{{ addFolderError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" @click="closeAddFolderDialog">Annuler</button>
        <button type="button" class="ghost-btn primary" @click="confirmAddFolder">Ajouter</button>
      </div>
    </section>
  </div>

  <div v-if="isEditFolderOpen" class="dialog-overlay">
    <section class="dialog-card">
      <h3>Editer le dossier</h3>
      <label class="dialog-field">
        <span>Nom du dossier</span>
        <input v-model="editFolderName" type="text" maxlength="120" @keydown.enter.prevent="confirmEditFolder" />
      </label>
      <label class="dialog-field dialog-color-field">
        <span>Couleur</span>
        <input v-model="editFolderColor" type="color" />
      </label>
      <p v-if="editFolderError" class="dialog-error">{{ editFolderError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="editFolderSaving" @click="closeEditFolderDialog">Annuler</button>
        <button type="button" class="ghost-btn primary" :disabled="editFolderSaving" @click="confirmEditFolder">
          {{ editFolderSaving ? "Validation..." : "Valider" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isCreateDocumentOpen" class="dialog-overlay" @click.self="closeCreateDocumentDialog">
    <section class="dialog-card template-picker-dialog">
      <h3>Nouveau document</h3>
      <p class="dialog-text">Choisir un document vierge ou un template.</p>
      <div class="template-picker-tools">
        <label class="template-search-field">
          <span>Rechercher</span>
          <input v-model="templatePickerSearch" type="search" placeholder="Nom, description, auteur..." />
        </label>
        <div class="template-filter-tabs" role="tablist" aria-label="Filtrer les templates">
          <button type="button" :class="{ active: templatePickerFilter === 'all' }" @click="templatePickerFilter = 'all'">Tous</button>
          <button type="button" :class="{ active: templatePickerFilter === 'private' }" @click="templatePickerFilter = 'private'">Privés</button>
          <button type="button" :class="{ active: templatePickerFilter === 'shared' }" @click="templatePickerFilter = 'shared'">Partagés</button>
        </div>
      </div>
      <div class="template-picker-grid">
        <button type="button" class="template-choice-card blank-template-choice" :disabled="creating" @click="createDocument">
          <span class="template-choice-thumb blank-template-thumb">
            <span class="template-choice-plus">+</span>
          </span>
          <span class="template-choice-body">
            <strong>Document vierge</strong>
            <span>Créer sans modèle</span>
          </span>
        </button>
        <button
          v-for="template in filteredTemplateChoices"
          :key="template.id"
          type="button"
          class="template-choice-card"
          :disabled="templateActionLoadingFor === template.id"
          @click="createDocumentFromTemplate(template)"
        >
          <span class="template-choice-thumb">
            <img
              v-if="getSvgThumbnailPayload(template.thumbnailJson)"
              :src="svgToDataUrl(getSvgThumbnailPayload(template.thumbnailJson)!.svg)"
              alt="Miniature du template"
            />
            <span v-else class="template-choice-placeholder">
              <font-awesome-icon icon="clone" />
            </span>
          </span>
          <span class="template-choice-body">
            <span class="template-choice-title-row">
              <strong>{{ template.name }}</strong>
              <span class="template-choice-badge" :class="template.visibility">{{ templateVisibilityLabel(template) }}</span>
            </span>
            <span class="template-choice-description">{{ template.description || `par ${templateAuthorLabel(template)}` }}</span>
          </span>
        </button>
        <div v-if="templates.length > 0 && filteredTemplateChoices.length === 0" class="template-picker-empty">
          Aucun template ne correspond à ce filtre.
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" @click="closeCreateDocumentDialog">Annuler</button>
      </div>
    </section>
  </div>

  <div v-if="isCreateTemplateOpen" class="dialog-overlay" @click.self="closeCreateTemplateDialog">
    <section class="dialog-card">
      <h3>Créer un template</h3>
      <label class="dialog-field">
        <span>Nom du template</span>
        <input v-model="templateFormName" type="text" maxlength="120" @keydown.enter.prevent="confirmCreateTemplate" />
      </label>
      <label class="dialog-field">
        <span>Description</span>
        <textarea v-model="templateFormDescription" maxlength="500" rows="3" />
      </label>
      <label class="dialog-field">
        <span>Visibilité</span>
        <select v-model="templateFormVisibility">
          <option value="private">Privé</option>
          <option value="shared">Partagé</option>
        </select>
      </label>
      <p v-if="templateFormError" class="dialog-error">{{ templateFormError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="templateFormSaving" @click="closeCreateTemplateDialog">Annuler</button>
        <button type="button" class="ghost-btn primary" :disabled="templateFormSaving" @click="confirmCreateTemplate">
          {{ templateFormSaving ? "Création..." : "Créer" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isRenameTemplateOpen" class="dialog-overlay" @click.self="closeRenameTemplateDialog">
    <section class="dialog-card">
      <h3>Renommer le template</h3>
      <label class="dialog-field">
        <span>Nom du template</span>
        <input v-model="renameTemplateName" type="text" maxlength="120" @keydown.enter.prevent="confirmRenameTemplate" />
      </label>
      <label class="dialog-field">
        <span>Description</span>
        <textarea v-model="renameTemplateDescription" maxlength="500" rows="3" />
      </label>
      <label class="dialog-field">
        <span>Visibilité</span>
        <select v-model="renameTemplateVisibility">
          <option value="private">Privé</option>
          <option value="shared">Partagé</option>
        </select>
      </label>
      <p v-if="renameTemplateError" class="dialog-error">{{ renameTemplateError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="renameTemplateSaving" @click="closeRenameTemplateDialog">Annuler</button>
        <button type="button" class="ghost-btn primary" :disabled="renameTemplateSaving" @click="confirmRenameTemplate">
          {{ renameTemplateSaving ? "Validation..." : "Valider" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isRenameOpen" class="dialog-overlay">
    <section class="dialog-card">
      <h3>Renommer le document</h3>
      <label class="dialog-field">
        <span>Nouveau nom</span>
        <input v-model="renameValue" type="text" maxlength="120" />
      </label>
      <p v-if="renameError" class="dialog-error">{{ renameError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="renameSaving" @click="closeRenameDialog">Annuler</button>
        <button type="button" class="ghost-btn primary" :disabled="renameSaving" @click="confirmRename">
          {{ renameSaving ? "Validation..." : "Valider" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isDeleteOpen" class="dialog-overlay" @click.self="closeDeleteDialog">
    <section class="dialog-card">
      <h3>Supprimer le document</h3>
      <p class="dialog-text">
        Confirmer la suppression de
        <strong>{{ deleteDoc?.title }}</strong>
        ? Cette action est définitive.
      </p>
      <p v-if="deleteError" class="dialog-error">{{ deleteError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="deleteSaving" @click="closeDeleteDialog">Annuler</button>
        <button type="button" class="ghost-btn danger" :disabled="deleteSaving" @click="confirmDelete">
          {{ deleteSaving ? "Suppression..." : "Supprimer" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isDeleteTemplateOpen" class="dialog-overlay" @click.self="closeDeleteTemplateDialog">
    <section class="dialog-card">
      <h3>Supprimer le template</h3>
      <p class="dialog-text">
        Confirmer la suppression de
        <strong>{{ deleteTemplate?.name }}</strong>
        ?
      </p>
      <p v-if="deleteTemplateError" class="dialog-error">{{ deleteTemplateError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="deleteTemplateSaving" @click="closeDeleteTemplateDialog">Annuler</button>
        <button type="button" class="ghost-btn danger" :disabled="deleteTemplateSaving" @click="confirmDeleteTemplate">
          {{ deleteTemplateSaving ? "Suppression..." : "Supprimer" }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="isDeleteFolderOpen" class="dialog-overlay">
    <section class="dialog-card">
      <h3>Supprimer le dossier</h3>
      <p class="dialog-text">
        Confirmer la suppression de
        <strong>{{ deleteFolderName }}</strong>
        ?
      </p>
      <p v-if="deleteFolderError" class="dialog-error">{{ deleteFolderError }}</p>
      <div class="dialog-actions">
        <button type="button" class="ghost-btn" :disabled="deleteFolderSaving" @click="closeDeleteFolderDialog">Annuler</button>
        <button type="button" class="ghost-btn danger" :disabled="deleteFolderSaving" @click="confirmDeleteFolder">
          {{ deleteFolderSaving ? "Suppression..." : "Supprimer" }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page {
  height: 100dvh;
  padding: 18px;
  background:
    radial-gradient(circle at 10% 10%, var(--page-accent-dashboard-1) 0%, transparent 35%),
    radial-gradient(circle at 90% 0%, var(--page-accent-dashboard-2) 0%, transparent 38%),
    var(--color-bg-app);
}

.dashboard-shell {
  height: 100%;
  min-height: 0;
  border: 1px solid var(--color-border-strong);
  border-radius: 16px;
  background: var(--color-bg-elevated);
  box-shadow: var(--color-shadow-soft);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dashboard-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 14px;
}

.dashboard-layout.directories-collapsed {
  grid-template-columns: 44px minmax(0, 1fr);
}

.dashboard-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.title-block h1 {
  margin: 0;
  color: var(--color-text-primary);
  font: 700 1.35rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.subtitle {
  margin: 4px 0 0;
  color: var(--color-text-muted);
  font: 500 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.error-banner {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--color-text-danger) 35%, var(--color-border-default));
  border-radius: 10px;
  background: var(--color-bg-danger-soft);
  color: var(--color-text-danger);
  padding: 8px 10px;
  font: 600 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tiles-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
}

.docs-pane {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 10px;
}

.toolbar-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.folder-title-block {
  min-width: 160px;
  display: grid;
  gap: 3px;
}

.folder-title-block strong {
  color: var(--color-text-primary);
  font: 700 1rem/1.15 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.folder-title-block span {
  color: var(--color-text-muted);
  font: 500 0.75rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.folder-breadcrumb {
  min-width: 0;
  max-width: min(640px, calc(100vw - 520px));
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  scrollbar-width: thin;
}

.breadcrumb-segment {
  height: 30px;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  font: 600 0.75rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.breadcrumb-segment.active {
  cursor: default;
}

.breadcrumb-separator {
  color: var(--color-text-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.66rem;
}

.directories-panel {
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  background: var(--color-bg-subtle);
  transition:
    transform 280ms ease,
    box-shadow 240ms ease;
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.directories-header {
  min-height: 44px;
  border-bottom: 1px solid var(--color-border-muted);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 12px;
}

.directories-panel:not(.is-open) .directories-header {
  justify-content: center;
  padding: 0;
}

.directories-panel.is-open {
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--color-bg-elevated) 60%, transparent);
}

.directories-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.directories-toggle {
  width: 30px;
  height: 30px;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-button-bg);
  color: var(--color-text-accent);
  cursor: pointer;
  display: grid;
  place-items: center;
  font: 700 0.9rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.directories-title {
  margin: 0;
  display: flex;
  align-items: center;
  color: var(--color-text-primary);
  font: 700 0.92rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.folder-add-inline {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-bg-elevated);
  color: var(--color-text-accent);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}

.folder-add-inline :deep(svg) {
  width: 12px;
  height: 12px;
  display: block;
}

.directories-content {
  min-height: 0;
  padding: 8px;
  background: var(--color-bg-subtle);
}

.directories-collapsed-label {
  display: grid;
  place-items: center;
  padding-bottom: 12px;
}

.directories-collapsed-label span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.08em;
  color: var(--color-text-secondary);
  font: 700 0.64rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  text-transform: uppercase;
  cursor: pointer;
}

.folders-tree {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 3px;
}

.folders-tree.root-dropzone {
  outline: 2px dashed var(--color-primary);
  outline-offset: -2px;
  border-radius: 8px;
}

.folder-root-target {
  border: 1px dashed var(--color-border-primary);
  border-radius: 8px;
  min-height: 28px;
  display: grid;
  place-items: center;
  color: var(--color-text-accent);
  font: 600 0.7rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  background: var(--color-bg-info-soft);
}

.folder-system-row {
  width: 100%;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 1px 8px 0;
  text-align: left;
  cursor: pointer;
}

.folder-system-row.selected {
  background: var(--color-bg-selected-soft);
  border-color: var(--color-border-selected);
  color: var(--color-text-accent);
}

.folder-system-row.dropzone {
  border-style: dashed;
  border-color: var(--color-primary);
  background: var(--color-bg-selected);
}

.folder-system-icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
}

.folder-system-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 600 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.folder-count {
  color: var(--color-text-muted);
  font: 600 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.folder-section-label {
  margin: 9px 8px 4px;
  color: var(--color-text-subtle);
  font: 700 0.64rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  text-transform: uppercase;
}

.folder-row {
  --depth: 0;
  min-height: 34px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 24px;
  column-gap: 6px;
  align-items: center;
  padding-right: 8px;
  padding-left: calc(7px + var(--depth) * 15px);
  position: relative;
}
.folder-row.root-row {
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
  padding-left: 8px;
}

.folder-row.selected {
  background: var(--color-bg-selected-soft);
  border-color: var(--color-border-selected);
}

.folder-row.dropzone {
  border-style: dashed;
  border-color: var(--color-primary);
  background: var(--color-bg-selected);
}

.folder-row.tree-drop-inside {
  border-style: dashed;
  border-color: var(--color-border-primary);
  background: var(--color-bg-info-soft);
}

.folder-row.tree-drop-before::before {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  top: -2px;
  border-top: 2px solid var(--color-border-primary);
}

.folder-row.tree-drop-after::after {
  content: "";
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: -2px;
  border-bottom: 2px solid var(--color-border-primary);
}

.folder-row.dragging {
  opacity: 0.45;
}

.folder-expand {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 0;
  margin: 0;
  display: grid;
  place-items: center;
  justify-self: center;
  align-self: center;
  line-height: 1;
}

.folder-expand.spacer {
  cursor: default;
}

.folder-expand :deep(svg) {
  width: 14px;
  height: 14px;
  display: block;
}

.folder-leaf-icon {
  width: 20px;
  height: 20px;
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  display: grid;
  place-items: center;
  justify-self: center;
  align-self: center;
  color: var(--color-text-muted);
  cursor: pointer;
  line-height: 1;
}

.folder-leaf-icon :deep(svg) {
  width: 14px;
  height: 14px;
  display: block;
}

.folder-select {
  border: 0;
  background: transparent;
  text-align: left;
  min-height: 30px;
  color: var(--color-text-primary);
  cursor: pointer;
  padding: 0;
  min-width: 0;
}

.folder-row-name {
  display: block;
  font: 600 0.79rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-menu-btn {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-subtle);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  opacity: 0;
  justify-self: end;
}

.folder-menu-btn :deep(svg) {
  width: 12px;
  height: 12px;
  display: block;
}

.folder-row:hover .folder-menu-btn,
.folder-menu-btn:focus-visible {
  opacity: 1;
}

.folder-menu-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.filter-menu-wrap {
  position: relative;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-button-bg);
  color: var(--color-text-secondary);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--color-button-hover);
}

.filter-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 250px;
  border: 1px solid var(--color-border-accent);
  border-radius: 10px;
  background: var(--color-bg-elevated);
  box-shadow: var(--color-shadow-popover);
  padding: 10px;
  z-index: 30;
}

.filter-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
  font: 500 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tiles-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  align-content: start;
  padding-right: 2px;
  padding-bottom: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.empty-docs-state {
  min-height: 0;
  overflow: auto;
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 10px;
  padding: 28px 2px 12px;
}

.empty-docs-state h2 {
  margin: 0;
  color: var(--color-text-primary);
  font: 700 1rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.empty-docs-state p {
  margin: 0 0 6px;
  color: var(--color-text-muted);
  font: 500 0.82rem/1.35 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.empty-docs-state .create-tile {
  width: min(260px, 100%);
}

.doc-tile {
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  background: var(--color-bg-elevated);
  min-height: 190px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  display: grid;
  grid-template-rows: 120px minmax(0, 1fr);
}

.doc-tile:hover {
  border-color: var(--color-border-primary);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 22%, transparent);
}

.doc-tile.dragging {
  opacity: 0.45;
}

.create-tile {
  display: grid;
  place-items: center;
  grid-template-rows: auto auto;
  gap: 6px;
  background: linear-gradient(180deg, var(--color-bg-subtle) 0%, var(--color-bg-elevated) 100%);
}

.create-plus {
  color: var(--color-primary);
  font: 700 2rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.create-label {
  color: var(--color-text-secondary);
  font: 600 0.85rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tile-thumb {
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border-muted);
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.tile-thumb pre {
  margin: 0;
  color: var(--color-text-muted);
  font: 500 0.64rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}

.tile-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tile-meta {
  padding: 10px;
  display: grid;
  gap: 4px;
}

.tile-meta-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.tile-meta strong {
  color: var(--color-text-primary);
  font: 600 0.86rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-actions-wrap {
  position: relative;
}

.template-actions-wrap {
  position: relative;
  min-width: 28px;
  display: flex;
  justify-content: flex-end;
}

.doc-menu-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.doc-menu-btn:hover {
  background: var(--color-bg-hover);
}

.doc-menu {
  position: fixed;
  min-width: 170px;
  border: 1px solid var(--color-border-accent);
  border-radius: 10px;
  background: var(--color-bg-elevated);
  box-shadow: var(--color-shadow-popover);
  padding: 6px;
  display: grid;
  gap: 4px;
  z-index: 80;
  transform: translateX(-100%);
}

.doc-menu-item {
  width: 100%;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.doc-menu-item:hover {
  background: var(--color-bg-hover);
}

.doc-menu-item.danger {
  color: var(--color-text-danger-strong);
}

.doc-menu-item .leading {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: var(--color-text-muted);
}

.folder-menu-separator {
  height: 1px;
  margin: 4px 0;
  background: var(--color-border-muted);
}

.tile-meta small {
  color: var(--color-text-muted);
  font: 500 0.72rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tile-meta small.muted {
  color: var(--color-text-subtle);
}

.template-description {
  min-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-visibility-tag {
  width: fit-content;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  padding: 2px 8px;
}

.template-visibility-tag.private {
  color: var(--color-text-secondary);
  background: var(--color-bg-subtle);
}

.template-visibility-tag.shared {
  color: var(--color-text-accent);
  background: var(--color-bg-selected-soft);
  border-color: var(--color-border-selected);
}

.archived-tag {
  color: var(--color-text-warning);
  background: var(--color-bg-warning-soft);
  border: 1px solid color-mix(in srgb, var(--color-text-warning) 30%, var(--color-border-default));
  border-radius: 999px;
  width: fit-content;
  padding: 0 8px;
}

.tile-meta small.folder-tag {
  width: fit-content;
  max-width: 100%;
  height: 18px;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
  box-sizing: border-box;
  display: inline-block;
  padding: 0 8px;
  font-size: 0.66rem;
  line-height: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loading-state {
  margin: 0;
  color: var(--color-text-muted);
  font: 500 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  display: grid;
  place-items: center;
  z-index: 60;
}

.dialog-card {
  width: min(460px, calc(100% - 24px));
  border: 1px solid var(--color-border-default);
  border-radius: 12px;
  background: var(--color-bg-elevated);
  padding: 14px;
  display: grid;
  gap: 10px;
  box-shadow: var(--color-shadow-soft);
}

.dialog-card h3 {
  margin: 0;
  color: var(--color-text-primary);
  font: 700 1rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-text {
  margin: 0;
  color: var(--color-text-secondary);
  font: 500 0.85rem/1.3 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-field {
  display: grid;
  gap: 4px;
}

.dialog-field span {
  color: var(--color-text-secondary);
  font: 600 0.74rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-field input,
.dialog-field select,
.dialog-field textarea {
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
  font: 500 0.82rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-field input,
.dialog-field select {
  height: 34px;
  padding: 0 10px;
}

.dialog-field textarea {
  min-height: 72px;
  padding: 8px 10px;
  resize: vertical;
  line-height: 1.3;
}

.template-picker-dialog {
  width: min(820px, calc(100% - 24px));
}

.template-picker-tools {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.template-search-field {
  display: grid;
  gap: 4px;
}

.template-search-field span {
  color: var(--color-text-secondary);
  font: 600 0.72rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-search-field input {
  height: 34px;
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
  padding: 0 10px;
  font: 500 0.82rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-filter-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--color-border-default);
  border-radius: 9px;
  background: var(--color-bg-subtle);
  padding: 3px;
}

.template-filter-tabs button {
  height: 28px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-secondary);
  padding: 0 9px;
  cursor: pointer;
  font: 700 0.72rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-filter-tabs button.active {
  background: var(--color-bg-selected-soft);
  color: var(--color-text-accent);
}

.template-picker-grid {
  max-height: min(540px, 64dvh);
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
  padding-right: 2px;
}

.template-picker-empty {
  min-height: 188px;
  border: 1px dashed var(--color-border-default);
  border-radius: 10px;
  color: var(--color-text-muted);
  background: var(--color-bg-subtle);
  display: grid;
  place-items: center;
  padding: 16px;
  text-align: center;
  font: 600 0.82rem/1.3 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-choice-card {
  min-height: 188px;
  border: 1px solid var(--color-border-default);
  border-radius: 10px;
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  padding: 0;
  display: grid;
  grid-template-rows: 118px minmax(0, 1fr);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--color-bg-elevated) 70%, transparent);
}

.template-choice-card:hover:not(:disabled) {
  border-color: var(--color-border-primary);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.template-choice-thumb {
  min-width: 0;
  background: var(--color-bg-subtle);
  border-bottom: 1px solid var(--color-border-muted);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.template-choice-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.blank-template-thumb {
  background:
    linear-gradient(var(--color-border-muted) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border-muted) 1px, transparent 1px),
    var(--color-bg-subtle);
  background-size: 18px 18px;
}

.template-choice-plus {
  width: 58px;
  height: 58px;
  border: 1px solid var(--color-border-selected);
  border-radius: 14px;
  background: var(--color-bg-selected-soft);
  color: var(--color-text-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 800 2.8rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-choice-placeholder {
  width: 54px;
  height: 54px;
  border: 1px solid var(--color-border-default);
  border-radius: 14px;
  background: var(--color-bg-elevated);
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
}

.template-choice-body {
  min-width: 0;
  padding: 10px;
  display: grid;
  gap: 6px;
  align-content: start;
}

.template-choice-title-row {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.template-choice-card strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: 700 0.84rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-choice-card .template-choice-description {
  color: var(--color-text-muted);
  font: 500 0.74rem/1.25 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-choice-badge {
  flex: 0 0 auto;
  border: 1px solid var(--color-border-default);
  border-radius: 999px;
  padding: 2px 7px;
  font: 700 0.62rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.template-choice-badge.private {
  background: var(--color-bg-subtle);
  color: var(--color-text-secondary);
}

.template-choice-badge.shared {
  background: var(--color-bg-selected-soft);
  border-color: var(--color-border-selected);
  color: var(--color-text-accent);
}

@media (max-width: 720px) {
  .template-picker-tools {
    grid-template-columns: 1fr;
  }

  .template-filter-tabs {
    width: 100%;
    justify-content: stretch;
  }

  .template-filter-tabs button {
    flex: 1;
  }
}

.dialog-color-field input[type="color"] {
  width: 56px;
  padding: 2px;
  border-radius: 8px;
  cursor: pointer;
}

.dialog-error {
  margin: 0;
  color: var(--color-text-danger);
  font: 600 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost-btn {
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  background: var(--color-button-bg);
  height: 32px;
  padding: 0 10px;
  color: var(--color-text-secondary);
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.ghost-btn:hover {
  background: var(--color-button-hover);
}

.ghost-btn.primary {
  background: var(--color-button-primary-bg);
  border-color: var(--color-primary-strong);
  color: #ffffff;
}

.ghost-btn.primary:hover:not(:disabled) {
  background: var(--color-button-primary-hover);
}

.ghost-btn.danger {
  background: #b91c1c;
  border-color: #991b1b;
  color: #ffffff;
}

.drawer-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  z-index: 35;
}

@media (max-width: 920px) {
  .dashboard-page {
    padding: 12px;
  }

  .dashboard-layout {
    grid-template-columns: 1fr;
  }

  .dashboard-layout.directories-collapsed {
    grid-template-columns: 1fr;
  }

  .folder-breadcrumb {
    max-width: calc(100vw - 112px);
  }

  .folder-title-block {
    min-width: 0;
  }

  .directories-panel {
    position: fixed;
    top: 8px;
    left: 8px;
    bottom: 8px;
    width: min(320px, calc(100vw - 16px));
    z-index: 50;
    border-radius: 16px;
    transform: translateX(-108%);
    box-shadow: var(--color-shadow-menu);
  }

  .directories-panel.is-open {
    width: min(320px, calc(100vw - 16px));
    transform: translateX(0);
  }

  .directories-panel .directories-toggle {
    width: 30px;
  }
}
</style>
