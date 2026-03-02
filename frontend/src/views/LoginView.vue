<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ApiError, useAuthStore } from "../stores/useAuthStore";
import { randomUUID } from "../utils/uuid";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const mode = ref<"login" | "register">("login");
const loading = ref(false);
const errorMessage = ref("");
const provider = ref<"local" | "oidc">("local");

const formEmail = ref("");
const formPassword = ref("");
const formDisplayName = ref("");

const redirectTarget = computed(() => {
  const redirect = route.query.redirect;
  if (typeof redirect === "string" && redirect.startsWith("/")) return redirect;
  return "/dashboard";
});

async function loadProviders() {
  try {
    const result = await auth.getProviders();
    provider.value = result.provider;
  } catch {
    provider.value = "local";
  }
}
loadProviders();

function mapApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.data === "object" && error.data && "error" in error.data) {
      return String((error.data as { error: unknown }).error);
    }
    return `Erreur API (${error.status})`;
  }
  return "Une erreur est survenue.";
}

async function submitLocal() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (mode.value === "login") {
      await auth.loginLocal(formEmail.value, formPassword.value);
    } else {
      await auth.registerLocal({
        email: formEmail.value,
        password: formPassword.value,
        displayName: formDisplayName.value,
      });
    }
    await router.replace(redirectTarget.value);
  } catch (error) {
    errorMessage.value = mapApiError(error);
  } finally {
    loading.value = false;
  }
}

function randomState() {
  return randomUUID().replace(/-/g, "");
}

async function startOidcLogin() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const state = randomState();
    const redirectUri = `${window.location.origin}/auth/callback`;
    sessionStorage.setItem(`oidc.redirect.${state}`, redirectTarget.value);
    const authorizeUrl = await auth.buildOidcAuthorizeUrl({
      redirectUri,
      state,
    });
    window.location.assign(authorizeUrl);
  } catch (error) {
    errorMessage.value = mapApiError(error);
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <h1>Connexion</h1>
      <p class="sub">Accede a tes documents collaboratifs.</p>

      <template v-if="provider === 'oidc'">
        <button class="primary-btn" :disabled="loading" @click="startOidcLogin">
          Se connecter avec le fournisseur OpenID
        </button>
      </template>

      <template v-else>
        <div class="switch">
          <button :class="{ active: mode === 'login' }" @click="mode = 'login'">Login</button>
          <button :class="{ active: mode === 'register' }" @click="mode = 'register'">Inscription</button>
        </div>

        <form class="form" @submit.prevent="submitLocal">
          <label v-if="mode === 'register'">
            <span>Nom affiche</span>
            <input v-model="formDisplayName" type="text" minlength="2" maxlength="80" required />
          </label>
          <label>
            <span>Email</span>
            <input v-model="formEmail" type="email" required />
          </label>
          <label>
            <span>Mot de passe</span>
            <input v-model="formPassword" type="password" minlength="8" required />
          </label>
          <button class="primary-btn" type="submit" :disabled="loading">
            {{ mode === "login" ? "Se connecter" : "Creer un compte" }}
          </button>
        </form>
      </template>

      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 20% 20%, #e0f2fe 0%, #f8fafc 40%, #eef2ff 100%);
  padding: 20px;
  box-sizing: border-box;
}
.login-card {
  width: min(420px, 100%);
  border: 1px solid #d1d5db;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 22px 44px rgba(2, 6, 23, 0.08);
  padding: 20px;
  display: grid;
  gap: 12px;
}
h1 {
  margin: 0;
  color: #0f172a;
  font: 700 1.3rem/1.2 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.sub {
  margin: 0;
  color: #475569;
  font: 500 0.9rem/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.switch button {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #f8fafc;
  height: 34px;
  cursor: pointer;
}
.switch button.active {
  border-color: #2563eb;
  background: #dbeafe;
}
.form {
  display: grid;
  gap: 10px;
}
label {
  display: grid;
  gap: 4px;
}
label span {
  color: #475569;
  font: 600 0.75rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
}
input {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  height: 36px;
  padding: 0 10px;
}
.primary-btn {
  border: 1px solid #1d4ed8;
  border-radius: 10px;
  background: #2563eb;
  color: #ffffff;
  height: 38px;
  font: 600 0.86rem/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  cursor: pointer;
}
.primary-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  margin: 0;
  color: #b91c1c;
  font: 600 0.8rem/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
}
</style>
