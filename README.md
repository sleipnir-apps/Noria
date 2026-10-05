# Noria

## ⚠️ Pour avoir l'app sur mobile (EAS builds)

Tant que les étapes ci-dessous ne sont pas faites, les workflows de build mobile se terminent en *skipped* (pas en échec) — le reste (web, API, staging, prod) fonctionne sans.

1. **Crée le projet Expo** : [expo.dev](https://expo.dev) → Projects → **Create project**, copie l'**ID** affiché

   ```sh
   cd apps/mobile
   bunx eas login
   bunx eas init --id <ID_AFFICHÉ>
   ```

   ⚠️ `eas init` affiche une erreur normale : *"Your project uses dynamic app configuration, and the EAS project ID can't automatically be added to it"*. La config est dynamique (`app.config.ts`), EAS CLI ne peut pas y écrire — **l'ID doit être collé à la main** dans `apps/mobile/app.config.ts`, dans le bloc `extra` :

   ```ts
   extra: {
     appVariant: variant,
     eas: {
       projectId: "<ID_AFFICHÉ>",   // ← colle l'ID ici
     },
   },
   ```

   Puis committe le fichier.

Ensuite, les builds APK Android sont automatiques :

| Événement | Profil EAS | App produite |
|---|---|---|
| PR vers develop (label `mobile`) | `pr` | `Noria pr-N`, API de la PR — installable à côté des autres |
| push sur `develop` | `preview` | `Noria staging`, API staging |
| push sur `main` | `production-apk` | `Noria`, API prod |

Les variantes coexistent sur le même téléphone (packages Android différents : `.prN`, `.staging`, standard).

## 📡 Uptime Kuma (monitoring + keep-alive Atlas)

Après le premier déploiement, ajoute 4 sondes HTTP dans Uptime Kuma — elles surveillent **et** gardent les bases Atlas actives (le `/health` ping la base à chaque requête) :

| Nom | URL |
|---|---|
| `Noria - prod API` | `https://noria-api.sleipnir.ovh/health` |
| `Noria - prod front` | `https://noria.sleipnir.ovh` |
| `Noria - staging API` | `https://staging.api.noria.staging.sleipnir.ovh/health` |
| `Noria - staging front` | `https://staging.noria.staging.sleipnir.ovh` |

> Les previews `pr-N` ne valent pas la peine d'être sondées : elles vivent le temps de la PR.
