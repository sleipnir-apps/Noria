# Noria — V1 tasks offline-first

Noria est une app de gestion de tâches **offline-first** (module `tasks` V1) construite sur le
template monorepo de ce repo :

- `apps/api` — Fastify 5 sur Bun, MongoDB (driver officiel), module `tasks` + module `sync`.
- `apps/mobile` — Expo 57 (iOS/Android/web), Expo Router, TanStack Query persisté, file de
  mutations offline rejouée à la reconnexion.
- `packages/contracts` — schémas Zod partagés + expansion `rrule` (mêmes occurrences calculées
  côté API et côté client).

> Le nom du template (placeholders `@template/*`, `noria`) reste tel quel : **Noria** est le titre
> affiché dans l'app (déjà en place dans `apps/mobile/src/app/_layout.tsx`).

## Lancer l'API

Prérequis : MongoDB accessible. Le compose du template démarre un conteneur `template-mongodb`
(s'il tourne déjà, réutilise-le ; sinon `bun run db:up`).

```sh
# à la racine du monorepo — les variables passées explicitement (bun auto-load le .env racine,
# qui n'existe pas par défaut) :
PORT=4101 HOST=0.0.0.0 NODE_ENV=development \
JWT_SECRET=dev_access_secret_change_me_32chars \
JWT_REFRESH_SECRET=dev_refresh_secret_change_me_32chars \
CORS_ORIGINS=http://localhost:8101,http://localhost:8081 \
MONGO_URL="mongodb://admin:password@localhost:27027/noria_opencode?authSource=admin" \
bun apps/api/src/server.ts
```

- Health : `curl http://localhost:4101/health` → `{"status":"ok","database":"connected",...}`
- Swagger UI : http://localhost:4101/docs
- Aucun port codé en dur : tout vient de `MONGO_URL`/`PORT` (`apps/api/src/config/env.ts`).

### Utilisateur de démo

`demo@noria.test` / `demo1234` (créé via `POST /auth/register` pendant la session de test ;
MongoDB est authentifié via les identifiants du compose `admin/password`).

## Lancer l'app (web)

```sh
# à la racine — EXPO_PUBLIC_API_URL inliné par Expo :
cd apps/mobile && EXPO_PUBLIC_API_URL=http://localhost:4101/api/v1 bun expo start --web --port 8101
```

- Ouvrir http://localhost:8101 → écran Connexion → `demo@noria.test` / `demo1234`.
- Les onglets : **Aujourd'hui** (3 sections), **Backlog**, **Profil**.
- L'éditeur-créateur est la route stack `/(app)/task-editor`.
- La constante d'URL API est `EXPO_PUBLIC_API_URL`, validée par
  `apps/mobile/src/config/env.ts` (champ `apiUrl`) et suffixée automatiquement par les appels
  `apiClient` (endpoints `/tasks`, `/sync`…).

Pour le natif (Expo Go) : remplacer `localhost` par l'IP LAN du PC.

## Tests

Les tests n'ont besoin de rien d'installé (MongoMemoryServer + `app.inject`) :

```sh
bun run test        # toute la monorepo (contracts + api)
bun run test:api    # seul l'API
bun run typecheck
bun run lint
```

## Scénario de test manuel offline (queue de mutations)

1. Ouvrir http://localhost:8101, se connecter (`demo@noria.test` / `demo1234`).
2. **Créer des tâches** : bouton ＋ (Aujourd'hui) ou « Nouvelle tâche » (Backlog). Créer e.g.
   « Courses » (backlog), « Dentiste » avec date+heure aujourd'hui, « Rapport hebdo » datée
   aujourd'hui avec récurrence un lundi (badge « Récurrente »).
3. **Couper l'API** (Ctrl+C sur le serveur). La bannière devient
   « Hors ligne — les modifications sont enregistrées localement ».
4. **Continuer à travailler offline** : cocher une tâche (DONE), en créer une (« Idée offline »),
   modifier les tags, supprimer une tâche… Tout est appliqué localement, le compteur de la
   bannière affiche « N modification(s) en attente de sync ».
5. **Redémarrer l'API** (même commande). Le moteur de sync détecte la reconnexion :
   push de la file puis pull des changements → bannière disparaît.
6. **Recharger la page** : les mutations offline sont bien sur le serveur (visible aussi via
   `curl http://localhost:4101/api/v1/sync -H "Authorization: Bearer <token>"`).
7. **Conflit LWW (optionnel)** : modifier une tâche dans l'app, puis rejouer une op « ancienne »
   via curl (`updated_at` antérieur). La réponse `{"applied":[],"conflicts":[{"id":…,"kept":…,
   "rejected_updated_at":…}]}` montre que le serveur garde sa version (la tâche locale est
   corrigée au prochain pull).

## Architecture du module tasks

### Backend (`apps/api/src/modules/`)

- `tasks/` — pattern routes/schema/service/repository :
  - `POST /api/v1/tasks` — création (défauts : priorité P3, statut TODO).
  - `GET /api/v1/tasks?backlog=true` — sans date (Backlog), tri priorité puis created_at.
  - `GET /api/v1/tasks/range?start&end` — datées de l'intervalle **fusionnées** avec les
    occurrences rrule (occurrences déjà matérialisées = l'instance remplace la virtuelle).
  - `GET /api/v1/tasks/overdue` — en retard (datées passées, non DONE/ARCHIVED).
  - `GET/PATCH/DELETE /api/v1/tasks/:id` — détail, update générique
    (`due_date: null` = conversion datée↔backlog), soft delete.
    `PATCH /api/v1/tasks/:id?occurrence_date=<ISO>` — mutation d'UNE occurrence d'une tâche
    récurrente : matérialise une instance (`parent_task_id` + `original_due_date`), le parent
    n'est jamais modifié.
- `sync/` :
  - `GET /api/v1/sync?since=<ISO>` → `{ changes, deletions, server_time }`.
  - `POST /api/v1/sync/push` — batch d'opérations (`upsert`/`delete`), résolution **LWW sur
    `updated_at`** → `{ applied, conflicts: [{id, kept, rejected_updated_at}] }`.

Index MongoDB : `(userId, due_date)`, `(userId, status)`, `parent_task_id`, `(userId, updatedAt)`.

### Modèle de récurrence (parent/instance)

- La règle (`recurrence_rule`) vit sur la tâche PARENTE.
- Aucune occurrence pré-générée : les occurrences sont **calculées à la volée** (lib `rrule`,
  expansion partagée dans `packages/contracts/src/tasks/occurrences.ts`, tzid UTC — les
  clients rendent en heure locale).
- Une occurrence ne devient un document (INSTANCE) que si elle subit une mutation propre
  (complétion, report, édition). Supprimer le parent n'efface pas l'historique des instances.
- Occurrence manquée = visible en retard ; l'exécution tardive ne décale rien (les occurrences
  suivantes restent ancrées sur la règle).

### Front offline-first (`apps/mobile/src/features/`)

- `tasks/tasks.store.ts` — cache local persisté (AsyncStorage) = source de vérité UI.
- `tasks/use-tasks.ts` — hooks React Query : lecture depuis le cache local, écriture optimiste +
  enqueue d'une opération de sync.
- `sync/sync-queue.ts` — file persistée d'opérations + curseur `since`.
- `sync/use-sync.ts` — moteur : rejeu de la file (push) puis pull à la reconnexion / app active ;
  statut consumé par `components/offline-banner.tsx`.
- Persistance TanStack Query : `PersistQueryClientProvider` + `createAsyncStoragePersister`
  (AsyncStorage) — le cache queries survit aux redémarrages.

## Choix d'implémentation (ambiguïtés tranchées)

- **Timezone des occurrences** : composition civils en **UTC** (`tzid: "UTC"`), le `by_weekday`
  vise le jour-UTC du `due_date`. Simple, cohérent serveur/clients ; une V2 pourrait passer la
  tz de l'utilisateur dans la règle.
- **Première occurrence = le `due_date` du parent**, même s'il ne correspond pas à la règle
  (ex. parent créée un mardi avec règle « lundis » : le mardi reste la 1ʳᵉ occurrence). Les
  occurrences suivantes suivent strictement la règle.
- **Soft delete** (`deleted_at`) : les vues n'excluent que via `deleted_at != null` ; le pull
  sync rapporte les suppressions dans `deletions` pour purge/flag du cache local.
- **LWW strictement plus récente gagne** : `updated_at` strictement supérieur applique l'op ;
  identique ou plus ancien = conflit rejeté (serveur garde sa version, le client est corrigé au
  pull).
- **IDs générés côté client** (uuid) : crées offline, acceptés tels quels par le serveur — le
  cache local et le serveur partagent la même clé.
- **Écrans** : un seul composant `TaskCard` partagé, pas de lib UI (primitives `ThemedText` /
  `ThemedView` du template). Le mode édition occurrence est déduit de l'URL
  (`?occurrence_date=`), l'éditeur affiche un badge « Modifier l'occurrence ».
- **`useLocalTasks` + `selectToday`/`selectBacklog`** : les vues (Aujourd'hui 3 sections, Backlog)
  calculent depuis le cache local — aucune requête réseau bloquante à l'ouverture.

## Hors périmètre (non implémenté, demandé)

Partage multi-utilisateurs, notifications, récurrences avancées (BYSETPOS, nth-weekday),
sous-tâches récursives, recherche full-text, déploiement/Docker.