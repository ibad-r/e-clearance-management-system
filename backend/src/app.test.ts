
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./app";

describe("Backend API smoke tests", () => {
  it("GET /health returns a healthy response", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "e-clearance-backend",
    });
  });

  it("unknown endpoints return a 404 error", async () => {
    const response = await request(app).get(
      "/non-existing-route"
    );

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });
});
