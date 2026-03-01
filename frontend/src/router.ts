import { createRouter, createWebHistory } from "vue-router";
import type { LocationQuery } from "vue-router";
import { useAuthStore } from "./stores/useAuthStore";

const authStore = useAuthStore();

function hasMockBypassQuery(query: LocationQuery) {
  if (!import.meta.env.DEV) return false;
  const collab = query.collab;
  const username = query.username;
  return collab === "mock" && typeof username === "string" && username.trim().length > 0;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "root",
      redirect: (to) => {
        if (hasMockBypassQuery(to.query)) {
          return { name: "workspace", query: to.query };
        }
        return { name: "dashboard" };
      },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("./views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/auth/callback",
      name: "oidc-callback",
      component: () => import("./views/OidcCallbackView.vue"),
      meta: { public: true },
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("./views/DashboardView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/workspace",
      name: "workspace",
      component: () => import("./views/WorkspaceView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/documents/:id",
      name: "document-workspace",
      component: () => import("./views/WorkspaceView.vue"),
      meta: { requiresAuth: true },
    },
  ],
});

router.beforeEach(async (to) => {
  await authStore.init();

  if (to.meta.public) {
    if (to.name === "login") {
      const isLogged = await authStore.ensureAuthenticated();
      if (isLogged) {
        const redirect = typeof to.query.redirect === "string" ? to.query.redirect : "/dashboard";
        return redirect;
      }
    }
    return true;
  }

  if (!to.meta.requiresAuth) return true;
  if (hasMockBypassQuery(to.query)) return true;

  const isLogged = await authStore.ensureAuthenticated();
  if (isLogged) return true;
  return {
    name: "login",
    query: {
      redirect: to.fullPath,
    },
  };
});

export default router;
