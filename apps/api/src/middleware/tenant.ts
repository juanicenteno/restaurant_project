import { createMiddleware } from "hono/factory";
import { auth } from "../auth.js";
import { db } from "@repo/db/client";
import { sql } from "drizzle-orm";

export const tenantMiddleware = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "No autorizado" }, 401);
  }

  const restaurantId = session.user.restaurantId;

  if (!restaurantId) {
    return c.json({ error: "Usuario sin restaurante asignado" }, 403);
  }

  // Ejecutar el resto del pipeline dentro de una transacción de Drizzle para aislar set_config de forma segura
  let nextCalled = false;
  try {
    await db.transaction(async (tx) => {
      // Setear el restaurant_id para RLS de forma transaccional (is_local = true)
      await tx.execute(sql`SELECT set_config('app.current_restaurant_id', ${restaurantId}, true)`);

      // Pasar la instancia de transacción al contexto de Hono
      c.set("db", tx);
      c.set("user", session.user);
      c.set("restaurantId", restaurantId);

      nextCalled = true;
      await next();
    });
  } catch (error) {
    if (!nextCalled) {
      throw error;
    }
    throw error;
  }
});