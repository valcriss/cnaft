<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import CanvasWorkspace from "../components/CanvasWorkspace.vue";
import { useCanvasStore } from "../stores/useCanvasStore";
import { useAuthStore } from "../stores/useAuthStore";
import { MockWebSocketAdapter } from "../collab/mockWebSocketAdapter";
import { LocalLoopbackAdapter } from "../collab/collabAdapter";
import { CanvasWebSocketAdapter } from "../collab/webSocketAdapter";

const canvasStore = useCanvasStore();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const workspaceTitle = ref("Mon Canvas");
const titleInput = ref("Mon Canvas");
const isLoadingDocument = ref(false);
const isSavingTitle = ref(false);
const documentRole = ref<"owner" | "editor" | "viewer">("viewer");

const shareOpen = ref(false);
const shareLoading = ref(false);
const shareError = ref("");
const shareRole = ref<"viewer" | "editor">("viewer");
const shareExpiryDays = ref<0 | 1 | 7 | 30>(0);
const shareUrl = ref("");

let cleanupAdapter: (() => void) | null = null;
let beforeUnloadHandler: (() => void) | null = null;
let saveTimer: number | null = null;
let titleSaveTimer: number | null = null;
let savingInProgress = false;
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;

const documentId = computed(() => {
  const id = route.params.id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
});

const queryUsername = computed(() => {
  const q = route.query.username;
  return typeof q === "string" ? q.trim() : "";
});

const queryUserAvatar = computed(() => {
  const q = route.query.userAvatar;
  return typeof q === "string" ? q.trim() : "";
});

const workspaceUsername = computed(() => auth.state.user?.displayName || queryUsername.value || "Utilisateur");
const workspaceUserAvatar = computed(() => auth.state.user?.avatarUrl || queryUserAvatar.value || "");
const workspaceUserEmail = computed(() => auth.state.user?.email || "");

