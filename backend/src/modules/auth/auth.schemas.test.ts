
import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth.schemas";

describe("Login validation schema", () => {
  const validLogin = {
    email: "student@gmail.com",
    password: "password123",
  };

  it("accepts valid login input", () => {
    const result = loginSchema.safeParse(validLogin);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      email: "wrong-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      email: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "student@gmail.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric email", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      email: 123,
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric password", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      password: 123,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unexpected fields", () => {
    const result = loginSchema.safeParse({
      ...validLogin,
      role: "admin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects null login input", () => {
    const result = loginSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});
