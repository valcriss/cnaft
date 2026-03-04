<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useCanvasStore } from "../../stores/useCanvasStore";

const props = withDefaults(
  defineProps<{
    title?: string;
    titleEditable?: boolean;
  }>(),
  {
    title: "Canvas Notes",
    titleEditable: false,
  },
);

const canvas = useCanvasStore();
const emits = defineEmits<{
  (event: "exportPng"): void;
  (event: "exportSvg"): void;
  (event: "titleCommit", title: string): void;
}>();

const importInputRef = ref<HTMLInputElement | null>(null);
const titleInputRef = ref<HTMLInputElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const timerMenuRef = ref<HTMLElement | null>(null);
const voteMenuRef = ref<HTMLElement | null>(null);
const usersRef = ref<HTMLElement | null>(null);

const isMenuOpen = ref(false);
const isTimerMenuOpen = ref(false);
const isVoteMenuOpen = ref(false);
const userMenuOpenFor = ref<string | null>(null);
const isTitleEditing = ref(false);
const editingTitle = ref(props.title);

const timerMinutes = ref(5);
const timerSeconds = ref(0);
const timerSoundEnabled = ref(true);

const voteTarget = ref<"selected" | "all">("selected");
const votePerParticipant = ref(3);
const voteMaxPerObject = ref(1);
const voteAddTimer = ref(false);
const voteTimerMinutes = ref(5);
const voteTimerSeconds = ref(0);
const voteTimerSoundEnabled = ref(true);

const hasTimerSoundSource = computed(() => Boolean(canvas.state.timerSoundMp3 || canvas.state.timerSoundOgg));
const zoomLabel = computed(() => `${Math.round(canvas.state.viewport.zoom * 100)}%`);
const gridSizeLabel = computed(() => `${canvas.state.gridSize}px`);
type ConnectedUser = {
  id: string;
  username: string;
  avatar: string;
  color: string;
  isLocal: boolean;
  online: boolean;
  lastSeenAt: number;
};

