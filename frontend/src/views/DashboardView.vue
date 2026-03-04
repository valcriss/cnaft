<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import UserAccountMenu from "../components/auth/UserAccountMenu.vue";
import { ApiError, useAuthStore } from "../stores/useAuthStore";

type DocTile = {
  id: string;
  title: string;
  thumbnailJson: unknown;
  updatedAt: string;
  role: "owner" | "editor" | "viewer";
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
let nowTickIntervalId: number | null = null;

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
    const data = await auth.apiRequest<{ documents: DocTile[] }>("/documents", { auth: true });
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

onMounted(() => {
  loadDocuments();
  nowTickIntervalId = window.setInterval(() => {
    nowTs.value = Date.now();
  }, 10_000);
});

onUnmounted(() => {
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

      <section class="tiles-grid">
        <button type="button" class="doc-tile create-tile" :disabled="creating" @click="createDocument">
          <span class="create-plus">+</span>
          <span class="create-label">Nouveau document</span>
        </button>

        <button
          v-for="doc in docs"
          :key="doc.id"
          type="button"
          class="doc-tile"
          @click="openDocument(doc.id)"
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
            <strong :title="doc.title">{{ doc.title }}</strong>
            <small>{{ doc.role }} - {{ formatDate(doc.updatedAt) }}</small>
            <small class="muted">maj: {{ Math.max(0, Math.floor((nowTs - new Date(doc.updatedAt).getTime()) / 60000)) }} min</small>
          </div>
        </button>
      </section>

      <p v-if="loading" class="loading-state">Chargement...</p>
    </section>
  </main>
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
  font: 700 1.35rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.subtitle {
  margin: 4px 0 0;
  color: #64748b;
  font: 500 0.8rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.error-banner {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  padding: 8px 10px;
  font: 600 0.78rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
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
  font: 700 2rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.create-label {
  color: #334155;
  font: 600 0.85rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
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

.tile-meta strong {
  color: #0f172a;
  font: 600 0.86rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-meta small {
  color: #64748b;
  font: 500 0.72rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}

.tile-meta small.muted {
  color: #94a3b8;
}

.loading-state {
  margin: 0;
  color: #64748b;
  font: 500 0.8rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}
</style>
