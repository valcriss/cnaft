<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/useAuthStore";
import type { ThemePreference } from "../../stores/useThemeStore";

const auth = useAuthStore();
const router = useRouter();
const menuWrapRef = ref<HTMLElement | null>(null);
const avatarInput = ref<HTMLInputElement | null>(null);
const isMenuOpen = ref(false);
const isProfileOpen = ref(false);
const isAvatarSaving = ref(false);
const isProfileSaving = ref(false);
const profileDisplayName = ref("");
const profileThemePreference = ref<ThemePreference>("system");
const oidcEnabled = ref(false);
const errorText = ref("");
const successText = ref("");
let successMessageTimerId: number | null = null;

const initials = computed(() => {
  const username = auth.state.user?.displayName || "U";
  return (
    username
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
});

const hasDisplayNameChanged = computed(
  () => !oidcEnabled.value && profileDisplayName.value.trim() !== (auth.state.user?.displayName || ""),
);
const hasThemeChanged = computed(
  () => profileThemePreference.value !== (auth.state.user?.themePreference ?? "system"),
);
const hasProfileChanges = computed(() => hasDisplayNameChanged.value || hasThemeChanged.value);

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value;
}

function closeMenu() {
  isMenuOpen.value = false;
}

async function openProfile() {
  closeMenu();
  isProfileOpen.value = true;
  profileDisplayName.value = auth.state.user?.displayName || "";
  profileThemePreference.value = auth.state.user?.themePreference ?? "system";
  errorText.value = "";
  successText.value = "";
  try {
    const providers = await auth.getProviders();
    oidcEnabled.value = providers.provider === "oidc";
  } catch {
    oidcEnabled.value = false;
  }
}

function closeProfile() {
  isProfileOpen.value = false;
  if (successMessageTimerId !== null) {
    globalThis.clearTimeout(successMessageTimerId);
    successMessageTimerId = null;
  }
  successText.value = "";
  errorText.value = "";
}

function logout() {
  closeMenu();
  auth.logout();
  router.replace("/login");
}

function setSuccessTextWithTimeout(message: string) {
  successText.value = message;
  if (successMessageTimerId !== null) {
    globalThis.clearTimeout(successMessageTimerId);
  }
  successMessageTimerId = globalThis.setTimeout(() => {
    successText.value = "";
    successMessageTimerId = null;
  }, 4000);
}

function pickAvatarFile() {
  avatarInput.value?.click();
}

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FILE_READ_ERROR"));
    reader.readAsDataURL(file);
  });
}

async function updateAvatar(avatarDataUrl: string | null) {
  const data = await auth.apiRequest<{
    user: { id: string; email: string; displayName: string; avatarUrl: string | null; themePreference: ThemePreference };
  }>("/auth/me/avatar", {
    method: "PATCH",
    auth: true,
    body: { avatarDataUrl },
  });
  auth.setUser(data.user);
}

async function onAvatarPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  errorText.value = "";
  successText.value = "";
  isAvatarSaving.value = true;
  try {
    const dataUrl = await toDataUrl(file);
    await updateAvatar(dataUrl);
    setSuccessTextWithTimeout("Avatar enregistre.");
  } catch {
    errorText.value = "Impossible d'enregistrer l'avatar.";
  } finally {
    isAvatarSaving.value = false;
  }
}

async function removeAvatar() {
  errorText.value = "";
  successText.value = "";
  isAvatarSaving.value = true;
  try {
    await updateAvatar(null);
    setSuccessTextWithTimeout("Avatar supprime.");
  } catch {
    errorText.value = "Impossible de supprimer l'avatar.";
  } finally {
    isAvatarSaving.value = false;
  }
}