const allConnectedUsers = computed<ConnectedUser[]>(() => {
  const users: ConnectedUser[] = [
    {
      id: canvas.state.clientId,
      username: canvas.state.localIdentity.username,
      avatar: canvas.state.localIdentity.avatar,
      color: canvas.state.localIdentity.color,
      isLocal: true,
      online: true,
      lastSeenAt: Date.now(),
    },
  ];

  for (const [clientId, presence] of Object.entries(canvas.state.remotePresences)) {
    if (!presence.online) continue;
    users.push({
      id: clientId,
      username: presence.username,
      avatar: presence.avatar,
      color: presence.color,
      isLocal: false,
      online: presence.online,
      lastSeenAt: presence.lastSeenAt,
    });
  }
  if (users.length <= 1) return users;

  const localUser = users[0];
  if (!localUser) return users;
  const remotes = users.slice(1);
  const statusRank = { online: 0, away: 1, offline: 2 } as const;
  remotes.sort((a, b) => {
    const aStatus = getUserStatus(a);
    const bStatus = getUserStatus(b);
    const byStatus = statusRank[aStatus] - statusRank[bStatus];
    if (byStatus !== 0) return byStatus;
    return a.username.localeCompare(b.username, "fr", { sensitivity: "base" });
  });
  return [localUser, ...remotes];
});
const currentUser = computed(() => allConnectedUsers.value.find((user) => user.isLocal) ?? null);
const otherUsers = computed(() => allConnectedUsers.value.filter((user) => !user.isLocal));
const nowTs = ref(Date.now());
let statusTickIntervalId: number | null = null;
const selectedVotableCount = computed(() =>
  canvas.state.elements.filter(
    (element) =>
      canvas.state.selectedIds.includes(element.id) && (element.type === "note" || element.type === "image"),
  ).length,
);
const voteTargetCount = computed(() => {
  if (voteTarget.value === "selected") {
    return selectedVotableCount.value;
  }
  return canvas.state.elements.filter((element) => element.type === "note" || element.type === "image").length;
});
const voteCapacity = computed(() => {
  const maxPerObject = Math.max(1, Math.floor(Number(voteMaxPerObject.value) || 1));
  return voteTargetCount.value * maxPerObject;
});
const isVoteConfigInvalid = computed(() => {
  if (canvas.state.voteActive) return false;
  const requested = Math.max(1, Math.floor(Number(votePerParticipant.value) || 1));
  return voteTargetCount.value === 0 || requested > voteCapacity.value;
});
const voteConfigError = computed(() => {
  if (canvas.state.voteActive) return "";
  const requested = Math.max(1, Math.floor(Number(votePerParticipant.value) || 1));
  if (voteTargetCount.value === 0) {
    return "Aucun objet votable pour cette selection.";
  }
  if (requested <= voteCapacity.value) return "";
  return `Configuration impossible: ${requested} votes demandes, capacite max ${voteCapacity.value} (${voteTargetCount.value} objets x ${Math.max(1, Math.floor(Number(voteMaxPerObject.value) || 1))} vote(s) max).`;
});
const collabDebugRows = computed(() => [
  { label: "Adapter", value: canvas.getCollabAdapterName() },
  { label: "Envoyees", value: String(canvas.state.collabDebug.sentCount) },
  { label: "Recues", value: String(canvas.state.collabDebug.recvCount) },
  { label: "Gaps", value: String(canvas.state.collabDebug.gapCount) },
  { label: "Invalides", value: String(canvas.state.collabDebug.invalidCount) },
  { label: "Dernier envoi", value: canvas.state.collabDebug.lastSentType || "-" },
  { label: "Derniere reception", value: canvas.state.collabDebug.lastRecvType || "-" },
  { label: "Seq max", value: String(canvas.state.collabDebug.lastSeq) },
]);
const collabDebugRecentOps = computed(() =>
  canvas.state.collabDebug.recentOps.map((row) => ({
    id: `${row.at}-${row.direction}-${row.clientId}-${row.seq ?? "na"}-${row.type}`,
    label: `${row.direction.toUpperCase()} ${row.type}`,
    meta: `${row.clientId.slice(0, 6)} · ${row.seq ?? "-"} · ${new Date(row.at).toLocaleTimeString()}`,
  })),
);

watch(
  () => props.title,
  (value) => {
    if (!isTitleEditing.value) {
      editingTitle.value = value;
    }
  },
);

function roundZoom(value: number) {
  return Math.round(value * 100) / 100;
}

function getInitials(username: string) {
  const parts = username
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";
  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getUserStatus(user: { isLocal: boolean; online: boolean; lastSeenAt: number }) {
  if (user.isLocal) return "online";
  if (!user.online) return "offline";
  const ageMs = Math.max(0, nowTs.value - user.lastSeenAt);
  if (ageMs > 6000) return "away";
  return "online";
}

function getUserStatusLabel(user: {
  username: string;
  isLocal: boolean;
  online: boolean;
  lastSeenAt: number;
}) {
  const status = getUserStatus(user);
  const translated = status === "online" ? "En ligne" : status === "away" ? "Absent" : "Hors ligne";
  return `${user.username} - ${translated}`;
}

function normalizeDuration(minutesValue: number, secondsValue: number) {
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0));
  const seconds = Math.max(0, Math.floor(Number(secondsValue) || 0));
  const normalizedSeconds = Math.min(59, seconds);
  const total = minutes * 60 + normalizedSeconds;
  return { minutes, seconds: normalizedSeconds, total };
}

function zoomIn() {
  canvas.setZoom(roundZoom(canvas.state.viewport.zoom + 0.05));
}

function zoomOut() {
  canvas.setZoom(roundZoom(canvas.state.viewport.zoom - 0.05));
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const json = canvas.exportDocumentJson();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadTextFile(`canvas-${stamp}.json`, json, "application/json");
  isMenuOpen.value = false;
}

function triggerImportJson() {
  importInputRef.value?.click();
  isMenuOpen.value = false;
}

