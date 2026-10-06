# Noria — V1 « tâches » offline-first

Noria est l'application de démonstration de ce template : gestion de tâches
offline-first sur un monorepo Bun (API Fastify + MongoDB, app Expo Router,
contrats Zod partagés). Ce README documente le module **Noria (tâches)** :
schéma de données, récurrence instance/parent, sync offline-first, commandes de
lancement et scénario de test manuel de la file de mutations.

## Lancement local

Prérequis : Bun (runtime/pkgr), Docker (MongoDB), deux terminaux.

> Cette instance utilise les ports **API 4102**, **web 8102** et la base
> **noria_claude**. Aucun port n'est codé en dur : `PORT` est lu par l'API, le
> port web est un flag Expo, et `EXPO_PUBLIC_API_URL` pointe l'app sur l'API.

### 1. MongoDB

Le compose du repo fourni (nom fixe `template-mongodb`, port hôte 27017) :

```sh
bun run db:up        # seulement si aucun MongoDB ne tourne déjà
```

Sur cette machine, un container MongoDB sain tourne déjà sur le port hôte
**27027** (`template-mongodb-dyad-glm`) — il est réutilisé tel quel. La config
locale (`apps/api/.env`, gitignored) pointe sur lui et sur la base dédiée :

```
MONGO_URL=mongodb://admin:password@localhost:27027/noria_claude?authSource=admin
```

### 2. Schéma + utilisateur de démo

```sh
bun run db:migrate   # collections users / revoked_tokens (+ indexes)
bun run db:seed      # upsert du compte de démo (bcrypt réel)
```

Compte de démo créé par le seed local : **admin@example.test** /
**admin-noria123** (développement uniquement, jamais en prod).

### 3. API

```sh
cd apps/api
export PORT=4102
bun run start        # (ou `bun run dev` pour le watch)
```

Vérification :

```sh
curl http://localhost:4102/api/v1/health
# {"status":"ok","database":"connected",...}
```

### 4. Application (web)

```sh
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:4102/api/v1 bun run web -- --port 8102
# → http://localhost:8102
```

Sur mobile natif (Expo Go / dev-build), pointer sur l'IP LAN du poste :

```sh
EXPO_PUBLIC_API_URL=http://192.168.x.x:4102/api/v1 bun run start
```

## Scénario manuel : la file de mutations offline

1. Connexion (compte de démo), onglet **Aujourd'hui**.
2. Créer « Acheter du pain » (backlog), puis dans l'éditeur créer
   « Sprint » avec une date d'aujourd'hui + récurrence hebdo lundi cochée.
3. **Couper l'API** (Arrêter le terminal de l'API, ou DevTools → Network →
   Offline). Cocher des tâches, reporter l'occurrence d'un jour, créer une
   autre tâche : tout est appliqué localement et le bandeau rouge
   « Hors ligne — modifications gardées en attente » affiche le nombre
   d'opérations en file.
4. **Relancer l'API** (même port). Le moteur de sync retente à la minute (ou
   clic sur l'icône refresh du bandeau, ou clic sur l'icône sync de l'en-tête) :
   push de la file puis pull — le bandeau disparaît.
5. Prouver la persistance côté serveur :

   ```sh
   curl -X POST http://localhost:4102/api/v1/auth/login \
     -H 'Content-Type: application/json' -H 'X-Client-Platform: mobile' \
     -d '{"email":"admin@example.test","password":"admin-noria123"}'
   curl http://localhost:4102/api/v1/tasks -H "Authorization: Bearer $TOKEN"
   ```

   Toutes les modifications faites hors ligne sont dans la base.
6. Last-write-wins : modifier une tâche depuis un second appareil (ou un
   curl /sync/push avec un `updatedAt` plus récent), puis faire une modif
   plus ancienne depuis le premier — la réponse du push la classe
   `conflicts` avec `kept` (version du serveur) et `rejectedUpdatedAt` ;
   l'app adopte la version conservée.

## Choix de conception (V1)

- **Récurrence parent/instance** : seule la tâche parente porte
  `recurrenceRule` ; les occurrences sont calculées à la volée avec `rrule`
  (lib aussi utilisée côté API, mêmes sémantiques) et matérialisées en
  instances (`parentTaskId` + `originalDueDate`) uniquement quand elles subissent
  une mutation propre. Un parent n'est jamais modifié par une occurrence.
- **Occurrences calculées côté client** : `Aujourd'hui` fonctionne 100 %
  hors ligne ; la matérialisation est un CREATE d'instance qui embarque
  `parentTaskId` et `originalDueDate`, le serveur dédupliquant par
  `originalDueDate`, les replays ne dupliquent pas l'instance.
- **Une seule ligne « En retard » par tâche récurrente** (la dernière
  occurrence manquée, pas la liste complète des dates ratées) : l'information
  utile est « cette série décroche », la série continue de se dilater.
- **File unique** : toute écriture (en ligne ou non) est appliquée
  optimistiquement au dataset local puis mise en file — un seul chemin de code.
  Rejeu : push (LWW sur `updatedAt`) puis pull ; les documents avec opérations
  en attente gardent leur version locale au pull.
- **Dates sans heure** : ancrées à minuit local du jour choisi au moment de
  l'écriture (ISO avec offset, ex. `2026-10-05T00:00:00+02:00`). Caveat : la
  fenêtre « aujourd'hui » suit l'horloge du device ; un device qui change de
  fuseau après écriture peut décaler d'un jour (inherent aux dates-only).
- **Déconnexion réseau** sans bibliothèque réseau (NetInfo interdit par
  l'épreuve) : `navigator.onLine` sur web + tentative à la minute ; natif : la
  minute et le retry manuel suffisent.
- **Conflits** : règle stricte (strictement plus récent gagne, tombstone
  gagnant sur update) ; le client adopte `kept` — pas d'UI d'arbitrage.
- Supprimer une instance ré-surface l'occurrence sous-jacente (comportement
  V1 assumé, cf. épreuve).
- **Fenêtre de crash V1** : pas de déduplication persistée des `opId`
  côté serveur ; un push rejoué après une réponse perdue converge
  quand même (LWW / `conflicts`), mais l'opération peut être acquittée en
  conflit au lieu d'être silencieusement dédoublée.
- UI légère maison (`ThemedText`/`ThemedView` + composants `tasks/*`), sans
  lib de composants ; textes utilisateur en français.

## Endpoints du module (préfixe global `/api/v1`)

| Route | Rôle |
| --- | --- |
| `POST /tasks` | création (backlog si sans `dueDate`) |
| `GET /tasks`, `GET /tasks/:id` | listes filtres `dated/dateless/status/priority` |
| `PATCH /tasks/:id` | édition générique (pose/retire `dueDate`, `recurrenceRule`, …) |
| `DELETE /tasks/:id` | suppression douce (tombstone) |
| `GET /tasks/range?start&end` | tâches datées + occurrences `rrule` (instances déjà matérialisées exclues) |
| `GET /tasks/overdue` | datées en retard + dernière occurrence manquée par série |
| `GET /sync?since=…` | pull incrémental : `{changes, deletions, serverTime}` |
| `POST /sync/push` | batch d'opérations : `{applied, conflicts}` |

## Qualité

```sh
bun run typecheck && bun run lint && bun run test   # contracts + api + mobile
```

Tests API : `apps/api/src/modules/tasks/tasks.test.ts` + `sync.test.ts`
(mongodb-memory-server, `bun run --cwd apps/api test`) — CRUD, scoping,
range avec fusion rrule (retard/instance/déduplication), overdue, suppression
douce, pull/push, LWW, tombeaux, matérialisation hors ligne, 401/400/409.