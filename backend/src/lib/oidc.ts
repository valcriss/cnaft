import { config } from "../config.js";

type OidcMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

let metadataCache: OidcMetadata | null = null;

function normalizeIssuer(issuer: string) {
  return issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
}

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OIDC request failed (${response.status}) ${url}: ${text}`);
  }
  return (await response.json()) as T;
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function ensureOidcConfigured() {
  if (config.AUTH_PROVIDER !== "oidc") {
    throw new Error("OIDC provider disabled");
  }
  if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID || !config.OIDC_CLIENT_SECRET) {
    throw new Error("OIDC configuration missing");
  }
}

export async function getOidcMetadata() {
  ensureOidcConfigured();
  if (metadataCache) return metadataCache;
  const issuer = normalizeIssuer(config.OIDC_ISSUER);
  metadataCache = await fetchJson<OidcMetadata>(`${issuer}/.well-known/openid-configuration`);
  return metadataCache;
}

export async function buildAuthorizeUrl(input: {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}) {
  const metadata = await getOidcMetadata();
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("client_id", config.OIDC_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}) {
  const metadata = await getOidcMetadata();
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("redirect_uri", input.redirectUri);
  body.set("client_id", config.OIDC_CLIENT_ID);
  body.set("client_secret", config.OIDC_CLIENT_SECRET);
  if (input.codeVerifier) {
    body.set("code_verifier", input.codeVerifier);
  }
  return fetchJson<{
    access_token: string;
    id_token?: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
  }>(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

export async function loadOidcUserProfile(tokens: { access_token: string; id_token?: string }) {
  const metadata = await getOidcMetadata();
  if (metadata.userinfo_endpoint) {
    const profile = await fetchJson<Record<string, unknown>>(metadata.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    return profile;
  }
  if (tokens.id_token) {
    const decoded = decodeJwtPayload(tokens.id_token);
    if (decoded) return decoded;
  }
  throw new Error("Unable to retrieve OIDC user profile");
}
