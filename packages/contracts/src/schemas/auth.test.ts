import { describe, expect, it } from "bun:test";
import { LoginInputSchema, RegisterInputSchema } from "../index";

describe("RegisterInputSchema", () => {
  it("valide une inscription correcte", () => {
    expect(
      RegisterInputSchema.safeParse({
        email: "test@example.com",
        displayName: "Test User",
        password: "password123",
      }).success
    ).toBe(true);
  });

  it("rejette un email invalide", () => {
    expect(
      RegisterInputSchema.safeParse({
        email: "invalid-email",
        displayName: "Test User",
        password: "password123",
      }).success
    ).toBe(false);
  });

  it("rejette un mot de passe trop court", () => {
    expect(
      RegisterInputSchema.safeParse({
        email: "test@example.com",
        displayName: "Test User",
        password: "123",
      }).success
    ).toBe(false);
  });

  it("rejette un displayName trop court", () => {
    expect(
      RegisterInputSchema.safeParse({
        email: "test@example.com",
        displayName: "A",
        password: "password123",
      }).success
    ).toBe(false);
  });
});

describe("LoginInputSchema", () => {
  it("valide un login correct", () => {
    expect(
      LoginInputSchema.safeParse({
        email: "test@example.com",
        password: "password123",
      }).success
    ).toBe(true);
  });

  it("rejette un mot de passe vide", () => {
    expect(
      LoginInputSchema.safeParse({
        email: "test@example.com",
        password: "",
      }).success
    ).toBe(false);
  });
});
