import { env } from './env.js'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import crypto from 'crypto'
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { auth } from './auth.js'
import type { AppVariables } from './types.js'
import { db } from '@repo/db/client'
import { restaurants, sections, tables, categories, products, user, orders, orderItems, payments } from '@repo/db/schema'
import { eq, sql, and, inArray } from 'drizzle-orm'
import { tenantMiddleware } from './middleware/tenant.js'
import { requirePermission, requireAnyPermission } from './middleware/permission.js'
import { createNodeWebSocket } from '@hono/node-ws'

const app = new Hono<{ Variables: AppVariables }>()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

export interface RealtimeEvent {
  type: string
  payload: unknown
  timestamp: string
}

// Mapa en memoria de conexiones WebSocket activas agrupadas por tenant (restaurantId)
const restaurantConnections = new Map<string, Set<any>>()

export function broadcastToRestaurant(restaurantId: string | undefined | null, event: RealtimeEvent) {
  if (!restaurantId) return
  const connections = restaurantConnections.get(restaurantId)
  if (connections && connections.size > 0) {
    const payloadStr = JSON.stringify(event)
    connections.forEach((ws) => {
      try {
        ws.send(payloadStr)
      } catch (err) {
        console.error("Error al transmitir mensaje por WebSocket:", err)
      }
    })
  }
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

app.use('*', logger())

const allowedOrigins = [
  'http://localhost:3000',
  env.CLIENT_URL,
  env.LOCAL_NETWORK_ORIGIN,
].filter(Boolean) as string[]

app.use('*', cors({
  origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposeHeaders: ['Content-Length', 'Set-Cookie'],
  maxAge: 600,
  credentials: true,
}))

app.onError((err, c) => {
  console.error(`${err}`)
  if (process.env.NODE_ENV === 'production') {
    return c.text('Error interno del servidor', 500)
  }
  return c.json({ 
    error: 'Error interno del servidor', 
    message: err.message, 
    stack: err.stack 
  }, 500)
})

app.get('/', (c) => {
  return c.json({
    message: 'Sistema de Gestión para Restaurantes API v1.0',
    status: 'online'
  })
})

function slugify(text: string) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    + '-' + Math.random().toString(36).substring(2, 7)
}

app.post('/api/auth/register-restaurant', async (c) => {
  const body = await c.req.json()
  const { restaurantName, email, password, ownerName } = body

  if (!restaurantName || !email || !password || !ownerName) {
    return c.json({ error: "Todos los campos son requeridos" }, 400)
  }

  let newRestaurant = null
  try {
    const slug = slugify(restaurantName)
    const [restaurant] = await db.insert(restaurants).values({
      name: restaurantName,
      slug,
    }).returning()
    newRestaurant = restaurant

    const userResponse = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: ownerName,
        role: 'owner',
        restaurantId: restaurant.id,
      }
    })

    return c.json({
      success: true,
      restaurant: newRestaurant,
      user: userResponse.user
    })
  } catch (err: any) {
    console.error("Error en registro de restaurante:", err)

    if (newRestaurant) {
      try {
        await db.delete(restaurants).where(eq(restaurants.id, (newRestaurant as any).id))
      } catch (deleteErr) {
        console.error("Error al limpiar restaurante tras fallo:", deleteErr)
      }
    }

    let errorMessage = err.message || "No se pudo registrar el restaurante"
    if (err.code === "23505" || errorMessage.toLowerCase().includes("unique constraint") || errorMessage.toLowerCase().includes("already exists")) {
      errorMessage = "El correo electrónico ya está registrado."
    }

    return c.json({ error: errorMessage }, 400)
  }
})

app.get('/api/test-permission/payments', tenantMiddleware, requirePermission('manage_payments'), (c) => {
  return c.json({ message: "Acceso concedido a Pagos (manage_payments)" })
})

app.get('/api/test-permission/orders', tenantMiddleware, requirePermission('manage_orders'), (c) => {
  return c.json({ message: "Acceso concedido a Pedidos (manage_orders)" })
})

app.get('/api/test-concurrency', tenantMiddleware, async (c) => {
  const tx = c.get("db")
  const reqRestaurantId = c.get("restaurantId")
  const delay = Number(c.req.query('delay') || '0')

  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay))
  }

  const [rlsResult] = await tx.execute(sql`SELECT current_setting('app.current_restaurant_id', true) AS rls_id`)
  const dbRlsId = rlsResult?.rls_id

  return c.json({
    requestedRestaurantId: reqRestaurantId,
    dbRlsId: dbRlsId,
    matches: reqRestaurantId === dbRlsId
  })
})

// GET /api/sections - Listar secciones (accesible para gerencia o mozos/mesas)
app.get('/api/sections', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_tables', 'manage_payments', 'manage_orders']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")

  try {
    const list = await tx
      .select()
      .from(sections)
      .where(eq(sections.restaurantId, restaurantId))
      .orderBy(sections.displayOrder)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al obtener secciones:", err)
    return c.json({ error: "No se pudieron obtener las secciones." }, 500)
  }
})

// POST /api/sections - Crear sección
app.post('/api/sections', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { name } = await c.req.json()

  if (!name || name.trim() === "") {
    return c.json({ error: "El nombre de la sección es requerido." }, 400)
  }

  try {
    const [newSection] = await tx
      .insert(sections)
      .values({
        restaurantId,
        name: name.trim(),
      })
      .returning()

    return c.json(newSection, 201)
  } catch (err: any) {
    console.error("Error al crear sección:", err)
    return c.json({ error: "No se pudo crear la sección." }, 500)
  }
})

