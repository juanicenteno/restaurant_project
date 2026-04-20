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

  // Setear el restaurant_id para RLS
  await db.execute(sql`SET LOCAL app.current_restaurant_id = ${restaurantId}`);

  // Pasar el usuario al contexto para usarlo en las rutas
  c.set("user", session.user);
  c.set("restaurantId", restaurantId);

  await next();
});