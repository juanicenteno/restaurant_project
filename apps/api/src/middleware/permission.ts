import { createMiddleware } from "hono/factory"
import { rolePermissions } from "@repo/db/schema"
import { and, eq } from "drizzle-orm"
import type { AppVariables } from "../types.js"
import type { Permission } from "../config/permissions.js"

/**
 * Verifica en la base de datos si un rol tiene un permiso determinado.
 * Recibe el cliente/transacción dbClient para asegurar el correcto aislamiento de transacciones de RLS.
 */
export async function checkUserPermission(
  dbClient: any,
  role: string,
  permission: Permission
): Promise<boolean> {
  try {
    const result = await dbClient
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.role, role),
          eq(rolePermissions.permission, permission)
        )
      )
      .limit(1)

    return result.length > 0
  } catch (error) {
    console.error("Error al comprobar permisos del rol:", error)
    return false
  }
}

/**
 * Middleware factory para proteger rutas basándose en permisos granulares en el contexto de Hono.
 * Debe ejecutarse DESPUÉS del tenantMiddleware (que inyecta al usuario y la tx db en el contexto).
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user")
    const tx = c.get("db")
    
    if (!user) {
      return c.json({ error: "No autorizado. Usuario no cargado en el contexto." }, 401)
    }

    if (!tx) {
      return c.json({ error: "Error de configuración: Conexión de base de datos no cargada en el contexto." }, 500)
    }

    // Cast a CustomUser para acceder a las propiedades extendidas como role
    const userRole = (user as any).role
    if (!userRole) {
      return c.json({ error: "No tenés permiso: el rol del usuario es inválido o no existe." }, 403)
    }

    // Usar la transacción tx inyectada por tenantMiddleware
    const hasPermission = await checkUserPermission(tx, userRole, permission)
    if (!hasPermission) {
      return c.json({ error: `No tenés permiso para realizar esta acción. Se requiere el permiso: ${permission}` }, 403)
    }

    await next()
  })
}

/**
 * Middleware factory para proteger rutas requiriendo AL MENOS UNO de los permisos especificados.
 */
export function requireAnyPermission(permissions: Permission[]) {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const user = c.get("user")
    const tx = c.get("db")
    
    if (!user) {
      return c.json({ error: "No autorizado. Usuario no cargado en el contexto." }, 401)
    }

    if (!tx) {
      return c.json({ error: "Error de configuración: Conexión de base de datos no cargada en el contexto." }, 500)
    }

    const userRole = (user as any).role
    if (!userRole) {
      return c.json({ error: "No tenés permiso: el rol del usuario es inválido o no existe." }, 403)
    }

    let hasAny = false
    for (const perm of permissions) {
      const ok = await checkUserPermission(tx, userRole, perm)
      if (ok) {
        hasAny = true
        break
      }
    }

    if (!hasAny) {
      return c.json({ error: `No tenés permiso para realizar esta acción. Se requiere al menos uno de los siguientes permisos: ${permissions.join(", ")}` }, 403)
    }

    await next()
  })
}