// PUT /api/sections/:id - Editar sección
app.put('/api/sections/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const sectionId = c.req.param("id")
  const { name } = await c.req.json()

  if (!name || name.trim() === "") {
    return c.json({ error: "El nombre de la sección es requerido." }, 400)
  }

  try {
    const [updatedSection] = await tx
      .update(sections)
      .set({
        name: name.trim(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sections.id, sectionId),
          eq(sections.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!updatedSection) {
      return c.json({ error: "Sección no encontrada o no pertenece a tu restaurante." }, 404)
    }

    return c.json(updatedSection)
  } catch (err: any) {
    console.error("Error al actualizar sección:", err)
    return c.json({ error: "No se pudo actualizar la sección." }, 500)
  }
})

// DELETE /api/sections/:id - Eliminar sección
app.delete('/api/sections/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const sectionId = c.req.param("id")

  try {
    // 1. Validar que la sección pertenezca al restaurante
    const [section] = await tx
      .select()
      .from(sections)
      .where(
        and(
          eq(sections.id, sectionId),
          eq(sections.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!section) {
      return c.json({ error: "Sección no encontrada o no pertenece a tu restaurante." }, 404)
    }

    // 2. Validar que no tenga mesas asociadas
    const associatedTables = await tx
      .select()
      .from(tables)
      .where(
        and(
          eq(tables.sectionId, sectionId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (associatedTables.length > 0) {
      return c.json({ 
        error: "No se puede eliminar la sección porque tiene mesas asociadas. Por favor, reasigna o elimina las mesas primero." 
      }, 400)
    }

    // 3. Eliminar sección
    await tx
      .delete(sections)
      .where(
        and(
          eq(sections.id, sectionId),
          eq(sections.restaurantId, restaurantId)
        )
      )

    return c.json({ success: true, message: "Sección eliminada correctamente." })
  } catch (err: any) {
    console.error("Error al eliminar sección:", err)
    return c.json({ error: "No se pudo eliminar la sección." }, 500)
  }
})

// GET /api/tables - Listar mesas (accesible para gerencia o mozos/mesas)
app.get('/api/tables', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_tables', 'manage_payments', 'manage_orders']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const sectionIdParam = c.req.query('sectionId')

  try {
    const conditions = [eq(tables.restaurantId, restaurantId)]
    if (sectionIdParam) {
      conditions.push(eq(tables.sectionId, sectionIdParam))
    }

    const list = await tx
      .select({
        id: tables.id,
        restaurantId: tables.restaurantId,
        sectionId: tables.sectionId,
        sectionName: sections.name,
        number: tables.number,
        capacity: tables.capacity,
        posX: tables.posX,
        posY: tables.posY,
        width: tables.width,
        height: tables.height,
        shape: tables.shape,
        status: tables.status,
        isActive: tables.isActive,
        createdAt: tables.createdAt,
        updatedAt: tables.updatedAt,
      })
      .from(tables)
      .innerJoin(sections, eq(tables.sectionId, sections.id))
      .where(and(...conditions))
      .orderBy(tables.number)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al obtener mesas:", err)
    return c.json({ error: "No se pudieron obtener las mesas." }, 500)
  }
})

// POST /api/tables - Crear mesa
app.post('/api/tables', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { number, capacity, sectionId, posX, posY, width, height, shape } = await c.req.json()

  if (!number || number.trim() === "") {
    return c.json({ error: "El número/nombre de la mesa es requerido." }, 400)
  }

  const parsedCapacity = Number(capacity)
  if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
    return c.json({ error: "La capacidad de la mesa debe ser un número mayor a 0." }, 400)
  }

  if (!sectionId) {
    return c.json({ error: "La sección de la mesa es requerida." }, 400)
  }

  try {
    // 1. Validar que la sección pertenezca al restaurante
    const [section] = await tx
      .select()
      .from(sections)
      .where(
        and(
          eq(sections.id, sectionId),
          eq(sections.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!section) {
      return c.json({ error: "La sección seleccionada no existe o no pertenece a tu restaurante." }, 400)
    }

    // 2. Validar que el número de mesa no esté duplicado en el restaurante
    const [existingTable] = await tx
      .select()
      .from(tables)
      .where(
        and(
          eq(tables.number, number.trim()),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (existingTable) {
      return c.json({ error: `La mesa número "${number.trim()}" ya existe en este restaurante.` }, 400)
    }

    // 3. Crear mesa
    const [newTable] = await tx
      .insert(tables)
      .values({
        restaurantId,
        sectionId,
        number: number.trim(),
        capacity: parsedCapacity,
        status: "free",
        ...(posX !== undefined && { posX: String(posX) }),
        ...(posY !== undefined && { posY: String(posY) }),
        ...(width !== undefined && { width: String(width) }),
        ...(height !== undefined && { height: String(height) }),
        ...(shape !== undefined && { shape }),
      })
      .returning()

    broadcastToRestaurant(restaurantId, {
      type: "table:created",
      payload: newTable,
      timestamp: new Date().toISOString(),
    })

    return c.json(newTable, 201)
  } catch (err: any) {
    console.error("Error al crear mesa:", err)
    return c.json({ error: "No se pudo crear la mesa." }, 500)
  }
})

// PUT /api/tables/:id - Editar mesa
app.put('/api/tables/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const tableId = c.req.param("id")
  const { number, capacity, sectionId, status, posX, posY, width, height, shape } = await c.req.json()

  if (number !== undefined && (!number || number.trim() === "")) {
    return c.json({ error: "El número/nombre de la mesa no puede estar vacío." }, 400)
  }

  let parsedCapacity
  if (capacity !== undefined) {
    parsedCapacity = Number(capacity)
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return c.json({ error: "La capacidad de la mesa debe ser un número mayor a 0." }, 400)
    }
  }

  try {
    // 1. Validar que la mesa pertenezca al restaurante
    const [tableToUpdate] = await tx
      .select()
      .from(tables)
      .where(
        and(
          eq(tables.id, tableId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!tableToUpdate) {
      return c.json({ error: "Mesa no encontrada o no pertenece a tu restaurante." }, 404)
    }

    // 2. Si se cambia de sección, validar que la nueva sección pertenezca al restaurante
    if (sectionId && sectionId !== tableToUpdate.sectionId) {
      const [section] = await tx
        .select()
        .from(sections)
        .where(
          and(
            eq(sections.id, sectionId),
            eq(sections.restaurantId, restaurantId)
          )
        )
        .limit(1)

      if (!section) {
        return c.json({ error: "La sección seleccionada no existe o no pertenece a tu restaurante." }, 400)
      }
    }

    // 3. Si se cambia el número de mesa, validar unicidad
    if (number && number.trim() !== tableToUpdate.number) {
      const [existingTable] = await tx
        .select()
        .from(tables)
        .where(
          and(
            eq(tables.number, number.trim()),
            eq(tables.restaurantId, restaurantId)
          )
        )
        .limit(1)

      if (existingTable) {
        return c.json({ error: `La mesa número "${number.trim()}" ya existe en este restaurante.` }, 400)
      }
    }

    // 4. Actualizar mesa
    const [updatedTable] = await tx
      .update(tables)
      .set({
        ...(number !== undefined && { number: number.trim() }),
        ...(capacity !== undefined && { capacity: parsedCapacity }),
        ...(sectionId !== undefined && { sectionId }),
        ...(status !== undefined && { status }),
        ...(posX !== undefined && { posX: String(posX) }),
        ...(posY !== undefined && { posY: String(posY) }),
        ...(width !== undefined && { width: String(width) }),
        ...(height !== undefined && { height: String(height) }),
        ...(shape !== undefined && { shape }),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(tables.id, tableId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .returning()

    broadcastToRestaurant(restaurantId, {
      type: "table:updated",
      payload: updatedTable,
      timestamp: new Date().toISOString(),
    })

    return c.json(updatedTable)
  } catch (err: any) {
    console.error("Error al actualizar mesa:", err)
    return c.json({ error: "No se pudo actualizar la mesa." }, 500)
  }
})

// DELETE /api/tables/:id - Eliminar mesa
app.delete('/api/tables/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const tableId = c.req.param("id")

  try {
    const [deletedTable] = await tx
      .delete(tables)
      .where(
        and(
          eq(tables.id, tableId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!deletedTable) {
      return c.json({ error: "Mesa no encontrada o no pertenece a tu restaurante." }, 404)
    }

    broadcastToRestaurant(restaurantId, {
      type: "table:deleted",
      payload: { id: tableId, sectionId: deletedTable.sectionId },
      timestamp: new Date().toISOString(),
    })

    return c.json({ success: true, message: "Mesa eliminada correctamente." })
  } catch (err: any) {
    console.error("Error al eliminar mesa:", err)
    return c.json({ error: "No se pudo eliminar la mesa." }, 500)
  }
})

// GET /api/categories - Listar categorías (accesible para gerencia y mozos)
app.get('/api/categories', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_orders', 'manage_payments', 'manage_tables']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")

  try {
    const list = await tx
      .select()
      .from(categories)
      .where(eq(categories.restaurantId, restaurantId))
      .orderBy(categories.displayOrder)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al obtener categorías:", err)
    return c.json({ error: "No se pudieron obtener las categorías." }, 500)
  }
})

// POST /api/categories - Crear categoría
app.post('/api/categories', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { name, description, displayOrder, station } = await c.req.json()

  if (!name || name.trim() === "") {
    return c.json({ error: "El nombre de la categoría es requerido." }, 400)
  }

  try {
    // Calcular el siguiente display_order si no se provee
    let orderToSet = displayOrder
    if (orderToSet === undefined) {
      const [maxOrderResult] = await tx
        .select({ maxOrder: sql<number>`max(${categories.displayOrder})` })
        .from(categories)
        .where(eq(categories.restaurantId, restaurantId))

      orderToSet = (maxOrderResult?.maxOrder !== null && maxOrderResult?.maxOrder !== undefined) 
        ? maxOrderResult.maxOrder + 1 
        : 0
    }

    const [newCategory] = await tx
      .insert(categories)
      .values({
        restaurantId,
        name: name.trim(),
        description: description ? description.trim() : null,
        station: station === "bar" ? "bar" : "kitchen",
        displayOrder: Number(orderToSet),
      })
      .returning()

    return c.json(newCategory, 201)
  } catch (err: any) {
    console.error("Error al crear categoría:", err)
    return c.json({ error: "No se pudo crear la categoría." }, 500)
  }
})

// PUT /api/categories/reorder - Reordenar categorías
app.put('/api/categories/reorder', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { orders } = await c.req.json()

  if (!orders || !Array.isArray(orders)) {
    return c.json({ error: "Se requiere un array 'orders' con los nuevos órdenes." }, 400)
  }

  try {
    for (const item of orders) {
      if (!item.id || item.displayOrder === undefined) continue

      await tx
        .update(categories)
        .set({
          displayOrder: Number(item.displayOrder),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(categories.id, item.id),
            eq(categories.restaurantId, restaurantId)
          )
        )
    }

    return c.json({ success: true, message: "Categorías reordenadas correctamente." })
  } catch (err: any) {
    console.error("Error al reordenar categorías:", err)
    return c.json({ error: "No se pudieron reordenar las categorías." }, 500)
  }
})

// PUT /api/categories/:id - Editar categoría
app.put('/api/categories/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const categoryId = c.req.param("id")
  const { name, description, displayOrder, station } = await c.req.json()

  if (name !== undefined && (!name || name.trim() === "")) {
    return c.json({ error: "El nombre de la categoría no puede estar vacío." }, 400)
  }

  try {
    const [updatedCategory] = await tx
      .update(categories)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(station !== undefined && { station: station === "bar" ? "bar" : "kitchen" }),
        ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!updatedCategory) {
      return c.json({ error: "Categoría no encontrada o no pertenece a tu restaurante." }, 404)
    }

    return c.json(updatedCategory)
  } catch (err: any) {
    console.error("Error al actualizar categoría:", err)
    return c.json({ error: "No se pudo actualizar la categoría." }, 500)
  }
})

// DELETE /api/categories/:id - Eliminar categoría
app.delete('/api/categories/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const categoryId = c.req.param("id")

  try {
    // 1. Validar que la categoría pertenezca al restaurante
    const [category] = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!category) {
      return c.json({ error: "Categoría no encontrada o no pertenece a tu restaurante." }, 404)
    }

    // 2. Validar que no tenga productos asociados
    const associatedProducts = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.categoryId, categoryId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (associatedProducts.length > 0) {
      return c.json({ 
        error: "No se puede eliminar la categoría porque tiene productos asociados. Por favor, reasigna o elimina los productos primero." 
      }, 400)
    }

    // 3. Eliminar categoría
    await tx
      .delete(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        )
      )

    return c.json({ success: true, message: "Categoría eliminada correctamente." })
  } catch (err: any) {
    console.error("Error al eliminar categoría:", err)
    return c.json({ error: "No se pudo eliminar la categoría." }, 500)
  }
})

// GET /api/products - Listar productos (accesible para gerencia y mozos)
app.get('/api/products', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_orders', 'manage_payments', 'manage_tables']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const categoryIdParam = c.req.query('categoryId')

  try {
    const conditions = [eq(products.restaurantId, restaurantId)]
    if (categoryIdParam) {
      conditions.push(eq(products.categoryId, categoryIdParam))
    }

    const list = await tx
      .select({
        id: products.id,
        restaurantId: products.restaurantId,
        categoryId: products.categoryId,
        categoryName: categories.name,
        name: products.name,
        description: products.description,
        imageUrl: products.imageUrl,
        price: products.price,
        estimatedTime: products.prepTimeMin,
        displayOrder: products.displayOrder,
        available: products.isAvailable,
        createdAt: products.createdAt,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(products.categoryId, products.displayOrder)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al obtener productos:", err)
    return c.json({ error: "No se pudieron obtener los productos." }, 500)
  }
})

// POST /api/products - Crear producto
app.post('/api/products', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { name, description, price, categoryId, imageUrl, estimatedTime, displayOrder } = await c.req.json()

  if (!name || name.trim() === "") {
    return c.json({ error: "El nombre del producto es requerido." }, 400)
  }

  if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
    return c.json({ error: "El precio debe ser un número válido mayor o igual a 0." }, 400)
  }

  if (!categoryId) {
    return c.json({ error: "La categoría del producto es requerida." }, 400)
  }

  try {
    // 1. Validar que la categoría pertenezca al restaurante
    const [category] = await tx
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, categoryId),
          eq(categories.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!category) {
      return c.json({ error: "La categoría seleccionada no existe o no pertenece a tu restaurante." }, 400)
    }

    // 2. Calcular el siguiente displayOrder si no se provee
    let orderToSet = displayOrder
    if (orderToSet === undefined) {
      const [maxOrderResult] = await tx
        .select({ maxOrder: sql<number>`max(${products.displayOrder})` })
        .from(products)
        .where(
          and(
            eq(products.categoryId, categoryId),
            eq(products.restaurantId, restaurantId)
          )
        )

      orderToSet = (maxOrderResult?.maxOrder !== null && maxOrderResult?.maxOrder !== undefined)
        ? maxOrderResult.maxOrder + 1
        : 0
    }

    const [newProduct] = await tx
      .insert(products)
      .values({
        restaurantId,
        categoryId,
        name: name.trim(),
        description: description ? description.trim() : null,
        price: String(Number(price).toFixed(2)),
        imageUrl: imageUrl ? imageUrl.trim() : null,
        prepTimeMin: estimatedTime ? Number(estimatedTime) : null,
        displayOrder: Number(orderToSet),
        isAvailable: true,
      })
      .returning()

    return c.json({
      ...newProduct,
      available: newProduct.isAvailable,
      estimatedTime: newProduct.prepTimeMin,
    }, 201)
  } catch (err: any) {
    console.error("Error al crear producto:", err)
    return c.json({ error: "No se pudo crear el producto." }, 500)
  }
})

