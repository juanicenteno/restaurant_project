import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const planTypeEnum = pgEnum("plan_type", ["free", "basic", "pro", "chain"]);

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  cuit: text("cuit"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  phone: text("phone"),
  email: text("email"),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  currency: text("currency").notNull().default("ARS"),
  plan: planTypeEnum("plan").notNull().default("free"),
  trialEndsAt: timestamp("trial_ends_at"),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});