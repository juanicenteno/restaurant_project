import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

if (!process.env.DATABASE_URL) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    dotenv.config({ path: path.resolve(__dirname, "../../../apps/api/.env") });
  } catch (e) {
    dotenv.config();
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

const queryClient = postgres(connectionString);

export const db = drizzle(queryClient, { schema: { ...schema, ...relations } });
export type DB = typeof db;