// PUT /api/products/:id - Editar producto
app.put('/api/products/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const productId = c.req.param("id")
  const { name, description, price, categoryId, imageUrl, estimatedTime, displayOrder, available } = await c.req.json()

  if (name !== undefined && (!name || name.trim() === "")) {
    return c.json({ error: "El nombre del producto no puede estar vacío." }, 400)
  }

  if (price !== undefined && (isNaN(Number(price)) || Number(price) < 0)) {
    return c.json({ error: "El precio debe ser un número válido mayor o igual a 0." }, 400)
  }

  try {
    // 1. Validar que el producto pertenezca al restaurante
    const [productToUpdate] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!productToUpdate) {
      return c.json({ error: "Producto no encontrado o no pertenece a tu restaurante." }, 404)
    }

    // 2. Si se cambia la categoría, validar que pertenezca al restaurante
    if (categoryId && categoryId !== productToUpdate.categoryId) {
      const [category] = await tx
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.restaurantId, restaurantId)
          )
        )
        .limit(1)

      if (!category) {
        return c.json({ error: "La categoría seleccionada no existe o no pertenece a tu restaurante." }, 400)
      }
    }

    // 3. Actualizar producto
    const [updatedProduct] = await tx
      .update(products)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(price !== undefined && { price: String(Number(price).toFixed(2)) }),
        ...(categoryId !== undefined && { categoryId }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl ? imageUrl.trim() : null }),
        ...(estimatedTime !== undefined && { prepTimeMin: estimatedTime ? Number(estimatedTime) : null }),
        ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
        ...(available !== undefined && { isAvailable: Boolean(available) }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .returning()

    return c.json({
      ...updatedProduct,
      available: updatedProduct.isAvailable,
      estimatedTime: updatedProduct.prepTimeMin,
    })
  } catch (err: any) {
    console.error("Error al actualizar producto:", err)
    return c.json({ error: "No se pudo actualizar el producto." }, 500)
  }
})

// PATCH /api/products/:id/availability - Toggle disponibilidad
app.patch('/api/products/:id/availability', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const productId = c.req.param("id")
  const { available } = await c.req.json()

  if (available === undefined) {
    return c.json({ error: "El campo 'available' es requerido." }, 400)
  }

  try {
    const [updatedProduct] = await tx
      .update(products)
      .set({
        isAvailable: Boolean(available),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!updatedProduct) {
      return c.json({ error: "Producto no encontrado o no pertenece a tu restaurante." }, 404)
    }

    return c.json({
      ...updatedProduct,
      available: updatedProduct.isAvailable,
    })
  } catch (err: any) {
    console.error("Error al actualizar disponibilidad:", err)
    return c.json({ error: "No se pudo actualizar la disponibilidad." }, 500)
  }
})

// DELETE /api/products/:id - Eliminar producto
app.delete('/api/products/:id', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const productId = c.req.param("id")

  try {
    // NOTA DE FUTURO: Una vez que implementemos la tabla 'orders' o 'order_items', 
    // deberemos validar aquí que este producto no tenga pedidos históricos asociados.
    // De lo contrario, eliminar el producto rompería la integridad de los reportes.
    // Por ahora, al no existir 'orders', permitimos la eliminación directa.

    const [deletedProduct] = await tx
      .delete(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!deletedProduct) {
      return c.json({ error: "Producto no encontrado o no pertenece a tu restaurante." }, 404)
    }

    return c.json({ success: true, message: "Producto eliminado correctamente." })
  } catch (err: any) {
    console.error("Error al eliminar producto:", err)
    return c.json({ error: "No se pudo eliminar el producto." }, 500)
  }
})

// POST /api/uploads/product-image - Subir imagen de producto a Cloudflare R2
app.post('/api/uploads/product-image', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const restaurantId = c.get("restaurantId")

  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No se subió ningún archivo o el formato no es válido." }, 400)
    }

    // Validar tipo de archivo (solo imágenes: jpg, jpeg, png, webp)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP)." }, 400)
    }

    // Validar tamaño máximo (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return c.json({ error: "El archivo supera el tamaño máximo de 5MB." }, 400)
    }

    // Generar una clave única para R2 bajo la estructura restaurants/{restaurantId}/products/{uuid}-{nombre-archivo-sanitizado}
    const randomUuid = crypto.randomUUID()
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `restaurants/${restaurantId}/products/${randomUuid}-${safeFileName}`

    // Convertir archivo a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Subir a Cloudflare R2
    await s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    // Retornar la URL pública construida con R2_PUBLIC_URL
    const imageUrl = `${env.R2_PUBLIC_URL}/${key}`
    return c.json({ imageUrl })
  } catch (err: any) {
    console.error("Error al subir archivo a R2:", err)
    return c.json({ error: "No se pudo subir la imagen al servidor." }, 500)
  }
})

// GET /api/restaurant/config - Obtener configuración del local (accesible para gerencia y personal operativo)
app.get('/api/restaurant/config', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_orders', 'manage_tables', 'manage_payments']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")

  try {
    const [restaurant] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1)

    if (!restaurant) {
      return c.json({ error: "Restaurante no encontrado." }, 404)
    }

    const settingsObj = (restaurant.settings as Record<string, any>) || {}

    return c.json({
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      logoUrl: restaurant.logoUrl,
      address: restaurant.address,
      cuit: restaurant.cuit,
      currency: restaurant.currency,
      phone: restaurant.phone,
      openingHours: settingsObj.openingHours || null,
      mpConnectedAt: restaurant.mpConnectedAt || null,
      mpUserId: restaurant.mpUserId || null,
      createdAt: restaurant.createdAt,
      updatedAt: restaurant.updatedAt,
    })
  } catch (err: any) {
    console.error("Error al obtener configuración del restaurante:", err)
    return c.json({ error: "No se pudo obtener la configuración." }, 500)
  }
})

// PUT /api/restaurant/config - Actualizar configuración del local
app.put('/api/restaurant/config', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const { name, logoUrl, address, cuit, currency, phone, openingHours } = await c.req.json()

  try {
    const [currentRestaurant] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1)

    if (!currentRestaurant) {
      return c.json({ error: "Restaurante no encontrado." }, 404)
    }

    const currentSettings = (currentRestaurant.settings as Record<string, any>) || {}
    const updatedSettings = {
      ...currentSettings,
      ...(openingHours !== undefined && { openingHours }),
    }

    const [updatedRestaurant] = await tx
      .update(restaurants)
      .set({
        ...(name !== undefined && name.trim() !== "" && { name: name.trim() }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl ? logoUrl.trim() : null }),
        ...(address !== undefined && { address: address ? address.trim() : null }),
        ...(cuit !== undefined && { cuit: cuit ? cuit.trim() : null }),
        ...(currency !== undefined && { currency: currency ? currency.trim() : "ARS" }),
        ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
        settings: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))
      .returning()

    const finalSettings = (updatedRestaurant.settings as Record<string, any>) || {}

    return c.json({
      id: updatedRestaurant.id,
      name: updatedRestaurant.name,
      slug: updatedRestaurant.slug,
      logoUrl: updatedRestaurant.logoUrl,
      address: updatedRestaurant.address,
      cuit: updatedRestaurant.cuit,
      currency: updatedRestaurant.currency,
      phone: updatedRestaurant.phone,
      openingHours: finalSettings.openingHours || null,
      createdAt: updatedRestaurant.createdAt,
      updatedAt: updatedRestaurant.updatedAt,
    })
  } catch (err: any) {
    console.error("Error al actualizar configuración del restaurante:", err)
    return c.json({ error: "No se pudo actualizar la configuración." }, 500)
  }
})

