
import { randomBytes, randomUUID } from "node:crypto";
import express, { type Express } from "express";
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
import { requireAuth } from "../../middleware/requireAuth";
import { requireRole } from "../../middleware/requireRole";

describe("Authentication integration", () => {
  const activeId = randomUUID();
  const inactiveId = randomUUID();
  const inactiveStudentId = randomUUID();
  const inactiveStudentEmail = `inactive-student-${inactiveStudentId}@example.invalid`;


  const otherRoles = (
    ["HR_OFFICER", "APPROVER", "SYSTEM_ADMIN", "STUDENT"] as const
  ).map((role) => ({
    role,
    id: randomUUID(),
    email:
      `fictional-${role.toLowerCase()}-${randomUUID()}@example.invalid`,
  }));

  const activeEmail = `fictional-${activeId}@example.invalid`;
  const inactiveEmail = `inactive-${inactiveId}@example.invalid`;
  const student = otherRoles.find((account) => account.role === "STUDENT")!;

  const password = randomBytes(24).toString("base64url");

  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalJwtSecret = process.env.JWT_SECRET;
  const originalTtl = process.env.JWT_ACCESS_TTL_SECONDS;

  let connection: TestDatabaseConnection | undefined;
  let app: Express;
  let appLoaded = false;
  const roleApp = express();
  roleApp.use(express.json());
  // Test-only endpoints exercise the shared middleware without adding Student APIs.
  for (const role of ["STUDENT", "EMPLOYEE"] as const) {
    roleApp.post(`/${role.toLowerCase()}-only`, requireAuth, requireRole(role), (req, res) => {
      res.json({ user: req.auth?.user, userId: req.auth?.userId, role: req.auth?.role });
    });
  }



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
        ($5, $6, $3, $7, 'EMPLOYEE', false),
        ($8, $9, $3, $10, 'STUDENT', false)`,
      [
        activeId,
        activeEmail,
        passwordHash,
        "Fictional Test Employee",
        inactiveId,
        inactiveEmail,
        "Inactive Fictional Employee",
        inactiveStudentId,
        inactiveStudentEmail,
        "Inactive Fictional Student",
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
              OR (id = $2 AND email = $4)
              OR (id = $5 AND email = $6)`,
          [
            activeId,
            inactiveId,
            activeEmail,
            inactiveEmail,
            inactiveStudentId,
            inactiveStudentEmail,
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
      expect(login.body).toEqual({
        accessToken: expect.any(String),
        tokenType: "Bearer",
        expiresIn: 900,
        user: { id, email, fullName: `Fictional ${role}`, role },
      });

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
      expect(me.body).toEqual({ user: login.body.user });
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

  it("accepts Student email login with the existing case normalization", async () => {
    const response = await request(app).post("/api/v1/auth/login")
      .send({ email: student.email.toUpperCase(), password });

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: student.id, email: student.email, role: "STUDENT" });
  });

  it.each([
    { name: "Employee wrong password", email: activeEmail, password: "wrong-password" },
    { name: "Student wrong password", email: student.email, password: "wrong-password" },
    { name: "unknown email", email: `missing-${randomUUID()}@example.invalid`, password },
    { name: "inactive Employee", email: inactiveEmail, password },
    { name: "inactive Student", email: inactiveStudentEmail, password },
  ])("returns the same safe error for $name", async ({ email, password }) => {
    const response = await request(app).post("/api/v1/auth/login").send({ email, password });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Invalid credentials" } });
  });

  it.each(["role", "userId", "studentId", "sapId"])("rejects login identity injection through %s", async (field) => {
    const response = await request(app).post("/api/v1/auth/login")
      .send({ email: student.email, password, [field]: field === "role" ? "EMPLOYEE" : activeId });

    expect(response.status).toBe(400);
    expect(response.body).not.toHaveProperty("accessToken");
  });

  it.each([
    { role: "STUDENT", id: student.id, target: "student", status: 200 },
    { role: "EMPLOYEE", id: activeId, target: "student", status: 403 },
    { role: "EMPLOYEE", id: activeId, target: "employee", status: 200 },
    { role: "STUDENT", id: student.id, target: "employee", status: 403 },
  ] as const)("enforces $role access to $target-only routes despite spoofed identity", async ({ role, id, target, status }) => {
    const spoofedId = id === activeId ? student.id : activeId;
    const response = await request(roleApp).post(`/${target}-only`)
      .query({ role: target.toUpperCase(), userId: spoofedId, studentId: spoofedId, sapId: "00099999" })
      .set("Authorization", `Bearer ${signAccessToken(id, role)}`)
      .set("X-User-Id", spoofedId)
      .set("X-Student-Id", spoofedId)
      .set("X-SAP-ID", "00099999")
      .set("X-Role", target.toUpperCase())
      .send({ role: target.toUpperCase(), userId: spoofedId, studentId: spoofedId, sapId: "00099999" });

    expect(response.status).toBe(status);
    if (status === 200) {
      expect(response.body).toMatchObject({ userId: id, role, user: { id, role } });
      expect(Object.keys(response.body.user).sort()).toEqual(["email", "fullName", "id", "role"]);
    } else {
      expect(response.body).toEqual({ error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
    }
  });

  it.each(["missing", "malformed", "invalid", "expired"] as const)(
    "rejects a %s JWT on Student-only routes despite client-supplied identity",
    async (kind) => {
      const response = request(roleApp).post("/student-only");
      if (kind === "malformed") {
        response.set("Authorization", "Bearer token extra");
      } else if (kind === "invalid") {
        response.set("Authorization", "Bearer invalid-token");
      } else if (kind === "expired") {
        const token = jwt.sign({ role: "STUDENT" }, process.env.JWT_SECRET!, {
          algorithm: "HS256", subject: student.id, issuer: "e-clearance-backend",
          audience: "e-clearance-api", expiresIn: -1,
        });
        response.set("Authorization", `Bearer ${token}`);
      }
      const result = await response.send({ role: "STUDENT", userId: student.id, studentId: student.id, sapId: "00099999" });

      expect(result.status).toBe(401);
      expect(result.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } });
      expect(result.body).not.toHaveProperty("user");
    },
  );

  it("rejects Student access to the mounted Employee API", async () => {
    const response = await request(app).get("/api/v1/employee/profile")
      .set("Authorization", `Bearer ${signAccessToken(student.id, "STUDENT")}`)
      .query({ role: "EMPLOYEE", userId: activeId, studentId: activeId });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("returns the database Student identity from /me despite spoofed query and headers", async () => {
    const response = await request(app).get("/api/v1/auth/me")
      .query({ role: "SYSTEM_ADMIN", userId: activeId, studentId: activeId, sapId: "00099999" })
      .set("X-User-Id", activeId)
      .set("X-Student-Id", activeId)
      .set("X-SAP-ID", "00099999")
      .set("X-Role", "SYSTEM_ADMIN")
      .set("Authorization", `Bearer ${signAccessToken(student.id, "STUDENT")}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: {
      id: student.id, email: student.email, fullName: "Fictional STUDENT", role: "STUDENT",
    } });
  });

  it.each(["Bearer", "Bearer token extra", "Bearer ", "Basic token", "Bearer a.b.c"])(
    "rejects malformed authorization %s", async (authorization) => {
      const response = await request(app).get("/api/v1/auth/me").set("Authorization", authorization);
      expect(response.status).toBe(401);
    },
  );

  it("rejects an inactive Student's JWT", async () => {
    const response = await request(app).get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${signAccessToken(inactiveStudentId, "STUDENT")}`);
    expect(response.status).toBe(401);
  });

  it("rejects an expired Student JWT", async () => {
    const token = jwt.sign({ role: "STUDENT" }, process.env.JWT_SECRET!, {
      algorithm: "HS256", subject: student.id, issuer: "e-clearance-backend",
      audience: "e-clearance-api", expiresIn: -1,
    });
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it.each([
    { id: student.id, role: "EMPLOYEE" },
    { id: student.id, role: "SYSTEM_ADMIN" },
    { id: activeId, role: "STUDENT" },
  ] as const)("rejects a signed $role claim that disagrees with the database user", async ({ id, role }) => {
    const response = await request(app).get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${signAccessToken(id, role)}`);
    expect(response.status).toBe(401);
  });

  it("rejects a Student JWT signed with another key", async () => {
    const token = jwt.sign({ role: "STUDENT" }, randomBytes(32).toString("base64url"), {
      algorithm: "HS256", subject: student.id, issuer: "e-clearance-backend",
      audience: "e-clearance-api", expiresIn: 900,
    });
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });

  it.each(["role", "sub"])("rejects a JWT with a client-modified %s", async (field) => {
    const [header, payload, signature] = signAccessToken(student.id, "STUDENT").split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    claims[field] = field === "role" ? "EMPLOYEE" : activeId;
    const token = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`;
    const response = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(401);
  });
});
