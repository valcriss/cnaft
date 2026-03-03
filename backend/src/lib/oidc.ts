import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";

type OidcMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

let metadataCache: OidcMetadata | null = null;
let oidcCaBundleCache: string | undefined;
let oidcCaBundleLoaded = false;

type OidcRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
};

function normalizeIssuer(issuer: string) {
  return issuer.endsWith("/") ? issuer.slice(0, -1) : issuer;
}

function getOidcCaBundle() {
  if (oidcCaBundleLoaded) return oidcCaBundleCache;
  oidcCaBundleLoaded = true;
  const certPath = config.OIDC_CA_CERT_PATH?.trim();
  if (!certPath) {
    oidcCaBundleCache = undefined;
    return oidcCaBundleCache;
  }
  const resolvedPath = path.resolve(certPath);
  try {
    oidcCaBundleCache = fs.readFileSync(resolvedPath, "utf8");
    return oidcCaBundleCache;
  } catch (error) {
    throw new Error(`Unable to read OIDC_CA_CERT_PATH at ${resolvedPath}: ${String(error)}`);
  }
}

async function fetchJson<T>(url: string, init?: OidcRequestInit) {
  const targetUrl = new URL(url);
  const isHttps = targetUrl.protocol === "https:";
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = init?.headers ? { ...init.headers } : {};

  const bodyRaw = init?.body;
  const body = bodyRaw instanceof URLSearchParams ? bodyRaw.toString() : bodyRaw;
  if (bodyRaw instanceof URLSearchParams && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (body && !headers["Content-Length"] && !headers["content-length"]) {
    headers["Content-Length"] = String(Buffer.byteLength(body));
  }

  const requestOptions: https.RequestOptions = {
    method,
    headers,
  };

  if (isHttps) {
    requestOptions.rejectUnauthorized = !config.OIDC_TLS_INSECURE;
    const caBundle = getOidcCaBundle();
    if (caBundle) requestOptions.ca = caBundle;
  }

  const client = isHttps ? https : http;
  const response = await new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = client.request(targetUrl, requestOptions, (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      incoming.on("end", () => {
        resolve({
          statusCode: incoming.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      incoming.on("error", reject);
    });

    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`OIDC request failed (${response.statusCode}) ${url}: ${response.body}`);
  }

  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error(`OIDC request returned invalid JSON ${url}: ${response.body}`);
  }
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
