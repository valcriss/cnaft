import { computed, reactive } from "vue";

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

type AuthState = {
  initialized: boolean;
  user: AuthUser | null;
  accessToken: string;
  refreshToken: string;
};

type AuthProviderInfo = {
  provider: "local" | "oidc";
  local: boolean;
  oidc: boolean;
};

const STORAGE_KEY = "cnaft.auth.v1";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";

const state = reactive<AuthState>({
  initialized: false,
  user: null,
  accessToken: "",
  refreshToken: "",
});

let refreshPromise: Promise<boolean> | null = null;

class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(typeof data === "object" && data && "error" in data ? String((data as { error: unknown }).error) : "API error");
    this.status = status;
    this.data = data;
  }
}

function parseStoredSession(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      user: parsed.user && typeof parsed.user === "object" ? (parsed.user as AuthUser) : null,
    };
  } catch {
    return null;
  }
}

function persist() {
  if (!state.accessToken || !state.refreshToken) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      user: state.user,
    }),
  );
}

function setSession(input: { accessToken: string; refreshToken: string; user: AuthUser }) {
  state.accessToken = input.accessToken;
  state.refreshToken = input.refreshToken;
  state.user = input.user;
  persist();
}

function clearSession() {
  state.accessToken = "";
  state.refreshToken = "";
  state.user = null;
  persist();
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function refreshAccessToken() {
  if (!state.refreshToken) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
      if (!response.ok) {
        clearSession();
        return false;
      }
      const data = (await response.json()) as { accessToken?: string };
      if (!data.accessToken) {
        clearSession();
        return false;
      }
      state.accessToken = data.accessToken;
      persist();
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function apiRequest<T>(path: string, options?: { method?: string; body?: unknown; auth?: boolean; retryOn401?: boolean }) {
  const method = options?.method ?? "GET";
  const needsAuth = options?.auth ?? false;
  const retryOn401 = options?.retryOn401 ?? true;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (needsAuth && state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: typeof options?.body === "undefined" ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && needsAuth && retryOn401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, retryOn401: false });
    }
    clearSession();
  }

  const data = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(response.status, data);
  }
  return data as T;
}

async function fetchMe() {
  const data = await apiRequest<{ user: AuthUser }>("/auth/me", { auth: true });
  state.user = data.user;
  persist();
  return data.user;
}

async function ensureAuthenticated() {
  if (!state.accessToken || !state.refreshToken) return false;
  if (state.user) return true;
  try {
    await fetchMe();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

async function init() {
  if (state.initialized) return;
  const stored = parseStoredSession(localStorage.getItem(STORAGE_KEY));
  if (stored) {
    state.accessToken = stored.accessToken;
    state.refreshToken = stored.refreshToken;
    state.user = stored.user;
  }
  state.initialized = true;
}

async function loginLocal(email: string, password: string) {
  const data = await apiRequest<{
    user: AuthUser;
    tokens: { accessToken: string; refreshToken: string };
  }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setSession({
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    user: data.user,
  });
  return data.user;
}

async function registerLocal(input: { email: string; password: string; displayName: string }) {
  const data = await apiRequest<{
    user: AuthUser;
    tokens: { accessToken: string; refreshToken: string };
  }>("/auth/register", {
    method: "POST",
    body: input,
  });
  setSession({
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    user: data.user,
  });
  return data.user;
}

async function getProviders() {
  return apiRequest<AuthProviderInfo>("/auth/providers");
}

async function buildOidcAuthorizeUrl(input: { redirectUri: string; state: string; codeChallenge?: string }) {
  const data = await apiRequest<{ authorizeUrl: string }>("/auth/oidc/authorize-url", {
    method: "POST",
    body: input,
  });
  return data.authorizeUrl;
}

async function exchangeOidcCode(input: { code: string; redirectUri: string; codeVerifier?: string }) {
  const data = await apiRequest<{
    user: AuthUser;
    tokens: { accessToken: string; refreshToken: string };
  }>("/auth/oidc/exchange", {
    method: "POST",
    body: input,
  });
  setSession({
    accessToken: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    user: data.user,
  });
  return data.user;
}

export function useAuthStore() {
  const accessTokenExpiresAt = computed(() => {
    if (!state.accessToken) return null;
    const payload = decodeJwtPayload(state.accessToken);
    if (!payload?.exp) return null;
    return payload.exp * 1000;
  });
  const accessTokenRemainingSec = computed(() => {
    if (!accessTokenExpiresAt.value) return null;
    return Math.max(0, Math.floor((accessTokenExpiresAt.value - Date.now()) / 1000));
  });

  return {
    state,
    isAuthenticated: computed(() => Boolean(state.accessToken && state.refreshToken)),
    accessTokenExpiresAt,
    accessTokenRemainingSec,
    init,
    ensureAuthenticated,
    fetchMe,
    loginLocal,
    registerLocal,
    getProviders,
    buildOidcAuthorizeUrl,
    exchangeOidcCode,
    logout: clearSession,
    apiRequest,
  };
}

export { ApiError };