async function importJsonFromFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const text = await file.text();
  const result = canvas.importDocumentJson(text);
  if (!result.ok) {
    window.alert(result.error);
  }
  input.value = "";
}

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
  if (isMenuOpen.value) {
    isTimerMenuOpen.value = false;
    isVoteMenuOpen.value = false;
    userMenuOpenFor.value = null;
  }
}

function closeMenu() {
  isMenuOpen.value = false;
}

function toggleTimerMenu() {
  isTimerMenuOpen.value = !isTimerMenuOpen.value;
  if (!isTimerMenuOpen.value) return;

  timerSoundEnabled.value = hasTimerSoundSource.value && canvas.state.timerSoundEnabled;
  if (canvas.state.timerRunning) {
    const remaining = Math.max(0, canvas.state.timerRemainingSec);
    timerMinutes.value = Math.floor(remaining / 60);
    timerSeconds.value = remaining % 60;
  }
  isMenuOpen.value = false;
  isVoteMenuOpen.value = false;
  userMenuOpenFor.value = null;
}

function closeTimerMenu() {
  isTimerMenuOpen.value = false;
}

function applyTimerAction() {
  if (canvas.state.timerRunning) {
    canvas.stopTimer();
    closeTimerMenu();
    return;
  }

  const normalized = normalizeDuration(timerMinutes.value, timerSeconds.value);
  timerMinutes.value = normalized.minutes;
  timerSeconds.value = normalized.seconds;
  if (normalized.total <= 0) {
    window.alert("Duree invalide. Renseigne au moins 1 seconde.");
    return;
  }

  canvas.startTimer(normalized.total, hasTimerSoundSource.value && timerSoundEnabled.value);
  closeTimerMenu();
}

function toggleVoteMenu() {
  isVoteMenuOpen.value = !isVoteMenuOpen.value;
  if (!isVoteMenuOpen.value) return;

  if (!canvas.state.voteActive) {
    voteTarget.value = selectedVotableCount.value > 0 ? "selected" : "all";
  }

  voteTimerSoundEnabled.value = hasTimerSoundSource.value;
  isMenuOpen.value = false;
  isTimerMenuOpen.value = false;
  userMenuOpenFor.value = null;
}

function closeVoteMenu() {
  isVoteMenuOpen.value = false;
}

function applyVoteAction() {
  if (canvas.state.voteActive) {
    canvas.closeVoteSession();
    if (canvas.state.timerRunning) {
      canvas.stopTimer();
    }
    closeVoteMenu();
    return;
  }

  const normalizedVotes = Math.max(1, Math.floor(Number(votePerParticipant.value) || 1));
  const normalizedMax = Math.max(1, Math.floor(Number(voteMaxPerObject.value) || 1));
  votePerParticipant.value = normalizedVotes;
  voteMaxPerObject.value = normalizedMax;
  if (voteTargetCount.value === 0 || normalizedVotes > voteCapacity.value) {
    window.alert(voteConfigError.value || "Configuration de vote invalide.");
    return;
  }

  let voteTimerDuration = 0;
  if (voteAddTimer.value) {
    const normalizedTimer = normalizeDuration(voteTimerMinutes.value, voteTimerSeconds.value);
    voteTimerMinutes.value = normalizedTimer.minutes;
    voteTimerSeconds.value = normalizedTimer.seconds;
    if (normalizedTimer.total <= 0) {
      window.alert("Duree du timer de vote invalide.");
      return;
    }
    voteTimerDuration = normalizedTimer.total;
  }

  const result = canvas.startVoteSession(voteTarget.value, normalizedVotes, normalizedMax);
  if (!result.ok) {
    window.alert(result.error);
    return;
  }

  if (voteAddTimer.value) {
    canvas.startTimer(voteTimerDuration, hasTimerSoundSource.value && voteTimerSoundEnabled.value);
  }

  closeVoteMenu();
}

function adjustVotesToCapacity() {
  votePerParticipant.value = Math.max(1, voteCapacity.value);
}

function toggleUserMenu(userId: string) {
  userMenuOpenFor.value = userMenuOpenFor.value === userId ? null : userId;
  if (userMenuOpenFor.value) {
    isMenuOpen.value = false;
    isTimerMenuOpen.value = false;
    isVoteMenuOpen.value = false;
  }
}

