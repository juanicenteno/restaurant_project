import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./schema.ts", // Donde vive tu diseño
  out: "./drizzle",          // Donde se guardarán las migraciones
  dialect: "postgresql",
  dbCredentials: {
    url: "postgres://admin:juani123@localhost:5432/sistema_restaurantes",
  },
});