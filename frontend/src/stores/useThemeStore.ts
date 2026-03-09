import { computed, reactive } from "vue";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeState = {
  initialized: boolean;
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
};

const STORAGE_KEY = "cnaft.theme.v1";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const state = reactive<ThemeState>({
  initialized: false,
  preference: "system",
  resolvedTheme: "light",
});

let mediaQueryList: MediaQueryList | null = null;
let mediaQueryBound = false;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemPreference() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as ResolvedTheme;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemPreference() : preference;
}

function applyResolvedTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function persistPreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ignore storage failures
  }
}

function readStoredPreference() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function updateResolvedTheme() {
  state.resolvedTheme = resolveTheme(state.preference);
  applyResolvedTheme(state.resolvedTheme);
}

function bindSystemPreferenceListener() {
  if (mediaQueryBound || typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return;
  }

  mediaQueryList = window.matchMedia(DARK_MEDIA_QUERY);
  const onChange = () => {
    if (state.preference !== "system") return;
    updateResolvedTheme();
  };
  mediaQueryList.addEventListener("change", onChange);
  mediaQueryBound = true;
}

function init() {
  if (state.initialized) return;
  state.initialized = true;
  bindSystemPreferenceListener();
  state.preference = readStoredPreference() ?? "system";
  updateResolvedTheme();
}

function setPreference(preference: ThemePreference, options?: { persist?: boolean }) {
  if (!state.initialized) {
    init();
  }
  state.preference = preference;
  updateResolvedTheme();
  if (options?.persist !== false) {
    persistPreference(preference);
  }
}

export function useThemeStore() {
  return {
    state,
    init,
    setPreference,
    isDark: computed(() => state.resolvedTheme === "dark"),
  };
}