function closeUserMenu() {
  userMenuOpenFor.value = null;
}

function onForceFollowersToMe() {
  canvas.forceFollowersToMe();
  closeUserMenu();
}

function onFollowUser(userId: string) {
  canvas.startFollowingUser(userId);
  closeUserMenu();
}

function onWindowPointerDown(event: PointerEvent) {
  const target = event.target as Node | null;

  if (isMenuOpen.value && (!menuRef.value || !target || !menuRef.value.contains(target))) {
    closeMenu();
  }

  if (isTimerMenuOpen.value && (!timerMenuRef.value || !target || !timerMenuRef.value.contains(target))) {
    closeTimerMenu();
  }

  if (isVoteMenuOpen.value && (!voteMenuRef.value || !target || !voteMenuRef.value.contains(target))) {
    closeVoteMenu();
  }

  if (userMenuOpenFor.value && (!usersRef.value || !target || !usersRef.value.contains(target))) {
    closeUserMenu();
  }
}

function zoomInFromMenu() {
  zoomIn();
}

function zoomOutFromMenu() {
  zoomOut();
}

function increaseGridStepFromMenu() {
  canvas.increaseGridSize();
}

function decreaseGridStepFromMenu() {
  canvas.decreaseGridSize();
}

function resetViewFromMenu() {
  canvas.resetView();
  closeMenu();
}

function exportPngFromMenu() {
  emits("exportPng");
  closeMenu();
}

function exportSvgFromMenu() {
  emits("exportSvg");
  closeMenu();
}

function clearCollabDebug() {
  canvas.clearCollabDebugLog();
}

async function startTitleEdit() {
  if (!props.titleEditable) return;
  isTitleEditing.value = true;
  editingTitle.value = props.title;
  await nextTick();
  titleInputRef.value?.focus();
  titleInputRef.value?.select();
}

function cancelTitleEdit() {
  isTitleEditing.value = false;
  editingTitle.value = props.title;
}

function commitTitleEdit() {
  const normalized = editingTitle.value.trim() || props.title;
  isTitleEditing.value = false;
  editingTitle.value = normalized;
  if (normalized !== props.title) {
    emits("titleCommit", normalized);
  }
}

function onTitleInputKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    commitTitleEdit();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    cancelTitleEdit();
  }
}

