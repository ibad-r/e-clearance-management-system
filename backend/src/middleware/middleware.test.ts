
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { app as productionApp } from "../app";
import { validateBody } from "./validateBody";
import { errorHandler } from "./errorHandler";

const schema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});

function createTestApp() {
  const testApp = express();

  testApp.use(express.json());

  testApp.post(
    "/test/validate",
    validateBody(schema),
    (req, res) => {
      res.status(200).json({ data: req.body });
    }
  );

  testApp.get("/test/error", (_req, _res, next) => {
    next(new Error("SECRET_INTERNAL_INFORMATION"));
  });

  testApp.use(errorHandler);

  return testApp;
}

describe("Validation and error handling middleware", () => {
  const testApp = createTestApp();

  const validBody = {
    email: "student@example.com",
    password: "password123",
  };

  it("accepts valid input", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send(validBody);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(validBody);
  });

  it("rejects invalid email", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send({
        ...validBody,
        email: "invalid-email",
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
      },
    });
  });

  it("rejects missing password", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send({
        email: "student@example.com",
      });

    expect(response.status).toBe(400);
  });

  it("rejects empty password", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send({
        ...validBody,
        password: "",
      });

    expect(response.status).toBe(400);
  });

  it("rejects incorrect field types", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send({
        ...validBody,
        password: 123,
      });

    expect(response.status).toBe(400);
  });

  it("rejects unexpected fields", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .send({
        ...validBody,
        role: "admin",
      });

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const response = await request(testApp)
      .post("/test/validate")
      .set("Content-Type", "application/json")
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request data",
      },
    });
  });

  it("hides unexpected server errors", async () => {
    const response = await request(testApp)
      .get("/test/error");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });

    expect(response.text).not.toContain(
      "SECRET_INTERNAL_INFORMATION"
    );
  });

  it("handles malformed JSON in production", async () => {
    const response = await request(productionApp)
      .post("/health")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe(
      "VALIDATION_ERROR"
    );
  });

  it("preserves the health endpoint", async () => {
    const response = await request(productionApp)
      .get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("preserves 404 responses", async () => {
    const response = await request(productionApp)
      .get("/unknown-route");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe(
      "NOT_FOUND"
    );
  });

  it("does not expose test routes in production", async () => {
    const response = await request(productionApp)
      .post("/test/validate")
      .send(validBody);

    expect(response.status).toBe(404);
  });
});
