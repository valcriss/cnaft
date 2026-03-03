# Configuration Keycloak (OpenID Connect) pour ce projet

Ce guide explique pas à pas comment activer l’authentification OpenID Connect (OIDC) avec Keycloak pour ce projet `cnaft`.

## 1) Prérequis

- Keycloak accessible (local ou distant)
- Le backend `cnaft` joignable (en dev: `http://localhost:4000`)
- Le frontend `cnaft` joignable (en dev: `http://localhost:5173`)

## 2) Comprendre les URLs utilisées par l’application

Dans ce projet:

- Callback frontend OIDC: `http://localhost:5173/auth/callback`
- API backend: `http://localhost:4000/api`
- Endpoint de démarrage du login OIDC: `POST /api/auth/oidc/authorize-url`
- Endpoint d’échange code -> tokens applicatifs: `POST /api/auth/oidc/exchange`

Important: le backend exige que `AUTH_PROVIDER=oidc` et que ces variables soient renseignées:

- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`

Options OIDC supplémentaires:

- `OIDC_TRANSPARENT_LOGIN=true` (par défaut): la page `/login` lance automatiquement le SSO si `AUTH_PROVIDER=oidc`
- `OIDC_CA_CERT_PATH=/chemin/ca.pem`: certificat (ou bundle CA) de confiance pour les appels OIDC sortants
- `OIDC_TLS_INSECURE=true`: désactive la vérification TLS pour les appels OIDC sortants (à réserver au debug)

## 3) Créer un Realm et un utilisateur dans Keycloak

1. Ouvre l’admin Keycloak.
2. Crée un realm (ex: `cnaft`).
3. Crée un utilisateur de test dans ce realm.
4. Définis un mot de passe pour cet utilisateur (et désactive l’action “update password” forcée si besoin).

## 4) Créer le client OIDC dans Keycloak

Dans le realm `cnaft`:

1. Va dans **Clients** -> **Create client**.
2. `Client ID`: par exemple `cnaft-web`.
3. `Client type`: **OpenID Connect**.
4. Active le flow standard (Authorization Code).
5. Sauvegarde.

Ensuite dans la configuration du client:

- **Access type / Client authentication**: activé (client confidentiel) pour générer un secret.
- **Valid redirect URIs**:
  - `http://localhost:5173/auth/callback`
  - (optionnel Docker frontend) `http://localhost/auth/callback`
- **Web origins**:
  - `http://localhost:5173`
  - (optionnel) `http://localhost`

Puis récupère le secret:

1. Onglet **Credentials**.
2. Copie la valeur **Client secret**.

## 5) Construire la valeur `OIDC_ISSUER`

Format attendu:

`https://<host-keycloak>/realms/<realm>`

Exemples:

- Keycloak local: `http://localhost:8081/realms/cnaft`
- Keycloak distant: `https://sso.exemple.com/realms/cnaft`

Le backend consommera automatiquement:

`<OIDC_ISSUER>/.well-known/openid-configuration`

## 6) Configurer le backend en mode OIDC

Édite `backend/.env`:

```env
AUTH_PROVIDER="oidc"
OIDC_ISSUER="http://localhost:8081/realms/cnaft"
OIDC_CLIENT_ID="cnaft-web"
OIDC_CLIENT_SECRET="<secret-copie-de-keycloak>"
OIDC_TRANSPARENT_LOGIN="true"
OIDC_CA_CERT_PATH=""
OIDC_TLS_INSECURE="false"
```

Puis redémarre le backend.

## 7) Démarrer l’application en local (Node)

Depuis la racine du repo:

1. Base de données:
   - `docker compose -f docker-compose.dev.yml up -d`
2. Backend:
   - `cd backend`
   - `npm install`
   - `npm run prisma:migrate -- --name init` (si première exécution)
   - `npm run prisma:generate`
   - `npm run dev`
3. Frontend (nouveau terminal):
   - `cd frontend`
   - `npm install`
   - `npm run dev`

## 8) Variante Docker (images split)

Si tu utilises `docker-compose.yml`, change les variables du service `backend`:

```yaml
AUTH_PROVIDER: oidc
OIDC_ISSUER: 'http://<host-keycloak>/realms/cnaft'
OIDC_CLIENT_ID: 'cnaft-web'
OIDC_CLIENT_SECRET: '<secret>'
OIDC_TRANSPARENT_LOGIN: 'true'
OIDC_CA_CERT_PATH: ''
OIDC_TLS_INSECURE: 'false'
```

Puis relance:

- `docker compose up -d`

Note: si Keycloak tourne sur la machine hôte, adapte l’URL pour qu’elle soit résolue depuis le conteneur backend (ex: hostname réseau adapté à ton environnement).

## 9) Variante Docker (image full)

Si tu utilises `docker-compose.full.yml` (service `full`), configure les variables OIDC dans ce service:

```yaml
AUTH_PROVIDER: oidc
OIDC_ISSUER: 'http://<host-keycloak>/realms/cnaft'
OIDC_CLIENT_ID: 'cnaft-web'
OIDC_CLIENT_SECRET: '<secret>'
OIDC_TRANSPARENT_LOGIN: 'true'
OIDC_CA_CERT_PATH: ''
OIDC_TLS_INSECURE: 'false'
FRONTEND_DIST_DIR: /app/public
```

Ensuite démarre en mode full:

- `docker compose --profile full up -d full postgres`

Dans ce mode, l’application est servie sur `http://localhost:8089`.

Paramètres Keycloak à prévoir pour ce mode:

- **Valid redirect URIs**:
  - `http://localhost:8089/auth/callback`
- **Web origins**:
  - `http://localhost:8089`

Note réseau: `OIDC_ISSUER` doit être atteignable **depuis le conteneur** `full`. Si Keycloak tourne sur la machine hôte, utilise un hostname adapté à Docker Desktop (par ex. `host.docker.internal`) selon ton environnement.

## 10) Vérifier que la configuration est correcte

1. Vérifie le provider actif:
   - `GET http://localhost:4000/api/auth/providers`
   - attendu: `{"provider":"oidc", ...}`
2. Ouvre le frontend: `http://localhost:5173/login`
3. Clique sur “Se connecter avec le fournisseur OpenID”.
4. Tu dois être redirigé vers Keycloak.
5. Après login Keycloak, retour sur `/auth/callback`, puis redirection vers le dashboard.

## 11) Dépannage rapide

### Erreur `OIDC discovery failed`

- Vérifie `OIDC_ISSUER` (realm correct, URL atteignable)
- Teste dans le navigateur:
  - `http://<keycloak>/realms/<realm>/.well-known/openid-configuration`
- Si ton Keycloak utilise une CA interne, renseigne `OIDC_CA_CERT_PATH`
- En dernier recours de debug, active `OIDC_TLS_INSECURE=true`

### Erreur `OIDC exchange failed`

- Vérifie le `client secret`
- Vérifie que la Redirect URI dans Keycloak contient exactement:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:8089/auth/callback` (mode image full)

### Erreur `OIDC authentication disabled`

- Vérifie `AUTH_PROVIDER=oidc`
- Redémarre le backend après modification de `.env`

### Boucle de redirection / callback invalide

- Vérifie que l’URL frontend est bien `http://localhost:5173`
- En mode image full, vérifie l’URL `http://localhost:8089`
- Vérifie que le callback est exactement `/auth/callback`
- Vérifie que l’horloge machine n’est pas fortement décalée

---

Si tu veux, je peux aussi te générer une version avec un exemple complet de stack Keycloak en Docker (realm import + client préconfiguré) pour lancer tout en local en une commande.