async function saveProfile() {
  const nextDisplayName = profileDisplayName.value.trim();
  const nextThemePreference = profileThemePreference.value;

  if (!oidcEnabled.value && !nextDisplayName) {
    errorText.value = "Le nom utilisateur est requis.";
    return;
  }

  if (!hasProfileChanges.value) {
    closeProfile();
    return;
  }

  errorText.value = "";
  successText.value = "";
  isProfileSaving.value = true;
  try {
    let nextUser = auth.state.user;

    if (hasDisplayNameChanged.value) {
      const data = await auth.apiRequest<{
        user: {
          id: string;
          email: string;
          displayName: string;
          avatarUrl: string | null;
          themePreference: ThemePreference;
        };
      }>("/auth/me", {
        method: "PATCH",
        auth: true,
        body: { displayName: nextDisplayName },
      });
      nextUser = data.user;
    }

    if (hasThemeChanged.value) {
      const data = await auth.apiRequest<{
        user: {
          id: string;
          email: string;
          displayName: string;
          avatarUrl: string | null;
          themePreference: ThemePreference;
        };
      }>("/auth/me/preferences", {
        method: "PATCH",
        auth: true,
        body: { themePreference: nextThemePreference },
      });
      nextUser = data.user;
    }

    if (nextUser) {
      auth.setUser(nextUser);
    }
    closeProfile();
  } catch {
    errorText.value = "Impossible de sauvegarder le profil.";
  } finally {
    isProfileSaving.value = false;
  }
}

function onWindowClick(event: MouseEvent) {
  const target = event.target as Node | null;
  if (!target || !menuWrapRef.value?.contains(target)) {
    closeMenu();
  }
}

onMounted(() => {
  globalThis.addEventListener("click", onWindowClick);
});

onUnmounted(() => {
  globalThis.removeEventListener("click", onWindowClick);
  if (successMessageTimerId !== null) {
    globalThis.clearTimeout(successMessageTimerId);
    successMessageTimerId = null;
  }
});
</script>

<template>
  <div v-if="auth.state.user" ref="menuWrapRef" class="avatar-menu-wrap">
    <button type="button" class="user-panel user-panel-button" aria-label="Menu utilisateur" @click="toggleMenu">
      <div class="avatar-wrap">
        <img v-if="auth.state.user.avatarUrl" :src="auth.state.user.avatarUrl" :alt="auth.state.user.displayName" />
        <span v-else>{{ initials }}</span>
      </div>
      <div class="user-meta">
        <strong>{{ auth.state.user.displayName }}</strong>
        <small>{{ auth.state.user.email }}</small>
      </div>
    </button>

    <div v-if="isMenuOpen" class="user-menu" role="menu" aria-label="Menu utilisateur">
      <button type="button" class="user-menu-item" @click="openProfile">
        <span class="menu-item-leading"><font-awesome-icon icon="user" /></span>
        <span>Mon profil</span>
      </button>
      <button type="button" class="user-menu-item danger" @click="logout">
        <span class="menu-item-leading"><font-awesome-icon icon="right-from-bracket" /></span>
        <span>Deconnexion</span>
      </button>
    </div>
  </div>

  <div v-if="isProfileOpen" class="dialogOverlay" @click.self="closeProfile">
    <div class="dialogCard">
      <div class="dialogHeader">
        <h2>Mon profil</h2>
      </div>

      <div class="profileGrid">
        <div class="avatarColumn">
          <div class="profileAvatar">
            <img v-if="auth.state.user?.avatarUrl" :src="auth.state.user.avatarUrl" alt="Avatar utilisateur" />
            <span v-else>{{ initials }}</span>
          </div>
          <div class="avatarActions">
            <input ref="avatarInput" type="file" accept="image/*" class="hiddenInput" @change="onAvatarPicked" />
            <button type="button" :disabled="isAvatarSaving" @click="pickAvatarFile">
              {{ isAvatarSaving ? "Enregistrement..." : "Uploader un avatar" }}
            </button>
            <button type="button" class="secondary" :disabled="isAvatarSaving || !auth.state.user?.avatarUrl" @click="removeAvatar">
              Supprimer l'avatar
            </button>
          </div>
        </div>

        <div class="profileFormWrap">
          <div class="profileForm">
            <label for="profile-email">Email</label>
            <input id="profile-email" type="text" :value="auth.state.user?.email || ''" readonly />

            <label for="profile-name">Nom utilisateur</label>
            <input id="profile-name" v-model="profileDisplayName" type="text" :readonly="oidcEnabled" />

            <fieldset class="themeFieldset">
              <legend>Theme</legend>
              <label class="themeChoice">
                <input v-model="profileThemePreference" type="radio" value="light" />
                <span>Clair</span>
              </label>
              <label class="themeChoice">
                <input v-model="profileThemePreference" type="radio" value="dark" />
                <span>Sombre</span>
              </label>
              <label class="themeChoice">
                <input v-model="profileThemePreference" type="radio" value="system" />
                <span>Système</span>
              </label>
            </fieldset>
          </div>
        </div>
      </div>

      <p v-if="errorText" class="errorText">{{ errorText }}</p>
      <p v-if="successText" class="successText">{{ successText }}</p>

      <div class="dialogFooter">
        <button type="button" class="secondary" :disabled="isAvatarSaving || isProfileSaving" @click="closeProfile">Annuler</button>
        <button type="button" :disabled="isAvatarSaving || isProfileSaving || !hasProfileChanges" @click="saveProfile">
          {{ isProfileSaving ? "Veuillez patienter..." : "Sauvegarder" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-menu-wrap {
  position: relative;
}

.user-panel {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--color-border-muted);
  border-radius: 12px;
  padding: 6px 8px;
  background: var(--color-bg-subtle);
}

.user-panel-button {
  width: auto;
  height: auto;
  cursor: pointer;
}

.user-panel-button:hover {
  background: var(--color-bg-soft);
}

.avatar-wrap {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid var(--color-border-default);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-info-soft);
  color: var(--color-text-accent);
  font: 700 0.72rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.avatar-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-meta {
  display: grid;
  gap: 2px;
  text-align: left;
}

.user-meta strong {
  color: var(--color-text-primary);
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-meta small {
  color: var(--color-text-muted);
  font: 500 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 170px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-accent);
  border-radius: 10px;
  box-shadow: var(--color-shadow-popover);
  padding: 6px;
  display: grid;
  gap: 4px;
  z-index: 50;
}

.user-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  border: 0;
  border-radius: 8px;
  padding: 0 10px;
  text-align: left;
  cursor: pointer;
  background: var(--color-bg-elevated);
  color: var(--color-text-secondary);
  font: 500 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.menu-item-leading {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: var(--color-text-muted);
}

.user-menu-item:hover {
  background: var(--color-bg-soft);
}

.user-menu-item.danger {
  color: var(--color-text-danger-strong);
}

.dialogOverlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 18px;
}