function setupCollabFromQuery() {
  const currentDocumentId = documentId.value;
  if (!currentDocumentId) return;
  const collabMode = route.query.collab;
  const username = queryUsername.value;
  if (collabMode !== "mock") return;
  if (!username) {
    window.alert("Le mode multi-user require le parametre query `username`.");
    return;
  }

  const roomRaw = route.query.room;
  const latencyRaw = route.query.latency;
  const jitterRaw = route.query.jitter;

  const room = typeof roomRaw === "string" && roomRaw ? roomRaw : "demo";
  const latency = Number(typeof latencyRaw === "string" ? latencyRaw : "80");
  const jitter = Number(typeof jitterRaw === "string" ? jitterRaw : "50");

  const adapter = new MockWebSocketAdapter({
    room,
    clientId: canvasStore.state.clientId,
    baseLatencyMs: Number.isFinite(latency) ? latency : 80,
    jitterMs: Number.isFinite(jitter) ? jitter : 50,
  });

  canvasStore.setCollabAdapter(adapter);
  canvasStore.announcePresenceJoin();
  beforeUnloadHandler = () => {
    canvasStore.announcePresenceLeave();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  cleanupAdapter = () => {
    if (beforeUnloadHandler) {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
    canvasStore.announcePresenceLeave();
    canvasStore.setCollabAdapter(new LocalLoopbackAdapter());
  };
}

function setupCollabWebSocket() {
  const currentDocumentId = documentId.value;
  if (!currentDocumentId) return;
  const token = auth.state.accessToken;
  if (!token) return;

  const wsBaseUrlRaw = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.trim();
  const wsBaseUrl = wsBaseUrlRaw
    ? wsBaseUrlRaw.replace(/\/$/, "")
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

  const adapter = new CanvasWebSocketAdapter({
    baseUrl: wsBaseUrl,
    clientId: canvasStore.state.clientId,
    documentId: currentDocumentId,
    token,
  });

  canvasStore.setCollabAdapter(adapter);
  canvasStore.announcePresenceJoin();
  beforeUnloadHandler = () => {
    canvasStore.announcePresenceLeave();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  cleanupAdapter = () => {
    if (beforeUnloadHandler) {
      window.removeEventListener("beforeunload", beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
    canvasStore.announcePresenceLeave();
    canvasStore.setCollabAdapter(new LocalLoopbackAdapter());
  };
}

function isCanvasDocumentState(value: unknown): value is {
  elements: unknown[];
  viewport: { x: number; y: number; zoom: number };
  gridSize?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.elements)) return false;
  if (!v.viewport || typeof v.viewport !== "object") return false;
  const viewport = v.viewport as Record<string, unknown>;
  return typeof viewport.x === "number" && typeof viewport.y === "number" && typeof viewport.zoom === "number";
}

async function joinByShareTokenFromUrl() {
  const shareToken = typeof route.query.share === "string" ? route.query.share.trim() : "";
  if (!shareToken) return true;
  try {
    const data = await auth.apiRequest<{ ok: true; documentId: string; role: "viewer" | "editor" }>(
      "/documents/join-by-share-token",
      {
        method: "POST",
        auth: true,
        body: { token: shareToken },
      },
    );

    if (data.documentId && data.documentId !== documentId.value) {
      await router.replace(`/documents/${data.documentId}`);
      return false;
    }

    const nextQuery = { ...route.query };
    delete nextQuery.share;
    await router.replace({ path: route.path, query: nextQuery });
    return true;
  } catch {
    window.alert("Lien de partage invalide ou expire.");
    router.replace("/dashboard");
    return false;
  }
}

async function loadDocument() {
  const id = documentId.value;
  if (!id) return;
  isLoadingDocument.value = true;
  try {
    const data = await auth.apiRequest<{
      document: {
        title: string;
        contentJson: unknown;
      };
      role: "owner" | "editor" | "viewer";
    }>(`/documents/${id}`, { auth: true });

    workspaceTitle.value = data.document.title || "Mon Canvas";
    titleInput.value = workspaceTitle.value;
    documentRole.value = data.role;

    if (isCanvasDocumentState(data.document.contentJson)) {
      canvasStore.replaceDocumentState({
        elements: data.document.contentJson.elements as never[],
        viewport: data.document.contentJson.viewport,
        gridSize: typeof data.document.contentJson.gridSize === "number" ? data.document.contentJson.gridSize : 24,
        showGrid: typeof data.document.contentJson.showGrid === "boolean" ? data.document.contentJson.showGrid : true,
        snapToGrid:
          typeof data.document.contentJson.snapToGrid === "boolean" ? data.document.contentJson.snapToGrid : false,
      });
    }
  } catch {
    window.alert("Impossible de charger le document.");
    router.replace("/dashboard");
  } finally {
    window.setTimeout(() => {
      isLoadingDocument.value = false;
    }, 0);
  }
}

async function saveDocument() {
  const id = documentId.value;
  if (!id || isLoadingDocument.value || savingInProgress) return;
  savingInProgress = true;
  try {
    const thumbnailSvg = buildThumbnailSvg();
    await auth.apiRequest(`/documents/${id}`, {
      method: "PATCH",
      auth: true,
      body: {
        contentJson: canvasStore.getDocumentState(),
        thumbnailJson: thumbnailSvg
          ? {
              kind: "svg",
              svg: thumbnailSvg,
            }
          : undefined,
      },
    });
  } catch {
    // silent autosave failure for now
  } finally {
    savingInProgress = false;
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildThumbnailSvg() {
  const sourceCanvas = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!sourceCanvas) return "";
  const offscreen = document.createElement("canvas");
  offscreen.width = THUMB_WIDTH;
  offscreen.height = THUMB_HEIGHT;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  ctx.drawImage(sourceCanvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  const pngDataUrl = offscreen.toDataURL("image/png");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" viewBox="0 0 ${THUMB_WIDTH} ${THUMB_HEIGHT}">`,
    `<rect x="0" y="0" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" fill="#ffffff" />`,
    `<image href="${escapeXml(pngDataUrl)}" x="0" y="0" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}" />`,
    "</svg>",
  ].join("");
}

async function saveTitle(force = false) {
  const id = documentId.value;
  if (!id) return;
  const nextTitle = titleInput.value.trim() || "Mon Canvas";
  if (!force && nextTitle === workspaceTitle.value) return;
  isSavingTitle.value = true;
  try {
    await auth.apiRequest(`/documents/${id}`, {
      method: "PATCH",
      auth: true,
      body: { title: nextTitle },
    });
    workspaceTitle.value = nextTitle;
  } catch {
    // keep local value, sync later
  } finally {
    isSavingTitle.value = false;
  }
}

function openShareDialog() {
  shareOpen.value = true;
  shareError.value = "";
  shareUrl.value = "";
  shareRole.value = "viewer";
  shareExpiryDays.value = 0;
}

function closeShareDialog() {
  shareOpen.value = false;
}

async function createShareLink() {
  const id = documentId.value;
  if (!id) return;
  shareLoading.value = true;
  shareError.value = "";
  shareUrl.value = "";
  try {
    const expiresAt =
      shareExpiryDays.value > 0
        ? new Date(Date.now() + shareExpiryDays.value * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    const data = await auth.apiRequest<{
      shareLink: { token: string; role: "viewer" | "editor"; expiresAt: string | null };
    }>(`/documents/${id}/share-links`, {
      method: "POST",
      auth: true,
      body: {
        role: shareRole.value,
        expiresAt,
      },
    });
    shareUrl.value = `${window.location.origin}/documents/${id}?share=${encodeURIComponent(data.shareLink.token)}`;
  } catch {
    shareError.value = "Impossible de creer le lien de partage.";
  } finally {
    shareLoading.value = false;
  }
}

async function copyShareUrl() {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
  } catch {
    // ignore
  }
}

watch(
  () => titleInput.value,
  () => {
    if (!documentId.value || isLoadingDocument.value) return;
    if (titleSaveTimer !== null) {
      window.clearTimeout(titleSaveTimer);
    }
    titleSaveTimer = window.setTimeout(() => {
      saveTitle();
    }, 500);
  },
);

watch(
  () => canvasStore.state.revision,
  () => {
    if (!documentId.value || isLoadingDocument.value) return;
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
    }
    saveTimer = window.setTimeout(() => {
      saveDocument();
    }, 800);
  },
);

onMounted(async () => {
  const isE2E = route.query.e2e === "1";
  if (isE2E) {
    const e2eHost = window as typeof window & { __canvasE2E?: unknown };
    e2eHost.__canvasE2E = {
      getState: () => ({
        elementsCount: canvasStore.state.elements.length,
        viewport: { ...canvasStore.state.viewport },
        followTargetClientId: canvasStore.state.followTargetClientId,
        voteActive: canvasStore.state.voteActive,
        timerRunning: canvasStore.state.timerRunning,
        voteRemaining: canvasStore.state.voteRemaining,
      }),
    };
  }

  if (route.query.collab === "mock") {
    setupCollabFromQuery();
  } else {
    setupCollabWebSocket();
  }

  const continueLoad = await joinByShareTokenFromUrl();
  if (!continueLoad) return;

  await loadDocument();
});

onUnmounted(() => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
  }
  if (titleSaveTimer !== null) {
    window.clearTimeout(titleSaveTimer);
  }
  cleanupAdapter?.();
  cleanupAdapter = null;
});

watch(
  () => shareOpen.value,
  (open) => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeShareDialog();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const stop = watch(
      () => shareOpen.value,
      (stillOpen) => {
        if (!stillOpen) {
          window.removeEventListener("keydown", onKeyDown);
          stop();
        }
      },
    );
  },
);

