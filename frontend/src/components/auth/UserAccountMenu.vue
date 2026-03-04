<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/useAuthStore";

const auth = useAuthStore();
const router = useRouter();
const menuWrapRef = ref<HTMLElement | null>(null);
const avatarInput = ref<HTMLInputElement | null>(null);
const isMenuOpen = ref(false);
const isProfileOpen = ref(false);
const isAvatarSaving = ref(false);
const isProfileSaving = ref(false);
const profileDisplayName = ref("");
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
    window.clearTimeout(successMessageTimerId);
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
    window.clearTimeout(successMessageTimerId);
  }
  successMessageTimerId = window.setTimeout(() => {
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
    user: { id: string; email: string; displayName: string; avatarUrl: string | null };
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
  if (oidcEnabled.value) return;
  const nextDisplayName = profileDisplayName.value.trim();
  if (!nextDisplayName) {
    errorText.value = "Le nom utilisateur est requis.";
    return;
  }
  if (nextDisplayName === (auth.state.user?.displayName || "")) {
    closeProfile();
    return;
  }

  errorText.value = "";
  successText.value = "";
  isProfileSaving.value = true;
  try {
    const data = await auth.apiRequest<{
      user: { id: string; email: string; displayName: string; avatarUrl: string | null };
    }>("/auth/me", {
      method: "PATCH",
      auth: true,
      body: { displayName: nextDisplayName },
    });
    auth.setUser(data.user);
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
  window.addEventListener("click", onWindowClick);
});

onUnmounted(() => {
  window.removeEventListener("click", onWindowClick);
  if (successMessageTimerId !== null) {
    window.clearTimeout(successMessageTimerId);
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
          </div>
        </div>
      </div>

      <p v-if="errorText" class="errorText">{{ errorText }}</p>
      <p v-if="successText" class="successText">{{ successText }}</p>

      <div class="dialogFooter">
        <button type="button" class="secondary" :disabled="isAvatarSaving || isProfileSaving" @click="closeProfile">Annuler</button>
        <button type="button" :disabled="isAvatarSaving || isProfileSaving || oidcEnabled" @click="saveProfile">
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
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 6px 8px;
  background: #f8fafc;
}

.user-panel-button {
  width: auto;
  height: auto;
  cursor: pointer;
}

.user-panel-button:hover {
  background: #f1f5f9;
}

.avatar-wrap {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eff6ff;
  color: #1e3a8a;
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
  color: #0f172a;
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-meta small {
  color: #64748b;
  font: 500 0.68rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.user-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  min-width: 170px;
  background: #ffffff;
  border: 1px solid #d5e2ef;
  border-radius: 10px;
  box-shadow: 0 10px 24px rgba(18, 37, 58, 0.16);
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
  background: #ffffff;
  color: #1a3652;
  font: 500 0.78rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.menu-item-leading {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: #64748b;
}

.user-menu-item:hover {
  background: #f3f8ff;
}

.user-menu-item.danger {
  color: #7d1f1f;
}

.dialogOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 33, 52, 0.44);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 18px;
}

.dialogCard {
  width: min(820px, 100%);
  min-height: 380px;
  background: #ffffff;
  border: 1px solid #cfe0f0;
  border-radius: 12px;
  padding: 18px;
  display: grid;
  gap: 16px;
}

.dialogHeader h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
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
  border: 1px solid #bed0e3;
  background: #ebf3fd;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #204767;
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
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 0 12px;
  background: #ffffff;
  color: #0f172a;
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.avatarActions button:hover {
  background: #eef2f6;
}

.avatarActions button.secondary {
  background: #f8fafc;
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
  color: #38546f;
}

.profileForm input {
  box-sizing: border-box;
  width: 100%;
  height: 36px;
  border: 1px solid #d0d7de;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  padding: 6px 8px;
  font: 600 0.8rem/1.2 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
}

.profileForm input[readonly] {
  background: #f5f9fd;
  color: #3f5870;
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
  border: 1px solid #d0d7de;
  border-radius: 8px;
  padding: 0 12px;
  background: #ffffff;
  color: #0f172a;
  font: 600 0.76rem/1 "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}

.dialogFooter button.secondary {
  background: #f8fafc;
}

.dialogFooter button:hover {
  background: #eef2f6;
}

.hiddenInput {
  display: none;
}

.errorText {
  margin: 0;
  color: #9f2525;
}

.successText {
  margin: 0;
  color: #216c3f;
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