// ==========================================
// MERCADO PAGO OAUTH ENDPOINTS (Tarea 36)
// ==========================================

// GET /api/mercadopago/oauth/connect - Conectar cuenta de Mercado Pago
app.get('/api/mercadopago/oauth/connect', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const restaurantId = c.get("restaurantId")

  // STUB TEMPORAL PARA DESARROLLO / TEST:
  // Si MP_USE_REAL_OAUTH es false (por defecto), simulamos la conexión guardando directamente
  // el MP_TEST_ACCESS_TOKEN de prueba en la base de datos sin requerir activación real en producción.
  // El flujo OAuth real sigue implementado más abajo y se activará cambiando MP_USE_REAL_OAUTH=true.
  if (!env.MP_USE_REAL_OAUTH) {
    const testAccessToken = env.MP_TEST_ACCESS_TOKEN || env.MP_CLIENT_SECRET
    if (!testAccessToken) {
      return c.json({ error: "No se configuró MP_TEST_ACCESS_TOKEN en el archivo .env" }, 500)
    }

    await db
      .update(restaurants)
      .set({
        mpAccessToken: testAccessToken,
        mpRefreshToken: null,
        mpUserId: 'test-connection',
        mpConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))

    console.log(`🔌 [Mercado Pago Stub] Cuenta de prueba conectada instantáneamente para restaurante ${restaurantId}`)
    return c.redirect(`${env.CLIENT_URL}/admin/settings?mp_success=true&mode=test`)
  }

  // FLUJO OAUTH REAL (para cuando existan credenciales de producción activadas):
  if (!env.MP_CLIENT_ID || !env.MP_REDIRECT_URI) {
    return c.json({ error: "Mercado Pago no está configurado en las variables de entorno (MP_CLIENT_ID / MP_REDIRECT_URI)." }, 500)
  }

  const stateObj = { restaurantId, nonce: crypto.randomUUID() }
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64url')
  const authUrl = `https://auth.mercadopago.com/authorization?client_id=${env.MP_CLIENT_ID}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(env.MP_REDIRECT_URI)}&state=${state}`

  return c.redirect(authUrl)
})

// GET /api/mercadopago/oauth/callback - Callback donde MP devuelve code y state
app.get('/api/mercadopago/oauth/callback', async (c) => {
  const code = c.req.query('code')
  const stateParam = c.req.query('state')

  if (!code || !stateParam) {
    return c.redirect(`${env.CLIENT_URL}/admin/settings?mp_error=auth_cancelled`)
  }

  try {
    const stateJson = Buffer.from(stateParam, 'base64url').toString('utf-8')
    const { restaurantId } = JSON.parse(stateJson)

    if (!restaurantId) {
      throw new Error("Estado OAuth inválido")
    }

    // Intercambiar code por access_token y refresh_token con la API de Mercado Pago
    const tokenRes = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_secret: env.MP_CLIENT_SECRET || '',
        client_id: env.MP_CLIENT_ID || '',
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.MP_REDIRECT_URI || '',
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Error al intercambiar token con MP:", tokenData)
      return c.redirect(`${env.CLIENT_URL}/admin/settings?mp_error=${encodeURIComponent(tokenData.message || "token_exchange_failed")}`)
    }

    // Guardar tokens y mpUserId en la fila del restaurante
    await db
      .update(restaurants)
      .set({
        mpAccessToken: tokenData.access_token,
        mpRefreshToken: tokenData.refresh_token || null,
        mpUserId: String(tokenData.user_id),
        mpConnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))

    return c.redirect(`${env.CLIENT_URL}/admin/settings?mp_success=true`)
  } catch (err: any) {
    console.error("Error en callback OAuth Mercado Pago:", err)
    return c.redirect(`${env.CLIENT_URL}/admin/settings?mp_error=${encodeURIComponent(err.message || "callback_failed")}`)
  }
})

// POST /api/mercadopago/oauth/disconnect - Desconectar cuenta de Mercado Pago
app.post('/api/mercadopago/oauth/disconnect', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")

  try {
    await tx
      .update(restaurants)
      .set({
        mpAccessToken: null,
        mpRefreshToken: null,
        mpUserId: null,
        mpConnectedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId))

    return c.json({ success: true, message: "Cuenta de Mercado Pago desconectada correctamente." })
  } catch (err: any) {
    console.error("Error al desconectar Mercado Pago:", err)
    return c.json({ error: "No se pudo desconectar la cuenta de Mercado Pago." }, 500)
  }
})

// RUTAS PUENTE MERCADO PAGO RETURN (Desarrollo / ngrok)
// Mercado Pago no acepta URLs locales (http://localhost:3000) en back_urls ni para auto_return.
// Estas rutas puente intermedias reciben la redirección desde la URL pública de ngrok y redirigen al frontend local.
app.get('/api/mercadopago/return/success', (c) => {
  const orderId = c.req.query('orderId') || ''
  return c.redirect(`${env.CLIENT_URL}/orders/${orderId}/close?mp_status=success`)
})

app.get('/api/mercadopago/return/pending', (c) => {
  const orderId = c.req.query('orderId') || ''
  return c.redirect(`${env.CLIENT_URL}/orders/${orderId}/close?mp_status=pending`)
})

app.get('/api/mercadopago/return/failure', (c) => {
  const orderId = c.req.query('orderId') || ''
  return c.redirect(`${env.CLIENT_URL}/orders/${orderId}/close?mp_status=failure`)
})

// POST /api/orders/:id/create-payment-link - Generar preferencia de pago en Mercado Pago (Checkout Pro)
app.post('/api/orders/:id/create-payment-link', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const body = await c.req.json().catch(() => ({}))
  const requestedAmount = body.amount ? Number(body.amount) : null

  try {
    // 1. Obtener restaurante y verificar que tenga su cuenta de Mercado Pago conectada
    const [restaurant] = await tx
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1)

    if (!restaurant || !restaurant.mpAccessToken) {
      return c.json({ error: "El restaurante no tiene conectada una cuenta de Mercado Pago." }, 400)
    }

    // 2. Obtener comanda y pagos ya registrados para calcular saldo pendiente (mismo cálculo Tarea 34)
    const [orderData] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada." }, 404)
    }

    const registeredPayments = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.restaurantId, restaurantId)
        )
      )

    const totalPaid = registeredPayments
      .filter((p: { status: string; amount: string | number }) => p.status === "completed")
      .reduce((sum: number, p: { amount: string | number }) => sum + Number(p.amount), 0)

    const totalOrder = Number(orderData.total || 0)
    const remainingAmount = Math.max(0, totalOrder - totalPaid)

    if (remainingAmount <= 0.01) {
      return c.json({ error: "La comanda ya está totalmente cobrada." }, 400)
    }

    const finalPayAmount = (requestedAmount && requestedAmount > 0 && requestedAmount <= remainingAmount + 0.05)
      ? requestedAmount
      : remainingAmount

    // 3. Obtener mesa para el título descriptivo
    const [tableData] = orderData.tableId
      ? await tx.select({ number: tables.number }).from(tables).where(eq(tables.id, orderData.tableId)).limit(1)
      : [{ number: "N/A" }]

    // 4. Instanciar SDK de Mercado Pago con el accessToken del restaurante
    const client = new MercadoPagoConfig({ accessToken: restaurant.mpAccessToken })
    const preference = new Preference(client)

    // Determinar origen del túnel ngrok desde MP_REDIRECT_URI
    let ngrokOrigin = 'http://localhost:3001'
    if (env.MP_REDIRECT_URI) {
      try {
        const u = new URL(env.MP_REDIRECT_URI)
        ngrokOrigin = u.origin
      } catch (e) {
        ngrokOrigin = env.MP_REDIRECT_URI.split('/api')[0]
      }
    }

    // NOTA DE DESARROLLO (ngrok free tier):
    // ngrok en su plan gratuito muestra una página de advertencia HTML ("interstitial") a peticiones sin el header ngrok-skip-browser-warning.
    // Como las llamadas server-to-server de Mercado Pago no envían ese header HTTP, se les pasa `ngrok-skip-browser-warning=true` por query param.
    // En producción (con dominio/SSL propio), este parámetro deja de ser necesario y se pueden usar las URLs limpias directamente.
    const notificationUrl = `${ngrokOrigin}/api/mercadopago/webhook?ngrok-skip-browser-warning=true`

    const response = await preference.create({
      body: {
        items: [
          {
            id: orderId,
            title: `Pago Comanda Mesa #${tableData?.number || 'N/A'} - ${restaurant.name}`,
            quantity: 1,
            unit_price: Number(finalPayAmount.toFixed(2)),
            currency_id: restaurant.currency || 'ARS',
          }
        ],
        external_reference: JSON.stringify({ orderId, restaurantId }),
        notification_url: notificationUrl,
        back_urls: {
          success: `${ngrokOrigin}/api/mercadopago/return/success?orderId=${orderId}&ngrok-skip-browser-warning=true`,
          pending: `${ngrokOrigin}/api/mercadopago/return/pending?orderId=${orderId}&ngrok-skip-browser-warning=true`,
          failure: `${ngrokOrigin}/api/mercadopago/return/failure?orderId=${orderId}&ngrok-skip-browser-warning=true`,
        },
        auto_return: 'approved',
      }
    })

    const initPoint = response.init_point || response.sandbox_init_point

    return c.json({
      init_point: initPoint,
      sandbox_init_point: response.sandbox_init_point || initPoint,
      preferenceId: response.id,
      amount: remainingAmount,
    })
  } catch (err: any) {
    console.error("Error al crear preferencia de Mercado Pago:", err)
    return c.json({ error: err.message || "No se pudo generar la preferencia de pago de Mercado Pago." }, 500)
  }
})