function goDashboard() {
  router.push("/dashboard");
}

function logout() {
  auth.logout();
  router.replace("/login");
}
</script>

<template>
  <div class="app-layout">
    <header class="workspace-head">
      <div class="left-actions">
        <button type="button" class="ghost-btn" @click="goDashboard">Dashboard</button>
        <button
          v-if="documentRole === 'owner'"
          type="button"
          class="ghost-btn"
          @click="openShareDialog"
        >
          Partager
        </button>
        <input
          v-model="titleInput"
          class="title-input"
          type="text"
          maxlength="120"
          @blur="saveTitle(true)"
        />
        <small v-if="isSavingTitle" class="muted">Sauvegarde titre...</small>
      </div>
      <div class="right-actions">
        <div class="user-chip">
          <img v-if="workspaceUserAvatar" :src="workspaceUserAvatar" :alt="workspaceUsername" />
          <span v-else class="fallback">{{ workspaceUsername.slice(0, 2).toUpperCase() }}</span>
          <div class="user-meta">
            <strong>{{ workspaceUsername }}</strong>
            <small>{{ workspaceUserEmail }}</small>
          </div>
        </div>
        <button type="button" class="ghost-btn" @click="logout">Deconnexion</button>
      </div>
    </header>

    <CanvasWorkspace
      :title="workspaceTitle"
      :username="workspaceUsername"
      :user-avatar="workspaceUserAvatar"
      timer-sound-mp3="/sound/alarm.mp3"
      timer-sound-ogg="/sound/alarm.ogg"
    />

    <div v-if="shareOpen" class="share-overlay" @click.self="closeShareDialog">
      <section class="share-modal">
        <h3>Partager le document</h3>
        <label class="share-field">
          <span>Role</span>
          <select v-model="shareRole">
            <option value="viewer">Lecteur</option>
            <option value="editor">Editeur</option>
          </select>
        </label>
        <label class="share-field">
          <span>Expiration</span>
          <select v-model.number="shareExpiryDays">
            <option :value="0">Aucune</option>
            <option :value="1">1 jour</option>
            <option :value="7">7 jours</option>
            <option :value="30">30 jours</option>
          </select>
        </label>
        <div class="share-actions">
          <button type="button" class="ghost-btn primary" :disabled="shareLoading" @click="createShareLink">
            {{ shareLoading ? "Generation..." : "Generer le lien" }}
          </button>
        </div>
        <p v-if="shareError" class="share-error">{{ shareError }}</p>
        <div v-if="shareUrl" class="share-url-wrap">
          <input :value="shareUrl" readonly />
          <button type="button" class="ghost-btn" @click="copyShareUrl">Copier</button>
        </div>
        <div class="share-close-row">
          <button type="button" class="ghost-btn" @click="closeShareDialog">Fermer</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  box-sizing: border-box;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  background: #f1f3f5;
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
}