.dialogCard {
  width: min(820px, 100%);
  min-height: 380px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-accent);
  border-radius: 12px;
  padding: 18px;
  display: grid;
  gap: 16px;
  box-shadow: var(--color-shadow-soft);
}

.dialogHeader h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.profileGrid {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 28px;
  align-items: start;
}

.avatarColumn {
  display: grid;
  gap: 14px;
  justify-items: center;
}

.profileAvatar {
  width: 124px;
  height: 124px;
  border-radius: 50%;
  border: 1px solid var(--color-border-default);
  background: var(--color-bg-info-soft);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-weight: 700;
  font-size: 28px;
  overflow: hidden;
}

.profileAvatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatarActions {
  width: 100%;
  display: grid;
  gap: 10px;
}

.avatarActions button {
  width: 100%;
  height: 34px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 0 12px;
  background: var(--color-button-bg);
  color: var(--color-text-primary);
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.avatarActions button:hover {
  background: var(--color-button-hover);
}

.avatarActions button.secondary {
  background: var(--color-button-bg);
}

.avatarActions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.profileForm {
  display: grid;
  gap: 12px;
}

.profileForm label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.profileForm input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
  padding: 6px 8px;
  font: 600 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.profileForm input[readonly] {
  background: var(--color-bg-soft);
  color: var(--color-text-secondary);
}

.themeFieldset {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--color-border-default);
  border-radius: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  background: var(--color-bg-subtle);
}

.themeFieldset legend {
  padding: 0 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}

.themeChoice {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}

.themeChoice input[type="radio"] {
  width: 16px;
  height: 16px;
  margin: 0;
  flex: 0 0 auto;
}

.dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialogFooter button {
  width: auto;
  min-width: 94px;
  height: 34px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  padding: 0 12px;
  background: var(--color-button-bg);
  color: var(--color-text-primary);
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.dialogFooter button.secondary {
  background: var(--color-button-bg);
}

.dialogFooter button:hover {
  background: var(--color-button-hover);
}

.hiddenInput {
  display: none;
}

.errorText {
  margin: 0;
  color: var(--color-text-danger);
}

.successText {
  margin: 0;
  color: var(--color-text-success);
}

@media (max-width: 760px) {
  .profileGrid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .avatarColumn {
    justify-items: stretch;
  }

  .profileAvatar {
    justify-self: center;
  }
}
</style>