// POST /api/mercadopago/webhook - Recibir notificaciones IPN/Webhook de Mercado Pago
app.post('/api/mercadopago/webhook', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const query = c.req.query()

    console.log("🔔 [Mercado Pago Webhook] Recibida notificación:", { body, query })

    // Mercado Pago envía notificaciones en dos formatos principales:
    // 1) Webhooks: { action: "payment.created", type: "payment", data: { id: "123" } }
    // 2) IPN: query params ?id=123&topic=payment o body { id: "123", topic: "payment" }
    // 3) Notificaciones genéricas o cuando action contiene 'payment.'
    const topic = body.type || body.topic || query.type || query.topic || (body.action?.includes('payment') ? 'payment' : undefined)
    let dataId = body.data?.id || query['data.id'] || body.id || query.id

    // Si dataId es una URL de recurso como "/v1/payments/123", extraer el ID numérico/texto final
    if (typeof dataId === 'string' && dataId.includes('/')) {
      dataId = dataId.split('/').pop()
    }

    // Si viene un data.id directo (incluso si topic no viene explícito), tratarlo como pago potencial
    if (!dataId) {
      return c.json({ status: 'ignored', message: 'Falta ID de pago en notificación' }, 200)
    }

    if (topic && topic !== 'payment' && topic !== 'merchant_order') {
      return c.json({ status: 'ignored', message: `Evento ${topic} no requiere procesamiento` }, 200)
    }

    // Para obtener los detalles del pago, necesitamos el accessToken del restaurante.
    // Si la notificación trae external_reference o si consultamos el pago con un token global/específico:
    // Primero intentamos consultar el pago. Si Mercado Pago nos da external_reference en el objeto payment:
    // Mercado Pago permite buscar pagos mediante la API pública si tenemos el accessToken.
    // Busquemos en la base de datos a los restaurantes con mpAccessToken para consultar el pago.
    const connectedRestaurants = await db
      .select({ id: restaurants.id, mpAccessToken: restaurants.mpAccessToken })
      .from(restaurants)
      .where(sql`mp_access_token IS NOT NULL`)

    let paymentData: any = null
    let targetRestaurantId: string | null = null

    // Probar con el token de cada restaurante conectado hasta dar con el pago
    for (const rest of connectedRestaurants) {
      if (!rest.mpAccessToken) continue
      try {
        const client = new MercadoPagoConfig({ accessToken: rest.mpAccessToken })
        const mpPayment = new Payment(client)
        const fetched = await mpPayment.get({ id: dataId })
        if (fetched && fetched.id) {
          paymentData = fetched
          targetRestaurantId = rest.id
          break
        }
      } catch (e) {
        // Continuar intentando con el siguiente restaurante
      }
    }

    if (!paymentData) {
      console.warn(`⚠️ [Webhook MP] No se pudo obtener el pago ID ${dataId} con ninguna de las cuentas conectadas.`)
      return c.json({ status: 'not_found' }, 200)
    }

    console.log(`✅ [Webhook MP] Pago obtenido. Estado: ${paymentData.status}, Referencia: ${paymentData.external_reference}`)

    if (paymentData.status === 'approved') {
      let externalRefObj: { orderId?: string; restaurantId?: string } = {}
      try {
        externalRefObj = JSON.parse(paymentData.external_reference || '{}')
      } catch (e) {
        externalRefObj = { orderId: paymentData.external_reference }
      }

      const orderId = externalRefObj.orderId
      const restaurantId = externalRefObj.restaurantId || targetRestaurantId

      if (orderId && restaurantId) {
        // Verificar si el pago ya fue registrado para evitar duplicados
        const [existingPayment] = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.externalId, String(paymentData.id)),
              eq(payments.restaurantId, restaurantId)
            )
          )
          .limit(1)

        if (!existingPayment) {
          const paidAmount = paymentData.transaction_amount || paymentData.transaction_details?.total_paid_amount || "0"

          const [newPaymentRecord] = await db
            .insert(payments)
            .values({
              restaurantId,
              orderId,
              method: 'mercadopago',
              amount: String(paidAmount),
              payerLabel: `Mercado Pago (${paymentData.payer?.email || paymentData.payer?.id || 'Cliente'})`,
              status: 'completed',
              externalId: String(paymentData.id),
              externalProvider: 'mercadopago',
              metadata: paymentData,
            })
            .returning()

          console.log(`🎉 [Webhook MP] Pago registrado en la BD para comanda ${orderId}: $${paidAmount}`)

          // Emitir evento WebSocket para actualizar en tiempo real la UI del cajero
          broadcastToRestaurant(restaurantId, {
            type: "payment:registered",
            payload: {
              orderId,
              payment: newPaymentRecord,
            },
            timestamp: new Date().toISOString(),
          })
        } else {
          console.log(`ℹ️ [Webhook MP] El pago ID ${paymentData.id} ya estaba registrado en la BD.`)
        }
      }
    }

    return c.json({ status: 'ok' }, 200)
  } catch (err: any) {
    console.error("Error en webhook de Mercado Pago:", err)
    return c.json({ error: err.message || "Error procesando webhook" }, 500)
  }
})

// POST /api/uploads/restaurant-logo - Subir logo del restaurante a R2
app.post('/api/uploads/restaurant-logo', tenantMiddleware, requirePermission('manage_config'), async (c) => {
  const restaurantId = c.get("restaurantId")

  try {
    const body = await c.req.parseBody()
    const file = body['file']

    if (!file || !(file instanceof File)) {
      return c.json({ error: "No se subió ningún archivo o el formato no es válido." }, 400)
    }

    // Validar tipo de archivo (solo imágenes)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, WEBP)." }, 400)
    }

    // Validar tamaño máximo (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      return c.json({ error: "El archivo supera el tamaño máximo de 5MB." }, 400)
    }

    // Generar clave en R2 bajo la estructura restaurants/{restaurantId}/logo/{uuid}-{nombre-sanitizado}
    const randomUuid = crypto.randomUUID()
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const key = `restaurants/${restaurantId}/logo/${randomUuid}-${safeFileName}`

    // Convertir archivo a Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Subir a Cloudflare R2
    await s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    )

    // Retornar la URL pública construida con R2_PUBLIC_URL
    const imageUrl = `${env.R2_PUBLIC_URL}/${key}`
    return c.json({ imageUrl })
  } catch (err: any) {
    console.error("Error al subir logo a R2:", err)
    return c.json({ error: "No se pudo subir el logo al servidor." }, 500)
  }
})

// GET /api/staff - Listar miembros del equipo (staff)
app.get('/api/staff', tenantMiddleware, requirePermission('manage_staff'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")

  try {
    const list = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.restaurantId, restaurantId))
      .orderBy(user.createdAt)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al obtener miembros del staff:", err)
    return c.json({ error: "No se pudieron obtener los miembros del staff." }, 500)
  }
})

// POST /api/staff - Crear nuevo usuario para el staff del restaurante
app.post('/api/staff', tenantMiddleware, requirePermission('manage_staff'), async (c) => {
  const restaurantId = c.get("restaurantId")
  const { name, email, password, role } = await c.req.json()

  if (!name || !email || !password || !role) {
    return c.json({ error: "Todos los campos son obligatorios (nombre, email, contraseña, rol)." }, 400)
  }

  const allowedRoles = ["manager", "waiter", "cashier", "cook", "bartender", "host"]
  if (role === "owner") {
    return c.json({ error: "No se permite crear un segundo propietario para el restaurante." }, 400)
  }

  if (!allowedRoles.includes(role)) {
    return c.json({ error: `El rol "${role}" no es válido. Roles permitidos: ${allowedRoles.join(", ")}.` }, 400)
  }

  try {
    const userResponse = await auth.api.signUpEmail({
      body: {
        email: email.trim(),
        password,
        name: name.trim(),
        role,
        restaurantId,
      }
    })

    return c.json(userResponse.user, 201)
  } catch (err: any) {
    console.error("Error al crear usuario de staff:", err)
    let errorMessage = err.message || "No se pudo crear el usuario de staff."
    if (err.code === "23505" || errorMessage.toLowerCase().includes("unique constraint") || errorMessage.toLowerCase().includes("already exists")) {
      errorMessage = "El correo electrónico ya se encuentra registrado."
    }
    return c.json({ error: errorMessage }, 400)
  }
})

