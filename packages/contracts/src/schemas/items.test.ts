import { describe, expect, it } from "bun:test";
import { CreateItemSchema, UpdateItemSchema, ItemFiltersSchema } from "../index";

describe("CreateItemSchema", () => {
  it("valide un item correct", () => {
    expect(CreateItemSchema.safeParse({ title: "Mon item" }).success).toBe(true);
  });

  it("valide avec description optionnelle", () => {
    expect(CreateItemSchema.safeParse({ title: "Mon item", description: "desc" }).success).toBe(
      true
    );
  });

  it("rejette un titre vide", () => {
    expect(CreateItemSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("rejette un titre trop long", () => {
    expect(CreateItemSchema.safeParse({ title: "a".repeat(101) }).success).toBe(false);
  });
});

describe("UpdateItemSchema", () => {
  it("valide une mise à jour partielle", () => {
    expect(UpdateItemSchema.safeParse({ status: "archived" }).success).toBe(true);
  });

  it("rejette un status invalide", () => {
    expect(UpdateItemSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});

describe("ItemFiltersSchema", () => {
  it("applique les valeurs par défaut", () => {
    const result = ItemFiltersSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerce les strings en nombres", () => {
    const result = ItemFiltersSchema.parse({ page: "2", limit: "10" });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("rejette une limite supérieure à 100", () => {
    expect(ItemFiltersSchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
