<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ApiError, useAuthStore } from "../stores/useAuthStore";

const auth = useAuthStore();
const router = useRouter();
const message = ref("Connexion en cours...");

function mapApiError(error: unknown) {
  if (error instanceof ApiError) {
    if (typeof error.data === "object" && error.data && "error" in error.data) {
      return String((error.data as { error: unknown }).error);
    }
    return `Erreur API (${error.status})`;
  }
  return "Une erreur est survenue.";
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code") || "";
  const state = params.get("state") || "";
  if (!code || !state) {
    message.value = "Paramètres callback invalides.";
    return;
  }

  const redirectUri = `${window.location.origin}/auth/callback`;
  const redirectTarget = sessionStorage.getItem(`oidc.redirect.${state}`) || "/dashboard";
  sessionStorage.removeItem(`oidc.redirect.${state}`);

  try {
    await auth.exchangeOidcCode({ code, redirectUri });
    await router.replace(redirectTarget);
  } catch (error) {
    message.value = mapApiError(error);
  }
});
</script>

<template>
  <main class="callback-page">
    <section class="callback-card">{{ message }}</section>
  </main>
</template>

<style scoped>
.callback-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  background: #f8fafc;
}
.callback-card {
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  color: #334155;
  padding: 16px;
  font: 600 0.92rem/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
</style>
