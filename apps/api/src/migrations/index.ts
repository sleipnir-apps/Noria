import type { Db } from "mongodb";
import { migration001CreateUsersCollection } from "./001-create-users-collection";
import { migration002AddUsersEmailIndex } from "./002-add-users-email-index";
import { migration003CreateRevokedTokensCollection } from "./003-create-revoked-tokens-collection";

export interface Migration {
  id: string;
  description: string;
  up: (db: Db) => Promise<void>;
  down?: (db: Db) => Promise<void>;
}

export const migrations: readonly Migration[] = [
  migration001CreateUsersCollection,
  migration002AddUsersEmailIndex,
  migration003CreateRevokedTokensCollection,
];