.workspace-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #d1d5db;
  background: #ffffff;
  padding: 0 12px;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-input {
  width: min(420px, 48vw);
  max-width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  height: 32px;
  padding: 0 10px;
  color: #0f172a;
  font: 600 0.84rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.ghost-btn {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #ffffff;
  height: 32px;
  padding: 0 10px;
  color: #334155;
  font: 600 0.76rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-chip img,
.user-chip .fallback {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  object-fit: cover;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #1e3a8a;
  font: 700 0.72rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-meta {
  display: grid;
  gap: 1px;
}

.user-meta strong {
  color: #0f172a;
  font: 600 0.75rem/1.1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-meta small {
  color: #64748b;
  font: 500 0.68rem/1.1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.muted {
  color: #64748b;
  font: 500 0.7rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.share-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.28);
  display: grid;
  place-items: center;
  z-index: 60;
}

.share-modal {
  width: min(460px, calc(100% - 24px));
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.share-modal h3 {
  margin: 0;
  color: #0f172a;
  font: 700 1rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.share-field {
  display: grid;
  gap: 4px;
}

.share-field span {
  color: #475569;
  font: 600 0.74rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.share-field select,
.share-url-wrap input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  height: 34px;
  padding: 0 10px;
}

.share-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ghost-btn.primary {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
}

.share-error {
  margin: 0;
  color: #b91c1c;
  font: 600 0.78rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.share-url-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.share-close-row {
  display: flex;
  justify-content: flex-end;
}
</style>
