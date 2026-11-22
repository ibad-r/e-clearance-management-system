
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

  it.each(["role", "userId", "studentId", "sapId"])(
    "rejects client-supplied %s in the email login contract",
    (field) => {
      expect(loginSchema.safeParse({
        ...validLogin,
        [field]: "client-supplied-identity",
      }).success).toBe(false);
    },
  );
});

describe("Student SAP and combined identifier validation", () => {
  const password = "fictional password";
  it.each(["sapId", "identifier"])("trims only surrounding whitespace from %s", (field) => {
    for (const value of ["0000123", "S6468", "custom identifier", "SAP@example.invalid"]) {
      expect(loginSchema.parse({ [field]: "  " + value + "  ", password }))
        .toEqual({ [field]: value, password });
    }
  });
  it.each(["sapId", "identifier"])("rejects blank, missing and non-string %s", (field) => {
    for (const value of [undefined, null, "", " \t\n ", 1]) {
      expect(loginSchema.safeParse({ [field]: value, password }).success).toBe(false);
    }
  });
  it.each(["sapId", "identifier"])("requires the existing nonempty password for %s", (field) => {
    for (const value of [undefined, null, "", 1]) {
      expect(loginSchema.safeParse({ [field]: "S1", password: value }).success).toBe(false);
    }
    expect(loginSchema.parse({ [field]: "S1", password: " password " }).password).toBe(" password ");
  });
  it.each([
    { email: "a@example.invalid", sapId: "S1", password },
    { email: "a@example.invalid", identifier: "S1", password },
    { sapId: "S1", identifier: "S1", password },
    { email: "a@example.invalid", sapId: "S1", identifier: "S1", password },
  ])("rejects conflicting identifiers %#", (input) => {
    expect(loginSchema.safeParse(input).success).toBe(false);
  });
  it.each(["role", "userId", "studentId", "registrationNumber"])("rejects client-controlled %s", (field) => {
    for (const identifier of [{ email: "a@example.invalid" }, { sapId: "S1" }, { identifier: "S1" }]) {
      expect(loginSchema.safeParse({ ...identifier, password, [field]: "spoofed" }).success).toBe(false);
    }
  });
});
