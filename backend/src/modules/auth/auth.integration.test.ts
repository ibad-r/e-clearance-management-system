
import { randomBytes, randomUUID } from "node:crypto";
import type { Express } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  connectTestDatabase,
  validateTestDatabaseUrl,
  type TestDatabaseConnection,
} from "../../db/test-database";

import { signAccessToken } from "./auth.tokens";

describe("Authentication integration", () => {
  const activeId = randomUUID();
  const inactiveId = randomUUID();


  const otherRoles = (
    ["HR_OFFICER", "APPROVER", "SYSTEM_ADMIN"] as const
  ).map((role) => ({
    role,
    id: randomUUID(),
    email:
      `fictional-${role.toLowerCase()}-${randomUUID()}@example.invalid`,
  }));

  const activeEmail = `fictional-${activeId}@example.invalid`;
  const inactiveEmail = `inactive-${inactiveId}@example.invalid`;

  const password = randomBytes(24).toString("base64url");

  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalTtl = process.env.JWT_ACCESS_TTL_SECONDS;

  let connection: TestDatabaseConnection | undefined;
  let app: Express;
  let appLoaded = false;



  beforeAll(async () => {
    const url = validateTestDatabaseUrl(
      process.env.TEST_DATABASE_URL
    );

    connection = await connectTestDatabase(url);

    process.env.DATABASE_URL = url;
    process.env.JWT_SECRET =
      randomBytes(32).toString("base64url");
    process.env.JWT_ACCESS_TTL_SECONDS = "900";

    const passwordHash = await argon2.hash(password);


    await connection.client.query(
      `INSERT INTO public.users
        (id, email, password_hash, full_name, role, is_active)
       VALUES
        ($1, $2, $3, $4, 'EMPLOYEE', true),
        ($5, $6, $3, $7, 'EMPLOYEE', false)`,
      [
        activeId,
        activeEmail,
        passwordHash,
        "Fictional Test Employee",
        inactiveId,
        inactiveEmail,
        "Inactive Fictional Employee",
      ]
    );


    for (const account of otherRoles) {
      await connection.client.query(
        `INSERT INTO public.users
          (id, email, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [
          account.id,
          account.email,
          passwordHash,
          `Fictional ${account.role}`,
          account.role,
        ]
      );
    }


    const module = await import("../../app.js");
    app = module.app;
    appLoaded = true;
  }, 30000);



  afterAll(async () => {
    try {
      if (connection) {
        // Clean up the additional role accounts.
        for (const account of otherRoles) {
          await connection.client.query(
            `DELETE FROM public.users
             WHERE id = $1 AND email = $2`,
            [account.id, account.email]
          );
        }


        await connection.client.query(
          `DELETE FROM public.users
           WHERE (id = $1 AND email = $3)
              OR (id = $2 AND email = $4)`,
          [
            activeId,
            inactiveId,
            activeEmail,
            inactiveEmail,
          ]
        );
      }
    } finally {
      try {
        await connection?.close();

        if (appLoaded) {
          const { pool } = await import("../../db/index.js");
          await pool.end();
        }
      } finally {
        if (originalDatabaseUrl === undefined) {
          delete process.env.DATABASE_URL;
        } else {
          process.env.DATABASE_URL = originalDatabaseUrl;
        }

        if (originalJwtSecret === undefined) {
          delete process.env.JWT_SECRET;
        } else {
          process.env.JWT_SECRET = originalJwtSecret;
        }

        if (originalTtl === undefined) {
          delete process.env.JWT_ACCESS_TTL_SECONDS;
        } else {
          process.env.JWT_ACCESS_TTL_SECONDS = originalTtl;
        }
      }
    }
  }, 30000);



  it("logs in a real PostgreSQL-backed employee", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: activeEmail,
        password,
      });

    expect(response.status).toBe(200);
    expect(typeof response.body.accessToken).toBe("string");
    expect(response.body.user.id).toBe(activeId);
    expect(response.body.user.email).toBe(activeEmail);
    expect(response.body.user.role).toBe("EMPLOYEE");

    expect(response.body.user).not.toHaveProperty(
      "passwordHash"
    );

    expect(jwt.decode(response.body.accessToken)).toMatchObject({
      sub: activeId,
      role: "EMPLOYEE",
    });
  });



  it.each(otherRoles)(
    "logs in an active $role user",
    async ({ id, email, role }) => {
      const login = await request(app)
        .post("/api/v1/auth/login")
        .send({ email, password });

      expect(login.status).toBe(200);
      expect(login.body.user.id).toBe(id);
      expect(login.body.user.role).toBe(role);

      expect(jwt.decode(login.body.accessToken)).toMatchObject({
        sub: id,
        role,
      });

      const me = await request(app)
        .get("/api/v1/auth/me")
        .set(
          "Authorization",
          `Bearer ${login.body.accessToken}`
        );

      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(id);
      expect(me.body.user.role).toBe(role);
    }
  );



  it("returns the authenticated employee from /me", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: activeEmail,
        password,
      });

    expect(login.status).toBe(200);

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set(
        "Authorization",
        `Bearer ${login.body.accessToken}`
      );

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(activeId);
    expect(response.body.user.email).toBe(activeEmail);
    expect(response.body.user.role).toBe("EMPLOYEE");

    expect(Object.keys(response.body.user).sort()).toEqual(
      ["id", "email", "fullName", "role"].sort()
    );
  });



  it("rejects a wrong password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: activeEmail,
        password: "incorrect-password",
      });

    expect(response.status).toBe(401);
  });

  it("rejects an unknown user", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: `missing-${randomUUID()}@example.invalid`,
        password,
      });

    expect(response.status).toBe(401);
  });

  it("rejects an inactive employee", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: inactiveEmail,
        password,
      });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid login body", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: "not-an-email",
        password,
      });

    expect(response.status).toBe(400);
  });


  it("rejects missing Bearer tokens", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me");

    expect(response.status).toBe(401);
  });

  it("rejects invalid JWT tokens", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalid-token");

    expect(response.status).toBe(401);
  });

  it("rejects expired JWT tokens", async () => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT test configuration missing");
    }

    const expiredToken = jwt.sign(
      { role: "EMPLOYEE" },
      secret,
      {
        algorithm: "HS256",
        subject: activeId,
        issuer: "e-clearance-backend",
        audience: "e-clearance-api",
        expiresIn: -1,
      }
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
  });



  it("provides the trusted employee identity", async () => {
    const token = signAccessToken(activeId, "EMPLOYEE");

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(activeId);
    expect(response.body.user.role).toBe("EMPLOYEE");
  });

  it("rejects unsupported authorization headers", async () => {
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Basic invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects JWTs belonging to inactive users", async () => {
    const token = signAccessToken(inactiveId, "EMPLOYEE");

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("rejects JWTs belonging to nonexistent users", async () => {
    const token = signAccessToken(
      randomUUID(),
      "EMPLOYEE"
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("rejects JWTs with incorrect audience", async () => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT test configuration missing");
    }

    const token = jwt.sign(
      { role: "EMPLOYEE" },
      secret,
      {
        algorithm: "HS256",
        subject: activeId,
        issuer: "e-clearance-backend",
        audience: "wrong-audience",
        expiresIn: 900,
      }
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });


  it("rejects a token with a different database role", async () => {
    const token = signAccessToken(
      activeId,
      "SYSTEM_ADMIN"
    );

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
});
