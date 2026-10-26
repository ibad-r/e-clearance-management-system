
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

export const pool = new Pool({
  connectionString,
  max: 10,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle({ client: pool, schema });