onMounted(() => {
  window.addEventListener("pointerdown", onWindowPointerDown);
  statusTickIntervalId = window.setInterval(() => {
    nowTs.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  window.removeEventListener("pointerdown", onWindowPointerDown);
  if (statusTickIntervalId !== null) {
    window.clearInterval(statusTickIntervalId);
    statusTickIntervalId = null;
  }
});
</script>

<template>
  <header class="topbar">
    <div v-if="isTitleEditing && props.titleEditable" class="brand-edit-wrap">
      <input
        ref="titleInputRef"
        v-model="editingTitle"
        class="brand-input"
        type="text"
        maxlength="120"
        @blur="commitTitleEdit"
        @keydown="onTitleInputKeyDown"
      />
    </div>
    <div v-else class="brand" :class="{ editable: props.titleEditable }" @dblclick="startTitleEdit">
      {{ props.title }}
    </div>
    <div class="right-controls">
      <div ref="usersRef" class="connected-users" aria-label="Utilisateurs connectes">
        <div
          v-if="currentUser"
          class="connected-user-wrap"
          :class="{ 'following-target': canvas.state.followTargetClientId === currentUser.id }"
          :style="{ '--follow-color': currentUser.color }"
        >
          <button
            type="button"
            class="connected-user user-btn"
            :class="{
              local: currentUser.isLocal,
              'following-target': canvas.state.followTargetClientId === currentUser.id,
            }"
            :title="getUserStatusLabel(currentUser)"
            :style="{ borderColor: currentUser.color, '--follow-color': currentUser.color }"
            @click="toggleUserMenu(currentUser.id)"
          >
            <img v-if="currentUser.avatar" :src="currentUser.avatar" :alt="currentUser.username" />
            <span v-else>{{ getInitials(currentUser.username) }}</span>
            <span class="user-status-dot" :class="`status-${getUserStatus(currentUser)}`"></span>
          </button>
          <div v-if="userMenuOpenFor === currentUser.id" class="menu-panel user-menu-panel" role="menu">
            <button type="button" class="menu-item" @click="onForceFollowersToMe">
              <span class="menu-item-leading"><font-awesome-icon icon="arrows-left-right" /></span>
              <span>Forcer les utilisateurs a me suivre</span>
            </button>
          </div>
        </div>

        <div v-if="otherUsers.length > 0" class="users-separator"></div>

        <div
          v-for="user in otherUsers"
          :key="`connected-user-${user.id}`"
          class="connected-user-wrap"
          :class="{ 'following-target': canvas.state.followTargetClientId === user.id }"
          :style="{ '--follow-color': user.color }"
        >
          <button
            type="button"
            class="connected-user user-btn"
            :class="{ 'following-target': canvas.state.followTargetClientId === user.id }"
            :title="getUserStatusLabel(user)"
            :style="{ borderColor: user.color, '--follow-color': user.color }"
            @click="toggleUserMenu(user.id)"
          >
            <img v-if="user.avatar" :src="user.avatar" :alt="user.username" />
            <span v-else>{{ getInitials(user.username) }}</span>
            <span class="user-status-dot" :class="`status-${getUserStatus(user)}`"></span>
          </button>
          <div v-if="userMenuOpenFor === user.id" class="menu-panel user-menu-panel" role="menu">
            <button type="button" class="menu-item" @click="onFollowUser(user.id)">
              <span class="menu-item-leading"><font-awesome-icon icon="right-from-bracket" /></span>
              <span>Suivre cet utilisateur</span>
            </button>
          </div>
        </div>
      </div>

      <div class="top-separator"></div>

      <div ref="voteMenuRef" class="menu-wrap">
        <button type="button" title="Vote" @click="toggleVoteMenu">
          <font-awesome-icon icon="thumbs-up" />
        </button>
        <div v-if="isVoteMenuOpen" class="menu-panel timer-panel" role="menu" aria-label="Vote">
          <div class="menu-group">
            <span class="menu-label">Objets votables</span>
            <label class="timer-check">
              <input
                v-model="voteTarget"
                type="radio"
                value="selected"
                :disabled="selectedVotableCount === 0 || canvas.state.voteActive"
              />
              <span>Objets selectionnes ({{ selectedVotableCount }})</span>
            </label>
            <label class="timer-check">
              <input v-model="voteTarget" type="radio" value="all" :disabled="canvas.state.voteActive" />
              <span>Tous les objets</span>
            </label>
          </div>

          <div class="menu-group">
            <span class="menu-label">Votes par participant</span>
            <input v-model.number="votePerParticipant" class="timer-input" type="number" min="1" step="1" :disabled="canvas.state.voteActive" />
          </div>

          <div class="menu-group">
            <span class="menu-label">Votes max par objet</span>
            <input v-model.number="voteMaxPerObject" class="timer-input" type="number" min="1" step="1" :disabled="canvas.state.voteActive" />
            <div class="vote-capacity">
              Capacite max actuelle: <strong>{{ voteCapacity }}</strong>
            </div>
            <div v-if="voteConfigError" class="vote-error">
              {{ voteConfigError }}
            </div>
            <button
              v-if="voteConfigError && !canvas.state.voteActive && voteCapacity > 0"
              type="button"
              class="vote-adjust-btn"
              @click="adjustVotesToCapacity"
            >
              Ajuster automatiquement
            </button>
          </div>

          <div class="menu-group">
            <span class="menu-label">Timer</span>
            <label class="timer-check">
              <input v-model="voteAddTimer" type="checkbox" :disabled="canvas.state.voteActive" />
              <span>Ajouter un timer</span>
            </label>
            <template v-if="voteAddTimer">
              <div class="timer-input-row">
                <label class="timer-number-field">
                  <span>Minutes</span>
                  <input v-model.number="voteTimerMinutes" class="timer-input" type="number" min="0" step="1" :disabled="canvas.state.voteActive" />
                </label>
                <label class="timer-number-field">
                  <span>Secondes</span>
                  <input v-model.number="voteTimerSeconds" class="timer-input" type="number" min="0" max="59" step="1" :disabled="canvas.state.voteActive" />
                </label>
              </div>
              <label v-if="hasTimerSoundSource" class="timer-check">
                <input v-model="voteTimerSoundEnabled" type="checkbox" :disabled="canvas.state.voteActive" />
                <span>Avertissement sonore</span>
              </label>
            </template>
          </div>

          <div class="menu-separator"></div>
          <div class="timer-actions">
            <button
              type="button"
              class="menu-item"
              :disabled="!canvas.state.voteActive && isVoteConfigInvalid"
              @click="applyVoteAction"
            >
              <span class="menu-item-leading">
                <font-awesome-icon :icon="canvas.state.voteActive ? 'stop' : 'check'" />
              </span>
              <span>{{ canvas.state.voteActive ? "Cloturer le vote" : "Valider" }}</span>
            </button>
            <button type="button" class="menu-item" @click="closeVoteMenu">
              <span class="menu-item-leading"><font-awesome-icon icon="xmark" /></span>
              <span>Annuler</span>
            </button>
          </div>
        </div>
      </div>

      <div ref="timerMenuRef" class="menu-wrap">
        <button type="button" title="Timer" @click="toggleTimerMenu">
          <font-awesome-icon :icon="['far', 'alarm-clock']" />
        </button>
        <div v-if="isTimerMenuOpen" class="menu-panel timer-panel" role="menu" aria-label="Timer">
          <div class="menu-group">
            <span class="menu-label">Duree</span>
            <div class="timer-input-row">
              <label class="timer-number-field">
                <span>Minutes</span>
                <input v-model.number="timerMinutes" class="timer-input" type="number" min="0" step="1" :disabled="canvas.state.timerRunning" />
              </label>
              <label class="timer-number-field">
                <span>Secondes</span>
                <input v-model.number="timerSeconds" class="timer-input" type="number" min="0" max="59" step="1" :disabled="canvas.state.timerRunning" />
              </label>
            </div>
            <label v-if="hasTimerSoundSource" class="timer-check">
              <input v-model="timerSoundEnabled" type="checkbox" :disabled="canvas.state.timerRunning" />
              <span>Avertissement sonore</span>
            </label>
          </div>
          <div class="menu-separator"></div>
          <div class="timer-actions">
            <button type="button" class="menu-item" @click="applyTimerAction">
              <span class="menu-item-leading">
                <font-awesome-icon :icon="canvas.state.timerRunning ? 'stop' : 'check'" />
              </span>
              <span>{{ canvas.state.timerRunning ? "Stop" : "Valider" }}</span>
            </button>
            <button type="button" class="menu-item" @click="closeTimerMenu">
              <span class="menu-item-leading"><font-awesome-icon icon="xmark" /></span>
              <span>Annuler</span>
            </button>
          </div>
        </div>
      </div>

      <div class="top-separator"></div>

      <nav class="actions" aria-label="Primary actions">
        <button type="button" title="Undo" :disabled="!canvas.canUndo" @click="canvas.undo">
          <font-awesome-icon icon="undo" />
        </button>
        <button type="button" title="Redo" :disabled="!canvas.canRedo" @click="canvas.redo">
          <font-awesome-icon icon="redo" />
        </button>
      </nav>

      <div ref="menuRef" class="menu-wrap">
        <button type="button" title="Menu" @click="toggleMenu">
          <font-awesome-icon icon="bars" />
        </button>
        <div v-if="isMenuOpen" class="menu-panel" role="menu" aria-label="Menu principal">
          <div class="menu-group">
            <span class="menu-label">Pas de la grille</span>
            <div class="menu-item menu-item-static menu-zoom-inline" aria-live="polite">
              <button type="button" class="zoom-inline-btn" title="Diminuer le pas" @click="decreaseGridStepFromMenu">
                <font-awesome-icon icon="minus" />
              </button>
              <span>{{ gridSizeLabel }}</span>
              <button type="button" class="zoom-inline-btn" title="Augmenter le pas" @click="increaseGridStepFromMenu">
                <font-awesome-icon icon="plus" />
              </button>
            </div>
            <span class="menu-label">Niveau de zoom</span>
            <div class="menu-item menu-item-static menu-zoom-inline" aria-live="polite">
              <button type="button" class="zoom-inline-btn" title="Zoom out" @click="zoomOutFromMenu">
                <font-awesome-icon icon="minus" />
              </button>
              <span>{{ zoomLabel }}</span>
              <button type="button" class="zoom-inline-btn" title="Zoom in" @click="zoomInFromMenu">
                <font-awesome-icon icon="plus" />
              </button>
            </div>
            <button type="button" class="menu-item" title="Reset view" @click="resetViewFromMenu">
              <span class="menu-item-leading"><font-awesome-icon icon="rotate-left" /></span>
              <span>Reinitialiser la vue</span>
            </button>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-group">
            <button type="button" class="menu-item" title="Import JSON" @click="triggerImportJson">
              <span class="menu-item-leading"><font-awesome-icon icon="upload" /></span>
              <span>Importer JSON</span>
            </button>
            <div class="menu-separator"></div>
            <button type="button" class="menu-item" title="Export JSON" @click="exportJson">
              <span class="menu-item-leading"><font-awesome-icon icon="file-code" /></span>
              <span>Exporter JSON</span>
            </button>
            <button type="button" class="menu-item" title="Export PNG" @click="exportPngFromMenu">
              <span class="menu-item-leading"><font-awesome-icon icon="file-image" /></span>
              <span>Exporter PNG</span>
            </button>
            <button type="button" class="menu-item" title="Export SVG" @click="exportSvgFromMenu">
              <span class="menu-item-leading"><font-awesome-icon icon="download" /></span>
              <span>Exporter SVG</span>
            </button>
          </div>
          <div class="menu-separator"></div>
          <div class="menu-group">
            <span class="menu-label">Debug collab</span>
            <div v-for="row in collabDebugRows" :key="`debug-${row.label}`" class="debug-row">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
            <div class="debug-actions">
              <button type="button" class="debug-clear-btn" @click="clearCollabDebug">Vider</button>
            </div>
            <div class="debug-log">
              <div v-if="collabDebugRecentOps.length === 0" class="debug-log-empty">Aucune op recente</div>
              <div v-for="row in collabDebugRecentOps" :key="row.id" class="debug-log-row">
                <span>{{ row.label }}</span>
                <small>{{ row.meta }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <input ref="importInputRef" type="file" accept=".json,application/json" class="hidden-input" @change="importJsonFromFile" />
  </header>
</template>

<style scoped>
.topbar {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border: 1px solid #d0d7de;
  border-bottom: 0;
  border-left: 0;
  border-radius: 0 12px 0 0;
  background: #ffffff;
}

.brand {
  font: 600 0.95rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1f2328;
}

.brand.editable {
  cursor: text;
}

.brand-edit-wrap {
  width: min(380px, 40vw);
  min-width: 180px;
}

.brand-input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 10px;
  color: #0f172a;
  font: 600 0.9rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #ffffff;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.right-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.connected-users {
  display: flex;
  align-items: center;
  gap: 6px;
}

.connected-user-wrap {
  position: relative;
}

.connected-user-wrap.following-target::after {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: 999px;
  border: 2px solid var(--follow-color);
  opacity: 0.65;
  pointer-events: none;
  animation: followPulseRing 1.6s ease-out infinite;
}

.connected-user {
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 2px solid #94a3b8;
  background: #f8fafc;
  color: #0f172a;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 700 0.7rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.connected-user.user-btn {
  padding: 0;
  cursor: pointer;
}

.connected-user.following-target {
  box-shadow:
    0 0 0 2px #ffffff,
    0 0 0 4px var(--follow-color);
}

.connected-user.local {
  box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.06);
}

