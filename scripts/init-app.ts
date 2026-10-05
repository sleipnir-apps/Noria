#!/usr/bin/env bun
/**
 * Rebrand ce template avec un nouveau nom de projet.
 *
 * Usage:
 *   bun scripts/init-app.ts "My New App"
 */

import { readdirSync, statSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, extname } from "node:path";

const DISPLAY_TOKEN = "n0md3l4pP";
const CAPITALIZED_TOKEN = "N0md3l4pp";
const SLUG_TOKEN = "n0md3l4pp";
const SCREAM_TOKEN = "N0MD3L4PP";
const PACKAGE_TOKEN = "n0md3l4pppascal";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".expo",
  ".turbo",
  "coverage",
  ".next",
  ".vercel",
  "android",
  "ios",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".ico",
  ".gif",
  ".webp",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
  ".mp4",
  ".zip",
  ".lock",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toScreamingSnake(input: string): string {
  return slugify(input).replace(/-/g, "_").toUpperCase();
}

function toCapitalized(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function toDisplay(input: string): string {
  // Display uniquement : les "_" deviennent des espaces, tout le reste
  // (tirets, espaces, casse) est conservé tel quel.
  // "App_sport" -> "App sport", "app-sport" -> "app-sport".
  return input.replace(/_/g, " ");
}

function toPackageSafe(input: string): string {
  // Identifiant Java : chaque mot en PascalCase, sans séparateur.
  // "test-app-5" -> "TestApp5", "mon_super_projet" -> "MonSuperProjet".
  return slugify(input)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

const args = process.argv.slice(2);
const displayNameArg = args.find((a) => !a.startsWith("--"));
if (!displayNameArg) {
  console.error('Usage: bun scripts/init-app.ts "My New App"');
  process.exit(1);
}

const slug = slugify(displayNameArg);
const displayName = toDisplay(displayNameArg);
const capitalized = toCapitalized(slug);
const scream = toScreamingSnake(displayNameArg);
const packageSafe = toPackageSafe(displayNameArg);

console.log("Renaming template:");
console.log(`  ${DISPLAY_TOKEN} -> ${displayName}`);
console.log(`  ${CAPITALIZED_TOKEN} -> ${capitalized}`);
console.log(`  ${SLUG_TOKEN} -> ${slug}`);
console.log(`  ${SCREAM_TOKEN} -> ${scream}`);
console.log(`  ${PACKAGE_TOKEN} -> ${packageSafe}\n`);

let filesChanged = 0;

function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
    } else {
      processFile(fullPath);
    }
  }
}

function processFile(filePath: string) {
  if (BINARY_EXTENSIONS.has(extname(filePath))) return;
  if (filePath.endsWith("init-app.ts")) return;
  if (filePath.endsWith("README.md")) return;

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  if (
    !content.includes(DISPLAY_TOKEN) &&
    !content.includes(CAPITALIZED_TOKEN) &&
    !content.includes(SLUG_TOKEN) &&
    !content.includes(SCREAM_TOKEN) &&
    !content.includes(PACKAGE_TOKEN)
  ) {
    return;
  }

  // Order matters: replace the most specific tokens first so that
  // shorter tokens (e.g. the lowercase slug) don't clobber longer ones.
  // PACKAGE_TOKEN ("n0md3l4pppascal") contains SLUG_TOKEN ("n0md3l4pp")
  // as a prefix — it MUST be replaced before it.
  const updated = content
    .split(SCREAM_TOKEN)
    .join(scream)
    .split(DISPLAY_TOKEN)
    .join(displayName)
    .split(PACKAGE_TOKEN)
    .join(packageSafe)
    .split(CAPITALIZED_TOKEN)
    .join(capitalized)
    .split(SLUG_TOKEN)
    .join(slug);

  if (updated !== content) {
    writeFileSync(filePath, updated, "utf8");
    filesChanged++;
    console.log(`  ✓ ${filePath}`);
  }
}

