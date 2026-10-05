import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toPascalCase(value: string): string {
  return toKebabCase(value)
    .split("-")
    .filter(Boolean)
    .map((part: string) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

async function createMigration(): Promise<void> {
  const description = process.argv[2];

  if (!description) {
    throw new Error('Usage: bun run db:migrate:create -- "add users status index"');
  }

  const slug = toKebabCase(description);

  if (!slug) {
    throw new Error("The migration description must contain letters or numbers.");
  }

  const migrationDirectory = import.meta.dir;
  const files = await readdir(migrationDirectory);

  const existingIds = files
    .map((fileName: string) => /^(\d{3})-/.exec(fileName)?.[1])
    .filter((id: string | undefined): id is string => id !== undefined)
    .map((id: string) => Number(id));

  const nextId = String(Math.max(0, ...existingIds) + 1).padStart(3, "0");
  const exportName = `migration${nextId}${toPascalCase(description)}`;
  const fileName = `${nextId}-${slug}.ts`;
  const filePath = join(migrationDirectory, fileName);

  const content = `import type { Migration } from "./index";

export const ${exportName}: Migration = {
  id: "${nextId}",
  description: "${description}",

  async up(db): Promise<void> {
    void db;
  },

  // Add down only when the migration can be safely reversed.
  // async down(db): Promise<void> {
  //   void db;
  // },
};
`;

  await writeFile(filePath, content, "utf8");

  console.info(`Created migration: ${fileName}`);
  console.info(`Register it in src/migrations/index.ts.`);
}

try {
  await createMigration();
} catch (error: unknown) {
  console.error("Unable to create migration.", error);
  process.exitCode = 1;
}