.connected-user.local.following-target {
  box-shadow:
    0 0 0 2px #ffffff,
    0 0 0 4px var(--follow-color);
}

.connected-user img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.user-status-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  border: 2px solid #ffffff;
  background: #94a3b8;
}

.user-status-dot.status-online {
  background: #16a34a;
}

.user-status-dot.status-away {
  background: #f59e0b;
}

.user-status-dot.status-offline {
  background: #94a3b8;
}

.users-separator {
  width: 1px;
  height: 20px;
  background: #d0d7de;
  margin: 0 2px;
}

.top-separator {
  width: 1px;
  height: 26px;
  background: #d0d7de;
  margin: 0 2px;
}

.menu-wrap {
  position: relative;
}

.menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 240px;
  border: 1px solid #d0d7de;
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
  padding: 8px;
}

.user-menu-panel {
  min-width: 250px;
  z-index: 60;
}

@keyframes followPulseRing {
  0% {
    transform: scale(0.96);
    opacity: 0.65;
  }
  100% {
    transform: scale(1.22);
    opacity: 0;
  }
}

.timer-panel {
  min-width: 280px;
}

.menu-group {
  display: grid;
  gap: 6px;
}

.debug-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 8px;
  color: #475569;
  font: 500 0.72rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  gap: 8px;
}