// POST /api/orders - Abrir comanda desde una mesa libre
app.post('/api/orders', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const currentUser = c.get("user")
  const { tableId } = await c.req.json()

  if (!tableId) {
    return c.json({ error: "El ID de la mesa (tableId) es requerido." }, 400)
  }

  try {
    // 1. Validar que la mesa pertenezca al restaurante
    const [targetTable] = await tx
      .select()
      .from(tables)
      .where(
        and(
          eq(tables.id, tableId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!targetTable) {
      return c.json({ error: "La mesa no existe o no pertenece a tu restaurante." }, 404)
    }

    // 2. Validar que la mesa esté en estado 'free'
    if (targetTable.status !== "free") {
      return c.json({ error: `No se puede abrir una nueva comanda: la mesa "${targetTable.number}" no está libre (estado actual: ${targetTable.status}).` }, 400)
    }

    // 3. Crear la comanda con estado 'open'
    const [newOrder] = await tx
      .insert(orders)
      .values({
        restaurantId,
        tableId,
        waiterId: currentUser.id,
        status: "open",
        openedAt: new Date(),
      })
      .returning()

    // 4. Actualizar el estado de la mesa a 'occupied'
    const [updatedTable] = await tx
      .update(tables)
      .set({
        status: "occupied",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tables.id, tableId),
          eq(tables.restaurantId, restaurantId)
        )
      )
      .returning()

    // 5. Transmitir evento por WebSocket para actualización instantánea en tiempo real
    broadcastToRestaurant(restaurantId, {
      type: "table:updated",
      payload: updatedTable,
      timestamp: new Date().toISOString(),
    })

    return c.json(newOrder, 201)
  } catch (err: any) {
    console.error("Error al abrir comanda:", err)
    return c.json({ error: "No se pudo abrir la comanda para la mesa." }, 500)
  }
})

// GET /api/orders/:id - Obtener comanda específica por ID
app.get('/api/orders/:id', tenantMiddleware, requireAnyPermission(['manage_orders', 'manage_payments', 'manage_config', 'manage_tables']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")

  try {
    const [orderData] = await tx
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        tableId: orders.tableId,
        tableNumber: tables.number,
        sectionId: tables.sectionId,
        waiterId: orders.waiterId,
        waiterName: user.name,
        status: orders.status,
        coverCount: orders.coverCount,
        openedAt: orders.openedAt,
        closedAt: orders.closedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(user, eq(orders.waiterId, user.id))
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada o no pertenece a tu restaurante." }, 404)
    }

    return c.json(orderData)
  } catch (err: any) {
    console.error("Error al obtener comanda:", err)
    return c.json({ error: "No se pudo obtener la información de la comanda." }, 500)
  }
})

// GET /api/orders/:id/summary - Resumen de cierre de cuenta antes de cobrar
app.get('/api/orders/:id/summary', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")

  try {
    const [orderData] = await tx
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        tableId: orders.tableId,
        tableNumber: tables.number,
        waiterId: orders.waiterId,
        waiterName: user.name,
        status: orders.status,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        discountReason: orders.discountReason,
        total: orders.total,
        openedAt: orders.openedAt,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(user, eq(orders.waiterId, user.id))
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada." }, 404)
    }

    if (orderData.status !== "open") {
      return c.json({ error: "Solo se puede generar el resumen de comandas abiertas." }, 400)
    }

    const items = await tx
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        notes: orderItems.notes,
        status: orderItems.status,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )

    // Calcular subtotal sumando los totalPrice de cada item
    const calculatedSubtotal = items.reduce((acc: number, item: { totalPrice: string | number }) => acc + Number(item.totalPrice), 0)
    const discountAmt = Number(orderData.discountAmount || 0)
    const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmt)

    // Persistir subtotal y total calculados en la tabla orders
    await tx
      .update(orders)
      .set({
        subtotal: calculatedSubtotal.toFixed(2),
        total: calculatedTotal.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))

    return c.json({
      order: {
        ...orderData,
        subtotal: calculatedSubtotal.toFixed(2),
        discountAmount: discountAmt.toFixed(2),
        total: calculatedTotal.toFixed(2),
      },
      items,
      subtotal: calculatedSubtotal,
      discountAmount: discountAmt,
      discountReason: orderData.discountReason || "",
      total: calculatedTotal,
    })
  } catch (err: any) {
    console.error("Error al obtener resumen de comanda:", err)
    return c.json({ error: "No se pudo obtener el resumen de la comanda." }, 500)
  }
})

// POST /api/orders/:id/apply-discount - Aplicar descuento manual a la comanda
app.post('/api/orders/:id/apply-discount', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const { discountAmount, discountReason } = await c.req.json()

  const discountNum = Number(discountAmount)
  if (isNaN(discountNum) || discountNum < 0) {
    return c.json({ error: "El monto de descuento no es válido." }, 400)
  }

  try {
    const [existingOrder] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!existingOrder) {
      return c.json({ error: "Comanda no encontrada." }, 404)
    }

    if (existingOrder.status !== "open") {
      return c.json({ error: "Solo se pueden aplicar descuentos a comandas abiertas." }, 400)
    }

    // Verificar si la comanda ya tiene algún pago registrado
    const existingPayments = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.restaurantId, restaurantId)
        )
      )

    if (existingPayments.length > 0) {
      return c.json({
        error: "No se puede aplicar un descuento a una comanda con pagos ya registrados. Anulá los pagos existentes primero si necesitás modificar el descuento."
      }, 400)
    }

    const items = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )

    const subtotalNum = items.reduce((acc: number, item: { totalPrice: string | number }) => acc + Number(item.totalPrice), 0)

    if (discountNum > subtotalNum) {
      return c.json({ error: "El descuento no puede ser mayor al subtotal de la comanda." }, 400)
    }

    const totalNum = subtotalNum - discountNum

    const [updatedOrder] = await tx
      .update(orders)
      .set({
        subtotal: subtotalNum.toFixed(2),
        discountAmount: discountNum.toFixed(2),
        discountReason: discountReason?.trim() || null,
        total: totalNum.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning()

    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json({
      order: updatedOrder,
      subtotal: subtotalNum,
      discountAmount: discountNum,
      discountReason: updatedOrder.discountReason || "",
      total: totalNum,
    })
  } catch (err: any) {
    console.error("Error al aplicar descuento:", err)
    return c.json({ error: "No se pudo aplicar el descuento a la comanda." }, 500)
  }
})

// GET /api/orders/:id/payments - Listar pagos registrados para una comanda
app.get('/api/orders/:id/payments', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")

  try {
    const [orderData] = await tx
      .select({
        id: orders.id,
        total: orders.total,
        status: orders.status,
      })
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada." }, 404)
    }

    const registeredPayments = await tx
      .select({
        id: payments.id,
        orderId: payments.orderId,
        method: payments.method,
        amount: payments.amount,
        payerLabel: payments.payerLabel,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.restaurantId, restaurantId)
        )
      )
      .orderBy(payments.createdAt)

    const totalPaid = registeredPayments
      .filter((p: { status: string; amount: string | number }) => p.status === "completed")
      .reduce((sum: number, p: { amount: string | number }) => sum + Number(p.amount), 0)

    const totalOrder = Number(orderData.total || 0)
    const remainingAmount = Math.max(0, totalOrder - totalPaid)

    return c.json({
      payments: registeredPayments,
      totalOrder,
      totalPaid,
      remainingAmount,
    })
  } catch (err: any) {
    console.error("Error al listar pagos de comanda:", err)
    return c.json({ error: "No se pudieron obtener los pagos de la comanda." }, 500)
  }
})

// POST /api/orders/:id/payments - Registrar un pago parcial o total
app.post('/api/orders/:id/payments', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const currentUser = c.get("user")
  const orderId = c.req.param("id")
  const { amount, method, payerLabel } = await c.req.json()

  const amountNum = Number(amount)
  if (isNaN(amountNum) || amountNum <= 0) {
    return c.json({ error: "El monto del pago debe ser mayor a 0." }, 400)
  }

  const validMethods = ["cash", "card", "mercadopago", "transfer"]
  if (!method || !validMethods.includes(method)) {
    return c.json({ error: "Método de pago no válido." }, 400)
  }

  if (method === "mercadopago") {
    return c.json({
      error: "Los pagos con Mercado Pago son procesados automáticamente vía QR/Link y webhook. No se pueden ingresar manualmente."
    }, 400)
  }

  try {
    const [orderData] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada." }, 404)
    }

    const existingPayments = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.restaurantId, restaurantId)
        )
      )

    const totalPaid = existingPayments
      .filter((p: { status: string; amount: string | number }) => p.status === "completed")
      .reduce((sum: number, p: { amount: string | number }) => sum + Number(p.amount), 0)

    const totalOrder = Number(orderData.total || 0)
    const remainingBefore = Math.max(0, totalOrder - totalPaid)

    if (amountNum > remainingBefore + 0.05) {
      return c.json({
        error: `El monto del pago ($${amountNum.toLocaleString("es-AR")}) supera el saldo pendiente ($${remainingBefore.toLocaleString("es-AR")}).`
      }, 400)
    }

    const [newPayment] = await tx
      .insert(payments)
      .values({
        restaurantId,
        orderId,
        processedBy: currentUser.id,
        method,
        amount: amountNum.toFixed(2),
        payerLabel: payerLabel?.trim() || null,
        status: "completed",
      })
      .returning()

    const newTotalPaid = totalPaid + amountNum
    const remainingAfter = Math.max(0, totalOrder - newTotalPaid)

    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json({
      payment: newPayment,
      totalOrder,
      totalPaid: newTotalPaid,
      remainingAmount: remainingAfter,
    }, 201)
  } catch (err: any) {
    console.error("Error al registrar pago:", err)
    return c.json({ error: "No se pudo registrar el pago." }, 500)
  }
})

