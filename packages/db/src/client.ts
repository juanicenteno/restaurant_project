import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });
export type DB = typeof db;