.debug-row strong {
  color: #0f172a;
  font-weight: 700;
}

.debug-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 8px;
}

.debug-clear-btn {
  width: auto;
  min-width: 56px;
  height: 24px;
  border-radius: 6px;
  font: 600 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 0 8px;
}

.debug-log {
  max-height: 160px;
  overflow: auto;
  padding: 2px 8px 0;
  display: grid;
  gap: 4px;
}

.debug-log-empty {
  color: #94a3b8;
  font: 500 0.68rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.debug-log-row {
  display: grid;
  gap: 2px;
  color: #334155;
  font: 600 0.68rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.debug-log-row small {
  color: #64748b;
  font: 500 0.64rem/1.1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.menu-label {
  color: #64748b;
  font: 600 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 0 8px;
}

.menu-separator {
  margin: 8px 0;
  border-top: 1px solid #eef2f6;
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 7px 8px;
  border-radius: 8px;
  color: #0f172a;
  font: 500 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.menu-item:hover {
  background: #f1f5f9;
}

.menu-item-leading {
  display: inline-flex;
  width: 16px;
  margin-right: 8px;
  justify-content: center;
  color: #64748b;
}

.menu-item-static {
  cursor: default;
  color: #475569;
}

.menu-item-static:hover {
  background: transparent;
}

.menu-zoom-inline {
  box-sizing: border-box;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.menu-zoom-inline .zoom-inline-btn {
  width: 32px;
  min-width: 32px;
  height: 30px;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  background: #f8fafc;
  color: #1f2328;
  font: 700 0.9rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.menu-zoom-inline > span {
  flex: 1;
  text-align: center;
}

.menu-zoom-inline .zoom-inline-btn:hover {
  background: #eef2f6;
}

.timer-input {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  padding: 6px 8px;
  font: 600 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.timer-input-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.timer-number-field {
  display: grid;
  gap: 4px;
  color: #64748b;
  font: 600 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.timer-check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 2px 0;
  color: #475569;
  font: 500 0.78rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.timer-actions {
  display: grid;
  gap: 4px;
}

.vote-capacity {
  color: #64748b;
  font: 600 0.72rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 0 2px;
}

.vote-error {
  color: #b91c1c;
  font: 600 0.72rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  padding: 0 2px;
}

.vote-adjust-btn {
  width: 100%;
  height: 30px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  font: 600 0.75rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

button {
  border: 1px solid #d0d7de;
  background: #f6f8fa;
  color: #1f2328;
  border-radius: 8px;
  width: 36px;
  height: 34px;
  padding: 0;
  font: 500 0.8rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

button :deep(svg) {
  font-size: 1.1rem;
}

button:hover {
  background: #eef2f6;
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hidden-input {
  display: none;
}

@media (max-width: 760px) {
  .topbar {
    border-left: 1px solid #d0d7de;
    border-radius: 12px 12px 0 0;
  }
}
</style>