// PATCH /api/orders/:id/items/assign-split - Asignar grupo de persona (split) a ítems de comanda
app.patch('/api/orders/:id/items/assign-split', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const { assignments } = await c.req.json()

  if (!Array.isArray(assignments)) {
    return c.json({ error: "Formato de asignaciones inválido (se esperaba un array)." }, 400)
  }

  try {
    let updatedCount = 0
    for (const item of assignments) {
      if (item.itemId) {
        await tx
          .update(orderItems)
          .set({
            splitGroupId: item.splitGroupId ? String(item.splitGroupId).trim() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orderItems.id, item.itemId),
              eq(orderItems.orderId, orderId),
              eq(orderItems.restaurantId, restaurantId)
            )
          )
        updatedCount++
      }
    }

    return c.json({ success: true, updatedCount })
  } catch (err: any) {
    console.error("Error al asignar grupos de split a ítems:", err)
    return c.json({ error: "No se pudieron asignar los grupos de split a los ítems." }, 500)
  }
})

// DELETE /api/orders/:id/payments/:paymentId - Anular un pago registrado por error
app.delete('/api/orders/:id/payments/:paymentId', tenantMiddleware, requirePermission('manage_payments'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const paymentId = c.req.param("paymentId")

  try {
    const [deletedPayment] = await tx
      .delete(payments)
      .where(
        and(
          eq(payments.id, paymentId),
          eq(payments.orderId, orderId),
          eq(payments.restaurantId, restaurantId)
        )
      )
      .returning()

    if (!deletedPayment) {
      return c.json({ error: "Pago no encontrado o ya anulado." }, 404)
    }

    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json({ success: true, message: "Pago anulado correctamente." })
  } catch (err: any) {
    console.error("Error al anular pago:", err)
    return c.json({ error: "No se pudo anular el pago registrado." }, 500)
  }
})

// GET /api/orders - Listar comandas filtradas por estado
app.get('/api/orders', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const statusParam = c.req.query("status")

  try {
    const conditions = [eq(orders.restaurantId, restaurantId)]
    if (statusParam) {
      conditions.push(eq(orders.status, statusParam as any))
    }

    const list = await tx
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        tableId: orders.tableId,
        tableNumber: tables.number,
        waiterId: orders.waiterId,
        waiterName: user.name,
        status: orders.status,
        coverCount: orders.coverCount,
        openedAt: orders.openedAt,
        closedAt: orders.closedAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(user, eq(orders.waiterId, user.id))
      .where(and(...conditions))
      .orderBy(orders.openedAt)

    return c.json(list)
  } catch (err: any) {
    console.error("Error al listar comandas:", err)
    return c.json({ error: "No se pudieron listar las comandas." }, 500)
  }
})

// GET /api/tables/:id/active-order - Obtener la comanda abierta de una mesa ocupada
app.get('/api/tables/:id/active-order', tenantMiddleware, requireAnyPermission(['manage_config', 'manage_tables', 'manage_orders', 'manage_payments']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const tableId = c.req.param("id")

  try {
    const [activeOrder] = await tx
      .select({
        id: orders.id,
        status: orders.status,
        tableId: orders.tableId,
        openedAt: orders.openedAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tableId, tableId),
          eq(orders.restaurantId, restaurantId),
          eq(orders.status, "open")
        )
      )
      .orderBy(orders.openedAt)
      .limit(1)

    if (!activeOrder) {
      return c.json({ error: "No se encontró una comanda abierta para esta mesa." }, 404)
    }

    return c.json(activeOrder)
  } catch (err: any) {
    console.error("Error al obtener comanda activa de la mesa:", err)
    return c.json({ error: "No se pudo obtener la comanda activa." }, 500)
  }
})

// GET /api/orders/:id/items - Listar los ítems agregados a una comanda
app.get('/api/orders/:id/items', tenantMiddleware, requireAnyPermission(['manage_orders', 'manage_payments', 'manage_config', 'manage_tables']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")

  try {
    const [orderData] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada o no pertenece a tu restaurante." }, 404)
    }

    const itemsList = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: products.name,
        productImageUrl: products.imageUrl,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        notes: orderItems.notes,
        status: orderItems.status,
        createdAt: orderItems.createdAt,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )
      .orderBy(orderItems.createdAt)

    return c.json(itemsList)
  } catch (err: any) {
    console.error("Error al obtener ítems de comanda:", err)
    return c.json({ error: "No se pudieron obtener los ítems de la comanda." }, 500)
  }
})

// POST /api/orders/:id/items - Agregar o incrementar un producto en la comanda
app.post('/api/orders/:id/items', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const { productId, quantity = 1, notes } = await c.req.json()

  if (!productId) {
    return c.json({ error: "El ID del producto (productId) es requerido." }, 400)
  }

  const parsedQty = Number(quantity)
  if (isNaN(parsedQty) || parsedQty <= 0) {
    return c.json({ error: "La cantidad debe ser un número mayor a 0." }, 400)
  }

  try {
    const [targetOrder] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!targetOrder) {
      return c.json({ error: "Comanda no encontrada o no pertenece a tu restaurante." }, 404)
    }

    if (targetOrder.status !== "open") {
      return c.json({ error: "No se pueden agregar ítems a una comanda que no esté abierta." }, 400)
    }

    const [targetProduct] = await tx
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!targetProduct) {
      return c.json({ error: "Producto no encontrado o no pertenece a tu restaurante." }, 404)
    }

    if (!targetProduct.isAvailable) {
      return c.json({ error: `El producto "${targetProduct.name}" no está disponible.` }, 400)
    }

    const unitPriceNum = Number(targetProduct.price)
    const sanitizedNotes = notes ? String(notes).trim() : null

    // Buscar si el producto ya existe en la comanda con estado 'pending' y las mismas notas
    const existingItems = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.productId, productId),
          eq(orderItems.status, "pending")
        )
      )

    const existingMatch = existingItems.find((item: any) => (item.notes || null) === sanitizedNotes)

    let resultItem
    if (existingMatch) {
      const newQty = existingMatch.quantity + parsedQty
      const newTotal = (unitPriceNum * newQty).toFixed(2)

      const [updated] = await tx
        .update(orderItems)
        .set({
          quantity: newQty,
          totalPrice: newTotal,
          updatedAt: new Date(),
        })
        .where(eq(orderItems.id, existingMatch.id))
        .returning()

      resultItem = updated
    } else {
      const totalPriceNum = (unitPriceNum * parsedQty).toFixed(2)

      const [newItem] = await tx
        .insert(orderItems)
        .values({
          restaurantId,
          orderId,
          productId,
          quantity: parsedQty,
          unitPrice: String(unitPriceNum),
          totalPrice: totalPriceNum,
          notes: sanitizedNotes,
          status: "pending",
        })
        .returning()

      resultItem = newItem
    }

    // Recalcular total acumulado de la comanda
    const allItems = await tx
      .select({ totalPrice: orderItems.totalPrice })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    const orderSubtotal = allItems.reduce((acc: number, curr: { totalPrice: string | number }) => acc + Number(curr.totalPrice), 0).toFixed(2)

    await tx
      .update(orders)
      .set({
        subtotal: orderSubtotal,
        total: orderSubtotal,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))

    // Notificar cambios por WebSocket
    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json(resultItem, 201)
  } catch (err: any) {
    console.error("Error al agregar ítem a la comanda:", err)
    return c.json({ error: "No se pudo agregar el ítem a la comanda." }, 500)
  }
})

// PATCH /api/orders/:id/items/:itemId - Actualizar cantidad o notas de un ítem
app.patch('/api/orders/:id/items/:itemId', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const itemId = c.req.param("itemId")
  const { quantity, notes } = await c.req.json()

  try {
    const [existingItem] = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!existingItem) {
      return c.json({ error: "Ítem no encontrado en la comanda." }, 404)
    }

    if (existingItem.status !== "pending") {
      return c.json({ error: "No se puede editar un ítem que ya no está pendiente." }, 400)
    }

    let updatedItem
    if (quantity !== undefined && Number(quantity) <= 0) {
      await tx.delete(orderItems).where(eq(orderItems.id, itemId))
      updatedItem = { id: itemId, deleted: true }
    } else {
      const newQty = quantity !== undefined ? Number(quantity) : existingItem.quantity
      const unitPriceNum = Number(existingItem.unitPrice)
      const newTotalPrice = (unitPriceNum * newQty).toFixed(2)
      const newNotes = notes !== undefined ? (notes ? String(notes).trim() : null) : existingItem.notes

      const [updated] = await tx
        .update(orderItems)
        .set({
          quantity: newQty,
          totalPrice: newTotalPrice,
          notes: newNotes,
          updatedAt: new Date(),
        })
        .where(eq(orderItems.id, itemId))
        .returning()

      updatedItem = updated
    }

    // Recalcular total acumulado de la comanda
    const allItems = await tx
      .select({ totalPrice: orderItems.totalPrice })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    const orderSubtotal = allItems.reduce((acc: number, curr: { totalPrice: string | number }) => acc + Number(curr.totalPrice), 0).toFixed(2)

    await tx
      .update(orders)
      .set({
        subtotal: orderSubtotal,
        total: orderSubtotal,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))

    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json(updatedItem)
  } catch (err: any) {
    console.error("Error al actualizar ítem de la comanda:", err)
    return c.json({ error: "No se pudo actualizar el ítem de la comanda." }, 500)
  }
})

