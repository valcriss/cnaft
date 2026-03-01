# Backend

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

## Prisma

```bash
npm run prisma:migrate
npm run prisma:generate
```

## API (MVP)

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/providers`
- `POST /auth/oidc/authorize-url` (mode OIDC)
- `POST /auth/oidc/exchange` (mode OIDC)
- `GET /auth/me`
- `GET /documents`
- `POST /documents`
- `GET /documents/:id`
- `PATCH /documents/:id`
- `DELETE /documents/:id`
- `POST /documents/:id/share-links`
- `POST /documents/join-by-share-token`

## OIDC mode (Keycloak)

Set in `.env`:

- `AUTH_PROVIDER=oidc`
- `OIDC_ISSUER=https://<keycloak>/realms/<realm>`
- `OIDC_CLIENT_ID=<client-id>`
- `OIDC_CLIENT_SECRET=<client-secret>`

Then use:

1. `POST /auth/oidc/authorize-url` to get redirect URL
2. redirect user to Keycloak
3. receive `code`
4. `POST /auth/oidc/exchange` with `{ code, redirectUri, codeVerifier? }`
