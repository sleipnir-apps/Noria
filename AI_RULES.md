# AI Development Rules

This document outlines the technology stack, architecture, and coding standards for this monorepo (Expo mobile app + Fastify API on Bun, with MongoDB). Adhering to these rules will maintain consistency and ensure the AI assistant can effectively understand and modify the codebase.

> **Scope**: these rules are about **writing code in this repo**. Template-specific concerns (initialization, rebranding, secrets provisioning, CI/CD workflows) are handled by humans and the `Init Repo` GitHub workflow — ignore them unless explicitly asked.

## Commands

- Install Command: `bun install`
- Start Command: `bun run start`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Tests: `bun run test`

## Tech Stack Overview

*   **Runtime & Tooling**: [Bun](https://bun.sh) — runtime, package manager, test runner, and bundler. **Never** introduce Node-only tools.
*   **Language**: TypeScript (strict, no `any` where avoidable).
*   **API**: Fastify 5 running on Bun, MongoDB via the native `mongodb` driver.
*   **Validation**: Zod 4 everywhere (API routes, env vars, forms, shared contracts).
*   **Mobile**: Expo 57 (SDK), React Native, expo-router (file-system routing), React Query v5, react-hook-form + `@hookform/resolvers`.
*   **Auth**: JWT access token + refresh token in HTTP-only cookies (`@fastify/jwt`, `@fastify/cookie`), tokens stored with `expo-secure-store` on mobile.
*   **Monorepo**: Bun workspaces (`apps/*`, `packages/*`), shared types in `packages/contracts` (`@template/contracts`).
*   **Quality**: ESLint + Prettier (via `eslint-plugin-prettier`), Lefthook git hooks, Conventional Commits.

## Golden Rules (Non-Negotiable)

1.  **Always use Bun.** `bun run <script>`, `bun install`, `bun run test`, `bun build`. Never use npm, yarn, pnpm, npx, node, jest, vitest, webpack, or esbuild. Bun auto-loads `.env` — never use dotenv.
2.  **Contracts-first.** Any data shape shared between the API and the mobile app MUST be defined once in `packages/contracts` (Zod schema + inferred DTO type) and imported by both sides. Never duplicate a type in `apps/api` and `apps/mobile`.
3.  **Verify before committing.** Lefthook runs `bun typecheck` and `bun lint` on every `pre-commit`, and validates Conventional Commits on `commit-msg`. **Never bypass these hooks** (`--no-verify` is forbidden). Before writing any commit, run locally and fix all errors until they pass clean:
    ```sh
    bun run lint
    bun run typecheck
    bun run test
    ```
4.  **Conventional Commits.** All commit messages must match: `feat|fix|chore|docs|style|refactor|test|ci|build|perf|revert(scope?): description` — e.g. `feat(api): add user endpoint`.
5.  **Git workflow: branch → PR → develop.** Never commit directly on `main` or `develop`. For any change:
    - Create a feature branch from `develop`: `git checkout develop && git pull && git checkout -b feat/<short-name>` (branch prefixes follow the commit types: `feat/`, `fix/`, `chore/`, `refactor/`…)
    - Commit your work on the branch, push it, and open a PR targeting `develop`
    - The PR labels drive the CI: add the **`preview`** label to deploy a live backend+frontend preview for the PR (`https://pr-N.api.<app>.staging.sleipnir.ovh`), and the **`mobile`** label to get an installable APK build of the PR
    - After the PR is merged into `develop`, the staging environment updates automatically. `main` is only updated by releasing from `develop` — the AI never pushes to `main`

## Monorepo Structure

```
apps/
  api/        Fastify API (Bun runtime)
  mobile/     Expo app (iOS, Android, web)
packages/
  contracts/  Shared Zod schemas & DTOs — single source of truth
```

Never move files between apps or create a third app without discussion. Shared code goes in `packages/contracts`, nowhere else.

## API Rules (`apps/api`)

Follow the existing module pattern — one module per domain in `src/modules/<domain>/`, four files plus tests:

```
item.routes.ts      Fastify route registration + Zod route schemas
item.service.ts     Business logic (owns errors, no Fastify types)
item.repository.ts  MongoDB queries only (Collection, Filter, indexes)
item.schema.ts      Fastify route-level schema (params, querystring, response)
items.test.ts       bun run test suite (mongodb-memory-server)
```

1.  **Layering**: routes → service → repository. Routes parse & delegate; services hold business logic; repositories hold MongoDB queries. Never call the repository from a route, and never import Fastify types in a service.
2.  **Validation**: validate request bodies with the shared Zod schemas from `@template/contracts` (`safeParse`), and register Fastify route schemas for params/querystring. Throw `AppError` from `src/lib/errors/AppError.ts` (`AppError.validation`, `AppError.notFound`, `AppError.conflict`, …) — the error-handler plugin formats responses.
3.  **Auth**: protect routes with `preValidation: [app.authenticate]`. Read the user id from `request.user.sub`. Never handle tokens manually in routes — the auth plugin and cookie plugins do it.
4.  **Plugins**: cross-cutting concerns live in `src/plugins/` (mongodb, auth, cors, rate-limit, swagger, error-handler). Reuse them; don't re-instantiate MongoDB clients or JWT logic in modules.
5.  **Env**: all environment variables must be declared in `src/config/env.ts` with a Zod schema (with sensible defaults). Never read `process.env` directly anywhere else.
6.  **New collections**: define an interface for the document, create the repository class, and add `ensureIndexes()` — call it from the module's routes registration, as existing modules do.
7.  **Migrations & seeds**: use the existing scripts (`bun run db:migrate:create`, `db:migrate`, `db:seed`). Don't invent ad-hoc DB mutation scripts.

## Mobile Rules (`apps/mobile`)

1.  **Routing**: expo-router file-system routing in `src/app/`. Screens are thin; they call hooks from `src/features/` and render components.
2.  **Data fetching**: always React Query. Create a feature directory `src/features/<domain>/` containing `use-<thing>.ts` hooks (`useItems`, `useCreateItem`, …) that call `src/api/endpoints/`. Never `fetch` directly in a component.
3.  **HTTP**: go through `apiClient` from `src/api/client.ts` — it handles the base URL, auth header, timeouts, and 401 refresh-retry. Never build a `fetch` call by hand.
4.  **Errors**: throw/catch `ApiError` (`src/api/api-error.ts`); map API errors to user-facing messages in the component. User-facing text is in **French**.
5.  **Forms**: `react-hook-form` + Zod resolver (`@hookform/resolvers`), reusing schemas from `@template/contracts` when the shape is shared.
6.  **State**: global client state lives in `src/store/` as plain typed stores over `src/lib/storage.ts` (`expo-secure-store`, see `auth.store.ts`); React state for local UI state. Don't add a state library (Redux, Zustand, Jotai) without discussion.
7.  **Platform-specific code**: use `.web.tsx` variants (see `use-color-scheme.web.ts`) rather than sprinkling `Platform.OS` ternaries.
8.  **Env**: mobile env vars must be prefixed `EXPO_PUBLIC_` and declared in `src/config/env.ts` (Zod). Nothing else is exposed to the client.
9.  **Components**: reuse `src/components/` primitives (`ThemedText`, `ThemedView`, …). Don't introduce a UI kit (NativeBase, Tamagui, gluestack) without discussion.

## Testing Rules

*   Use `bun run test` with `bun:test` (`import { test, expect } from "bun:test"`). No jest, vitest, or testing-library unless explicitly requested.
*   API tests use the `mongodb-memory-server` preload (`src/test/setup.ts`) and run with `bun run test:api`. Every new service method gets a test in the module's `*.test.ts`.
*   Tests are written in **English**.

## Code Quality Rules

*   **TypeScript strict**: no `any` (ESLint warns on `no-explicit-any`), no unused variables (prefix intentionally unused with `_`), prefer `type` imports for types (`import type { … }`).
*   **Small, single-purpose files**: one exported class/component per file, named after the file.
*   **Prettier owns formatting** — never reformat code by hand or argue about style; run `bun lint --fix` (via `bun run lint:api` / `lint:mobile`) if the linter complains.
*   **Naming**: `PascalCase` for components/classes/types, `camelCase` for functions/variables, `kebab-case` for file names (`use-items.ts`, `item.repository.ts`).
*   **Comments**: English, only where the code isn't self-explanatory. No commit-number comments, no dead code.
*   **Errors**: never `console.log` in the API (use Fastify's `app.log`); never swallow errors silently (`catch {}` must at least log or rethrow).
*   **Security**: never commit secrets — new env vars go in `.env` (gitignored) with defaults documented in `env.ts`. Validate all external input with Zod.

## Definition of Done

Before considering any change complete:

- [ ] `bun run lint` passes with no new warnings
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes (new logic is covered)
- [ ] Lefthook pre-commit hooks pass without bypassing
- [ ] Shared shapes are in `packages/contracts`, not duplicated
- [ ] Commit message follows Conventional Commits