import type { Migration } from "./index";

export const migration002AddUsersEmailIndex: Migration = {
  id: "002",
  description: "Add unique index on users email",

  async up(db): Promise<void> {
    await db.collection("users").createIndex(
      { email: 1 },
      {
        name: "users_email_unique",
        unique: true,
      }
    );
  },

  async down(db): Promise<void> {
    await db.collection("users").dropIndex("users_email_unique");
  },
};