// DELETE /api/orders/:id/items/:itemId - Quitar un ítem de la comanda
app.delete('/api/orders/:id/items/:itemId', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")
  const itemId = c.req.param("itemId")

  try {
    const [existingItem] = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemId),
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!existingItem) {
      return c.json({ error: "Ítem no encontrado en la comanda." }, 404)
    }

    if (existingItem.status !== "pending") {
      return c.json({ error: "No se puede eliminar un ítem que ya no está pendiente." }, 400)
    }

    await tx.delete(orderItems).where(eq(orderItems.id, itemId))

    // Recalcular total acumulado de la comanda
    const allItems = await tx
      .select({ totalPrice: orderItems.totalPrice })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))

    const orderSubtotal = allItems.reduce((acc: number, curr: { totalPrice: string | number }) => acc + Number(curr.totalPrice), 0).toFixed(2)

    await tx
      .update(orders)
      .set({
        subtotal: orderSubtotal,
        total: orderSubtotal,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))

    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json({ success: true, message: "Ítem eliminado correctamente." })
  } catch (err: any) {
    console.error("Error al quitar ítem de comanda:", err)
    return c.json({ error: "No se pudo quitar el ítem de la comanda." }, 500)
  }
})

// POST /api/orders/:id/send-to-kitchen - Enviar ítems pendientes a cocina / barra (KDS)
app.post('/api/orders/:id/send-to-kitchen', tenantMiddleware, requirePermission('manage_orders'), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const orderId = c.req.param("id")

  try {
    // 1. Obtener la comanda con datos de la mesa y del mozo
    const [orderData] = await tx
      .select({
        id: orders.id,
        restaurantId: orders.restaurantId,
        status: orders.status,
        tableNumber: tables.number,
        waiterName: user.name,
      })
      .from(orders)
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(user, eq(orders.waiterId, user.id))
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!orderData) {
      return c.json({ error: "Comanda no encontrada o no pertenece a tu restaurante." }, 404)
    }

    if (orderData.status !== "open") {
      return c.json({ error: "Solo se pueden enviar a cocina ítems de comandas abiertas." }, 400)
    }

    // 2. Obtener los ítems pendientes de esta comanda junto con la estación de su categoría
    const pendingItems = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        totalPrice: orderItems.totalPrice,
        notes: orderItems.notes,
        status: orderItems.status,
        station: categories.station,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(orderItems.orderId, orderId),
          eq(orderItems.restaurantId, restaurantId),
          eq(orderItems.status, "pending")
        )
      )

    if (pendingItems.length === 0) {
      return c.json({ error: "No hay items nuevos para enviar a cocina." }, 400)
    }

    // 3. Actualizar estado de los ítems a 'sent_to_kitchen'
    const pendingIds = pendingItems.map((item: any) => item.id)
    await tx
      .update(orderItems)
      .set({
        status: "sent_to_kitchen",
        sentToKitchenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(inArray(orderItems.id, pendingIds))

    // 4. Agrupar ítems por estación ('kitchen' o 'bar')
    const kitchenItems = pendingItems.filter((i: any) => (i.station || "kitchen") === "kitchen")
    const barItems = pendingItems.filter((i: any) => i.station === "bar")

    // 5. Emitir eventos WebSocket por estación para el KDS
    if (kitchenItems.length > 0) {
      broadcastToRestaurant(restaurantId, {
        type: "kds:new_items",
        payload: {
          station: "kitchen",
          orderId,
          tableNumber: orderData.tableNumber || "N/A",
          waiterName: orderData.waiterName || "Sin asignar",
          items: kitchenItems,
        },
        timestamp: new Date().toISOString(),
      })
      console.log(`🍳 [KDS] Evento kds:new_items emitió ${kitchenItems.length} ítems hacia la estación "kitchen" para comanda #${orderId}`)
    }

    if (barItems.length > 0) {
      broadcastToRestaurant(restaurantId, {
        type: "kds:new_items",
        payload: {
          station: "bar",
          orderId,
          tableNumber: orderData.tableNumber || "N/A",
          waiterName: orderData.waiterName || "Sin asignar",
          items: barItems,
        },
        timestamp: new Date().toISOString(),
      })
      console.log(`🍹 [KDS] Evento kds:new_items emitió ${barItems.length} ítems hacia la estación "bar" para comanda #${orderId}`)
    }

    // Notificar a la interfaz de la comanda para actualizar estados visuales de los badges
    broadcastToRestaurant(restaurantId, {
      type: "order:items_updated",
      payload: { orderId },
      timestamp: new Date().toISOString(),
    })

    return c.json({
      success: true,
      message: "Ítems enviados a cocina / barra correctamente.",
      sentCount: pendingItems.length,
      kitchenCount: kitchenItems.length,
      barCount: barItems.length,
    })
  } catch (err: any) {
    console.error("Error al enviar comanda a cocina:", err)
    return c.json({ error: "No se pudieron enviar los ítems a cocina." }, 500)
  }
})

// GET /api/kds/pending - Obtener ítems activos para el KDS por estación
app.get('/api/kds/pending', tenantMiddleware, requireAnyPermission(['manage_kitchen_kds', 'manage_bar_kds', 'manage_orders', 'manage_config']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const targetStation = c.req.query('station') || 'kitchen'

  try {
    const items = await tx
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        notes: orderItems.notes,
        status: orderItems.status,
        sentToKitchenAt: orderItems.sentToKitchenAt,
        createdAt: orderItems.createdAt,
        tableNumber: tables.number,
        waiterName: user.name,
        station: categories.station,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .leftJoin(user, eq(orders.waiterId, user.id))
      .where(
        and(
          eq(orderItems.restaurantId, restaurantId),
          eq(categories.station, targetStation === 'bar' ? 'bar' : 'kitchen'),
          inArray(orderItems.status, ['sent_to_kitchen', 'preparing'])
        )
      )
      .orderBy(orderItems.sentToKitchenAt)

    return c.json(items)
  } catch (err: any) {
    console.error("Error al obtener ítems KDS:", err)
    return c.json({ error: "No se pudieron obtener los ítems para el KDS." }, 500)
  }
})

// PATCH /api/kds/items/:itemId/status - Actualizar estado de un ítem en KDS (ej. a ready)
app.patch('/api/kds/items/:itemId/status', tenantMiddleware, requireAnyPermission(['manage_kitchen_kds', 'manage_bar_kds', 'manage_orders', 'manage_config']), async (c) => {
  const tx = c.get("db")
  const restaurantId = c.get("restaurantId")
  const itemId = c.req.param("itemId")
  const { status: newStatus } = await c.req.json()

  if (!newStatus || !['sent_to_kitchen', 'preparing', 'ready', 'delivered'].includes(newStatus)) {
    return c.json({ error: "Estado no válido para el KDS." }, 400)
  }

  try {
    const [existingItem] = await tx
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.id, itemId),
          eq(orderItems.restaurantId, restaurantId)
        )
      )
      .limit(1)

    if (!existingItem) {
      return c.json({ error: "Ítem no encontrado." }, 404)
    }

    const [updatedItem] = await tx
      .update(orderItems)
      .set({
        status: newStatus,
        ...(newStatus === "ready" && { readyAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(orderItems.id, itemId))
      .returning()

    // Emitir evento WebSocket order:item_ready
    broadcastToRestaurant(restaurantId, {
      type: "order:item_ready",
      payload: {
        orderId: existingItem.orderId,
        itemId: existingItem.id,
        status: newStatus,
      },
      timestamp: new Date().toISOString(),
    })

    return c.json(updatedItem)
  } catch (err: any) {
    console.error("Error al actualizar estado en KDS:", err)
    return c.json({ error: "No se pudo actualizar el estado del ítem." }, 500)
  }
})

// GET /ws/:restaurantId - Endpoint WebSocket multitenant en tiempo real
app.get('/ws/:restaurantId', upgradeWebSocket((c) => {
  const targetRestaurantId = c.req.param("restaurantId") || ""

  return {
    async onOpen(_evt, ws) {
      try {
        const session = await auth.api.getSession({ headers: c.req.raw.headers })
        const userRestaurantId = (session?.user as any)?.restaurantId

        // Aislamiento estricto de tenant: Validar que el usuario pertenezca al restaurante objetivo
        if (!session || !userRestaurantId || userRestaurantId !== targetRestaurantId) {
          console.warn(`🔒 Conexión WebSocket rechazada: Acceso no autorizado al restaurante "${targetRestaurantId}"`)
          ws.close(4003, "Acceso no autorizado al canal de este restaurante.")
          return
        }

        if (!restaurantConnections.has(targetRestaurantId)) {
          restaurantConnections.set(targetRestaurantId, new Set())
        }
        restaurantConnections.get(targetRestaurantId)!.add(ws)
        console.log(`🔌 Cliente WebSocket conectado al canal del restaurante: ${targetRestaurantId}`)
      } catch (err) {
        console.error("Error al verificar sesión en WebSocket:", err)
        ws.close(4000, "Error interno de servidor")
      }
    },
    onClose(_evt, ws) {
      const connections = restaurantConnections.get(targetRestaurantId)
      if (connections) {
        connections.delete(ws)
        if (connections.size === 0) {
          restaurantConnections.delete(targetRestaurantId)
        }
      }
      console.log(`❌ Cliente WebSocket desconectado del restaurante: ${targetRestaurantId}`)
    },
  }
}))

app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

const port = env.PORT
console.log(`Servidor corriendo en http://localhost:${port}`)

const server = serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
})

injectWebSocket(server)