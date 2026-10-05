# N0MD3L4PP

A full-stack TypeScript template: **Expo (React Native)** mobile app + **Fastify** API on **Bun**, with **MongoDB**, monorepo workspaces via Bun, shared Zod contracts, JWT auth (access + refresh), migrations, seeding, Docker, and CI/CD workflows.

> **Important:** this is a template. The very first thing to do after cloning is to rebrand it with your app name (see below).

## 🚀 Initialize your app (required first step)

Rebrand the whole template with your application name in one command:

```sh
bun install
bun run init-app "My New App"
```

This script:

- Replaces the template placeholder tokens everywhere in the codebase (`n0md3l4pP` → display name, `n0md3l4pp` → slug, `N0MD3L4PP` → screaming snake case)
- Derives the slug, PascalCase and SCREAMING_SNAKE versions of your name automatically (accents are stripped)
- Resets this `README.md` with your app name

Run it **once**, right after cloning, before writing any code. Example:

```sh
bun run init-app "Mon Super Projet"
# → Mon Super Projet / mon-super-projet / MON_SUPER_PROJET
```

**Ou ne lance rien du tout** : si le repo est créé dans l'organisation, le workflow **`Init Repo`** se déclenche automatiquement au premier push — il rebrand le template avec le nom du repo, crée le projet + cluster MongoDB Atlas (Paris), génère les secrets JWT, les pousse dans Infisical, crée la branche `develop` et ouvre une PR d'initialisation à valider. Relançable à la main avec un nom spécifique via l'onglet Actions → **Run workflow**.

## ⚠️ Pour avoir l'app sur mobile (EAS builds)

Tant que les étapes ci-dessous ne sont pas faites, les workflows de build mobile se terminent en *skipped* (pas en échec) — le reste (web, API, staging, prod) fonctionne sans.

1. **Crée le projet Expo** : [expo.dev](https://expo.dev) → Projects → **Create project**, copie l'**ID** affiché

   ```sh
   cd apps/mobile
   bunx eas login
   bunx eas init --id <ID_AFFICHÉ>   # ajoute extra.eas.projectId dans app.config.ts → committe-le
   ```

Ensuite, les builds APK Android sont automatiques :

| Événement | Profil EAS | App produite |
|---|---|---|
| PR vers develop (label `mobile`) | `pr` | `n0md3l4pP pr-N`, API de la PR — installable à côté des autres |
| push sur `develop` | `preview` | `n0md3l4pP staging`, API staging |
| push sur `main` | `production-apk` | `n0md3l4pP`, API prod |

Les variantes coexistent sur le même téléphone (packages Android différents : `.prN`, `.staging`, standard).

## 📡 Uptime Kuma (monitoring + keep-alive Atlas)

Après le premier déploiement, ajoute 4 sondes HTTP dans Uptime Kuma — elles surveillent **et** gardent les bases Atlas actives (le `/health` ping la base à chaque requête) :

| Nom | URL |
|---|---|
| `n0md3l4pP - prod API` | `https://n0md3l4pp-api.sleipnir.ovh/health` |
| `n0md3l4pP - prod front` | `https://n0md3l4pp.sleipnir.ovh` |
| `n0md3l4pP - staging API` | `https://staging.api.n0md3l4pp.staging.sleipnir.ovh/health` |
| `n0md3l4pP - staging front` | `https://staging.n0md3l4pp.staging.sleipnir.ovh` |

> Les previews `pr-N` ne valent pas la peine d'être sondées : elles vivent le temps de la PR.

## Repo structure

```
apps/
  api/      Fastify API (Bun runtime, MongoDB, JWT auth, Swagger, migrations, seeds)
  mobile/   Expo app (expo-router, React Query, react-hook-form, expo-secure-store)
packages/
  contracts/  Shared Zod schemas & types between API and mobile
scripts/
  init-app.ts  Template rebranding script
```

## Getting started

1. **Install dependencies**

   ```sh
   bun install
   bun run init-app "My New App"   # rebrand the template
   ```

2. **Start the database**

   ```sh
   bun run db:up        # MongoDB via docker compose
   ```

3. **Configure environment files**
   - `apps/api/.env` — `MONGO_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, …
   - `apps/mobile/.env` — `EXPO_PUBLIC_API_URL` (use your LAN IP for a real device, `http://localhost:3000` for web/emulator)

4. **Run migrations & seed**

   ```sh
   bun run db:migrate
   bun run db:seed
   ```

5. **Start dev servers**

   ```sh
   bun run dev:api            # Fastify API on http://localhost:3000
   bun run dev:front:web      # Expo web
   bun run dev:front:android  # Expo Android
   bun run dev:front:ios      # Expo iOS
   ```

## Common scripts

| Command | Description |
| --- | --- |
| `bun run lint` | Lint all workspaces |
| `bun run typecheck` | Typecheck all workspaces |
| `bun run test` | Run tests (`bun test` under the hood) |
| `bun run build` | Build all workspaces |
| `bun run db:up` / `db:down` | Start / stop MongoDB (docker compose) |
| `bun run db:migrate` | Run DB migrations |
| `bun run db:migrate:create` | Create a new migration |
| `bun run db:seed` | Seed the dev database |

## Tech stack

- **Runtime & tooling**: [Bun](https://bun.sh) (runtime, package manager, test runner, bundler), TypeScript, ESLint + Prettier, Lefthook git hooks
- **API**: Fastify 5, MongoDB driver, Zod validation, `@fastify/jwt` (access + refresh cookies), rate limit, Swagger UI
- **Mobile**: Expo 57, expo-router, React Query, react-hook-form + Zod, expo-secure-store
- **Infra**: Docker Compose, GitHub Actions CI/CD