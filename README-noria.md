# Noria — module tasks V1 (offline-first)

Ajout du module **tasks** au template : API Fastify+Mongo scoped utilisateur, sync
offline-first (LWW), front Expo avec écrans Aujourd'hui / éditeur / Backlog.

## Ce qui a été ajouté

### Backend (`apps/api/src/modules/tasks/` + `apps/api/src/lib/`)
- `task.repository.ts` — collection `tasks`, index `{userId, dueDate}`,
  `{userId, status}`, `parentId`, `{userId, updatedAt}` (détection LWW).
- `task.service.ts` — logique métier : CRUD, vues `range`/`overdue`,
  matérialisation d'occurrences, sync pull/push.
- `task.routes.ts` / `task.schema.ts` — routes schéma-Firstify + Zod contracts.
- Endpoint `POST /tasks/:id/occurrence` pour matérialiser une occurrence
  (complétion / report) en instance réelle avec `parent_task_id` +
  `original_due_date`. Le parent n'est jamais modifié par une occurrence.
- `GET /api/v1/sync?since=<ISO>` → `{ changes, deletions, server_time }`
- `POST /api/v1/sync/push` → `{ applied, conflicts }` (résolution LWW sur
  `updated_at` ; tie → l'op client gagne (`updatedAt <= entry.updated_at`)).
- Les soft-deleted documents sont exclus des vues REST mais remontés dans
  `deletions` par le pull, pour propager la suppression offline.

Choix d'implémentation (doc) :
- **ids 24-hex ObjectId-compatible générés client** : le serveur les utilise
  directement comme `_id` (pas de mapping local→serveur).
- **occurrences** : calculées à la volée avec `rrule` (aucune instance en base).
  Une occurrence materialisée = document `parentId + originalDueDate`.
- **LWW tie** : `updatedAt <= incoming` → l'op client gagne l'égalité. Doc : le
  repo utilise `$lte` (et non `$lt`) pour que le push d'une écriture locale
  réplique toujours l'état vu par le device au moment de l'écriture.
- Les opérations hors-monde de l'utilisateur (`upsert` / `delete` sur un id
  étranger) sont **ignorées silencieusement** (pas appliquées, pas conflicts).
- **Occurrences dépassées** (overdue view) : les occurrences rrule passées
  deviennent visibles en retard, matérialisation = instance `DONE` sur place
  (rien n'est décalé).
- Scénario hebdo : décembre 2026 compte **exactement 4 lundis**
  (07, 14, 21, 28) — le scénario DoD « les 4 lundis d'un mois, dont un override
  DONE » est testé dessus (novembre 2026 en a 5).

### Front (`apps/mobile/src/`)
- `api/endpoints/tasks.api.ts` — client REST (préfixe `/api/v1`).
- `features/tasks/` — file de mutations offline (`task-queue.ts`), cycle sync
  push→pull (`task-sync.ts`), hooks optimistes (`use-tasks.ts`).
- `components/tasks/` — `TaskRow`, `SyncStatusBanner` ("N modifications en
  attente de sync").
- Écrans : `(tabs)/index` **Aujourd'hui** (3 sections : datées du jour,
  occurrences du jour, retards), `(tabs)/backlog` **Backlog** (sans date, tri
  priorité puis created_at), `task-editor` (titre, priorité, date ± heure via
  `has_time`, tags, sous-tâches, récurrence par jours de semaine).
- Cache React Query persisté (`lib/query-persistence.ts`, storage async
  plateforme) → visible offline après rehydratation.

## Lancer (cette instance)

```sh
# 1. API (port 4103) — base mongo dédiée noria_hermes
cd apps/api
export PORT=4103
bun run db:migrate        # applique les migrations sur noria_hermes
bun src/server.ts         # (déjà démarré : vérifie avec curl /api/v1/health)

# 2. Front web (port 8103)
cd apps/mobile
bun start --web --port 8103    # .env pinne EXPO_PUBLIC_API_URL=http://localhost:4103/api/v1
```

Vérification live :
```sh
curl http://localhost:4103/api/v1/health
# {"status":"ok","database":"connected",...}
```

## Scénario de test manuel offline (file de mutations)

1. Ouvrir l'app web (http://localhost:8103), se connecter (ex. `demo@noria.local`
   / `password123`) — user créé via `/api/v1/auth/register` ou seeds.
2. **Couper le backend** (Ctrl+C sur le serveur API, ou `docker pause` mongo).
3. Créer 2 tâches depuis l'éditeur + en compléter une : la bannière
   « 3 modifications en attente de sync » apparaît (file persistée en storage).
4. **Relancer le backend** (`bun src/server.ts`) : le cycle se rejoue à la
   reconnexion — les ops partent en push, le pull ramène l'état serveur fusionné,
   la bannière disparaît.
5. (Conflit) Modifier la même tâche depuis un autre client (curl `PATCH`) avant
   de rejouer la file : la résolution LWW tranche sur `updated_at`, les perdants
   remontent en `conflicts` et restent rejouables.

## Tests

```sh
bun run typecheck   # 3 workspaces : vert
bun run lint        # 3 workspaces : vert (2 warnings preexisting non liés)
bun test            # 31 (contracts) + 86 (api) : vert
```
Couverture API : CRUD complet, scoping user, soft delete (exclu des vues,
présent en pull), range avec fusion rrule (4 lundis décembre, dont 1 instance
DONE dédupliquée), matérialisation occurrence (endpoint + sync push), overdue,
LWW push (op ancienne rejetée en conflit, op récente appliquée, tie client,
delete LWW, op étrangère ignorée), validations 400, 401 sans token.

## Hors périmètre (V1) — explicitement non implémenté
Partage multi-users, notifications, récurrences avancées (BYSETPOS, nth-weekday),
sous-tâches récursives, recherche full-text, déploiement Docker.