function resetReadme() {
  const readmePath = join(process.cwd(), "README.md");
  // On ne garde que la doc utile APRÈS l'initialisation : les étapes
  // manuelles (EAS pour l'app mobile, sondes Uptime Kuma). Tout le
  // reste (instructions d'init du template) n'a plus de sens une fois
  // le rebranding fait.
  const keptSections = `# ${displayName}

## ⚠️ Pour avoir l'app sur mobile (EAS builds)

Tant que les étapes ci-dessous ne sont pas faites, les workflows de build mobile se terminent en *skipped* (pas en échec) — le reste (web, API, staging, prod) fonctionne sans.

1. **Crée le projet Expo** : [expo.dev](https://expo.dev) → Projects → **Create project**, copie l'**ID** affiché

   \`\`\`sh
   cd apps/mobile
   bunx eas login
   bunx eas init --id <ID_AFFICHÉ>
   \`\`\`

   ⚠️ \`eas init\` affiche une erreur normale : *"Your project uses dynamic app configuration, and the EAS project ID can't automatically be added to it"*. La config est dynamique (\`app.config.ts\`), EAS CLI ne peut pas y écrire — **l'ID doit être collé à la main** dans \`apps/mobile/app.config.ts\`, dans le bloc \`extra\` :

   \`\`\`ts
   extra: {
     appVariant: variant,
     eas: {
       projectId: "<ID_AFFICHÉ>",   // ← colle l'ID ici
     },
   },
   \`\`\`

   Puis committe le fichier.

Ensuite, les builds APK Android sont automatiques :

| Événement | Profil EAS | App produite |
|---|---|---|
| PR vers develop (label \`mobile\`) | \`pr\` | \`${displayName} pr-N\`, API de la PR — installable à côté des autres |
| push sur \`develop\` | \`preview\` | \`${displayName} staging\`, API staging |
| push sur \`main\` | \`production-apk\` | \`${displayName}\`, API prod |

Les variantes coexistent sur le même téléphone (packages Android différents : \`.prN\`, \`.staging\`, standard).

## 📡 Uptime Kuma (monitoring + keep-alive Atlas)

Après le premier déploiement, ajoute 4 sondes HTTP dans Uptime Kuma — elles surveillent **et** gardent les bases Atlas actives (le \`/health\` ping la base à chaque requête) :

| Nom | URL |
|---|---|
| \`${displayName} - prod API\` | \`https://${slug}-api.sleipnir.ovh/health\` |
| \`${displayName} - prod front\` | \`https://${slug}.sleipnir.ovh\` |
| \`${displayName} - staging API\` | \`https://staging.api.${slug}.staging.sleipnir.ovh/health\` |
| \`${displayName} - staging front\` | \`https://staging.${slug}.staging.sleipnir.ovh\` |

> Les previews \`pr-N\` ne valent pas la peine d'être sondées : elles vivent le temps de la PR.
`;
  writeFileSync(readmePath, keptSections, "utf8");
  console.log(
    `  ↺ README.md réinitialisé avec le nom "${displayName}" (sections EAS + Kuma conservées)`
  );
}

function removeInitScript() {
  const pkgPath = join(process.cwd(), "package.json");
  let content: string;
  try {
    content = readFileSync(pkgPath, "utf8");
  } catch {
    return;
  }

  const pkg = JSON.parse(content);
  if (pkg.scripts && "init-app" in pkg.scripts) {
    delete pkg.scripts["init-app"];
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    console.log('  ✂️  Ligne "init-app" supprimée de package.json');
  }
}

function removeInitScriptFile() {
  const scriptsDir = join(process.cwd(), "scripts");
  const scriptPath = join(scriptsDir, "init-app.ts");

  try {
    rmSync(scriptPath, { force: true });
    console.log("  🗑️  scripts/init-app.ts supprimé");
  } catch {
    return;
  }

  try {
    const remaining = readdirSync(scriptsDir);
    if (remaining.length === 0) {
      rmSync(scriptsDir, { recursive: true, force: true });
      console.log("  🗑️  dossier scripts/ supprimé (vide)");
    }
  } catch {
    return;
  }
}

function removeInitWorkflow() {
  // Le workflow Init Repo et ses scripts ne servent qu'à l'initialisation :
  // une fois le rebranding fait, ils n'ont plus de raison d'être dans l'app.
  const workflowPath = join(process.cwd(), ".github", "workflows", "init-repo.yml");
  const scriptsDir = join(process.cwd(), ".github", "scripts");

  try {
    rmSync(workflowPath, { force: true });
    console.log("  🗑️  .github/workflows/init-repo.yml supprimé");
  } catch {
    // absent — rien à faire
  }

  try {
    if (statSync(scriptsDir).isDirectory()) {
      rmSync(scriptsDir, { recursive: true, force: true });
      console.log("  🗑️  .github/scripts/ supprimé (atlas-init.sh, infisical-push.sh)");
    }
  } catch {
    // absent — rien à faire
  }
}

walk(process.cwd());
resetReadme();
removeInitScript();
removeInitScriptFile();
removeInitWorkflow();

console.log(`\n${filesChanged} fichier(s) modifié(s).`);
