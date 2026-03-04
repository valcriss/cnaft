<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import UserAccountMenu from "../components/auth/UserAccountMenu.vue";
import { ApiError, useAuthStore } from "../stores/useAuthStore";

type DocTile = {
  id: string;
  title: string;
  thumbnailJson: unknown;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
  archivedByCurrentUser: boolean;
};

type SvgThumbnailPayload = {
  kind: "svg";
  svg: string;
};

const auth = useAuthStore();
const router = useRouter();
const loading = ref(false);
const creating = ref(false);
const errorMessage = ref("");
const docs = ref<DocTile[]>([]);
const nowTs = ref(Date.now());
const includeArchived = ref(false);
const isFilterMenuOpen = ref(false);
const docMenuOpenFor = ref<string | null>(null);
const docMenuPosition = ref({ x: 0, y: 0 });
const actionLoadingFor = ref<string | null>(null);

const isRenameOpen = ref(false);
const renameDoc = ref<DocTile | null>(null);
const renameValue = ref("");
const renameSaving = ref(false);
const renameError = ref("");

const isDeleteOpen = ref(false);
const deleteDoc = ref<DocTile | null>(null);
const deleteSaving = ref(false);
const deleteError = ref("");

let nowTickIntervalId: number | null = null;
const activeDoc = computed(() => docs.value.find((doc) => doc.id === docMenuOpenFor.value) ?? null);

function mapApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.data === "object" && error.data && "error" in error.data) {
      return String((error.data as { error: unknown }).error);
    }
    return `Erreur API (${error.status})`;
  }
  return "Une erreur est survenue.";
}

async function loadDocuments() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const query = includeArchived.value ? "?includeArchived=1" : "";
    const data = await auth.apiRequest<{ documents: DocTile[] }>(`/documents${query}`, { auth: true });
    docs.value = data.documents;
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    loading.value = false;
  }
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
    await router.push(`/documents/${data.document.id}`);
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    creating.value = false;
  }
}

function openDocument(id: string) {
  router.push(`/documents/${id}`);
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
}

onMounted(() => {
  loadDocuments();
  nowTickIntervalId = window.setInterval(() => {
    nowTs.value = Date.now();
  }, 10_000);
  window.addEventListener("click", onWindowClick);
});

onUnmounted(() => {
  window.removeEventListener("click", onWindowClick);
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
          <p v-if="auth.state.user" class="subtitle">
            {{ docs.length }} document(s)
          </p>
        </div>

        <UserAccountMenu />
      </header>

      <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>

      <div class="tiles-toolbar">
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

      <section class="tiles-grid">
        <button type="button" class="doc-tile create-tile" :disabled="creating" @click="createDocument">
          <span class="create-plus">+</span>
          <span class="create-label">Nouveau document</span>
        </button>

        <article
          v-for="doc in docs"
          :key="doc.id"
          class="doc-tile"
          role="button"
          tabindex="0"
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
            <small v-if="doc.archivedByCurrentUser" class="archived-tag">Archivé</small>
          </div>
        </article>
      </section>

      <p v-if="loading" class="loading-state">Chargement...</p>
    </section>
  </main>

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
      <button v-if="activeDoc.role === 'owner'" type="button" class="doc-menu-item danger" @click.stop="openDeleteDialog(activeDoc)">
        <span class="leading"><font-awesome-icon icon="trash" /></span>
        <span>Supprimer</span>
      </button>
    </div>
  </Teleport>

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
</template>

<style scoped>
.dashboard-page {
  height: 100dvh;
  padding: 18px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 10% 10%, #e0f2fe 0%, transparent 35%),
    radial-gradient(circle at 90% 0%, #dbeafe 0%, transparent 38%),
    #f8fafc;
}

.dashboard-shell {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: #0f172a;
  font: 700 1.35rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.subtitle {
  margin: 4px 0 0;
  color: #64748b;
  font: 500 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.error-banner {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px 10px;
  font: 600 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tiles-toolbar {
  display: flex;
  justify-content: flex-end;
}

.filter-menu-wrap {
  position: relative;
}

.icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
}

.icon-btn:hover {
  background: #f1f5f9;
}

.filter-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 250px;
  border: 1px solid #d5e2ef;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(18, 37, 58, 0.16);
  padding: 10px;
  z-index: 30;
}

.filter-check {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #334155;
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

.doc-tile {
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #ffffff;
  min-height: 190px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
  display: grid;
  grid-template-rows: 120px minmax(0, 1fr);
}

.doc-tile:hover {
  border-color: #93c5fd;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.12);
}

.create-tile {
  display: grid;
  place-items: center;
  grid-template-rows: auto auto;
  gap: 6px;
  background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
}

.create-plus {
  color: #2563eb;
  font: 700 2rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.create-label {
  color: #334155;
  font: 600 0.85rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tile-thumb {
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 8px;
  box-sizing: border-box;
  overflow: hidden;
}

.tile-thumb pre {
  margin: 0;
  color: #64748b;
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
  color: #0f172a;
  font: 600 0.86rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-actions-wrap {
  position: relative;
}

.doc-menu-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #334155;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.doc-menu-btn:hover {
  background: #f1f5f9;
}

.doc-menu {
  position: fixed;
  min-width: 170px;
  border: 1px solid #d5e2ef;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(18, 37, 58, 0.16);
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
  background: #ffffff;
  color: #1a3652;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
  font: 500 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.doc-menu-item:hover {
  background: #f3f8ff;
}

.doc-menu-item.danger {
  color: #7d1f1f;
}

.doc-menu-item .leading {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: #64748b;
}

.tile-meta small {
  color: #64748b;
  font: 500 0.72rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tile-meta small.muted {
  color: #94a3b8;
}

.archived-tag {
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 999px;
  width: fit-content;
  padding: 0 8px;
}

.loading-state {
  margin: 0;
  color: #64748b;
  font: 500 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.28);
  display: grid;
  place-items: center;
  z-index: 60;
}

.dialog-card {
  width: min(460px, calc(100% - 24px));
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.dialog-card h3 {
  margin: 0;
  color: #0f172a;
  font: 700 1rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-text {
  margin: 0;
  color: #334155;
  font: 500 0.85rem/1.3 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-field {
  display: grid;
  gap: 4px;
}

.dialog-field span {
  color: #475569;
  font: 600 0.74rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-field input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
  font: 500 0.82rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-error {
  margin: 0;
  color: #b91c1c;
  font: 600 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost-btn {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  height: 32px;
  padding: 0 10px;
  color: #334155;
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.ghost-btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
}

.ghost-btn.danger {
  background: #b91c1c;
  border-color: #991b1b;
  color: #ffffff;
}
</style>
