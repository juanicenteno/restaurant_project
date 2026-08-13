import './env.js'
import { db } from '@repo/db/client'
import { restaurants, user, rolePermissions } from '@repo/db/schema'
import { eq } from 'drizzle-orm'
import { auth } from './auth.js'
import { INITIAL_ROLE_PERMISSIONS } from './config/permissions.js'

async function runSeed() {
  console.log('🌱 Iniciando seeding de base de datos...')
  try {
    // 1. Obtener o crear el restaurante semilla
    const existingRestaurants = await db.select().from(restaurants)
    let restaurant
    
    if (existingRestaurants.length === 0) {
      const [newRestaurant] = await db.insert(restaurants).values({
        name: "Pizzería Don Juan",
        slug: "pizzeria-don-juan",
      }).returning()
      restaurant = newRestaurant
      console.log(`✅ Restaurante semilla creado: ${restaurant.name} (${restaurant.id})`)
    } else {
      restaurant = existingRestaurants[0]
      console.log(`ℹ️ Restaurante existente utilizado: ${restaurant?.name} (${restaurant?.id})`)
    }

    if (!restaurant) {
      throw new Error("No se pudo obtener o crear el restaurante")
    }

    // 2. Obtener o crear los usuarios semilla con Better Auth
    const seedEmail = "test@restaurant.com"
    const existingUsers = await db.select().from(user).where(eq(user.email, seedEmail))
    
    if (existingUsers.length === 0) {
      const response = await auth.api.signUpEmail({
        body: {
          email: seedEmail,
          password: "password123",
          name: "Juan Centeno",
          role: "owner",
          restaurantId: restaurant.id,
        }
      })
      console.log("✅ Usuario owner semilla creado con Better Auth:", response.user.email)
    } else {
      console.log("ℹ️ Usuario owner semilla ya existe en la base de datos:", existingUsers[0]?.email)
    }

    const cookEmail = "cook@restaurant.com"
    const existingCooks = await db.select().from(user).where(eq(user.email, cookEmail))
    
    if (existingCooks.length === 0) {
      const response = await auth.api.signUpEmail({
        body: {
          email: cookEmail,
          password: "password123",
          name: "Cocinero Pepe",
          role: "cook",
          restaurantId: restaurant.id,
        }
      })
      console.log("✅ Usuario cook semilla creado con Better Auth:", response.user.email)
    } else {
      console.log("ℹ️ Usuario cook semilla ya existe en la base de datos:", existingCooks[0]?.email)
    }

    // Crear el segundo restaurante semilla para pruebas de concurrencia
    const otherRestaurantSlug = "hamburgueseria-burger"
    const otherRestaurants = await db.select().from(restaurants).where(eq(restaurants.slug, otherRestaurantSlug))
    let otherRestaurant
    if (otherRestaurants.length === 0) {
      const [newOther] = await db.insert(restaurants).values({
        name: "Hamburguesería Burger",
        slug: otherRestaurantSlug,
      }).returning()
      otherRestaurant = newOther
      console.log(`✅ Segundo restaurante semilla creado: ${otherRestaurant.name} (${otherRestaurant.id})`)
    } else {
      otherRestaurant = otherRestaurants[0]
      console.log(`ℹ️ Segundo restaurante existente utilizado: ${otherRestaurant?.name} (${otherRestaurant?.id})`)
    }

    if (!otherRestaurant) {
      throw new Error("No se pudo obtener o crear el segundo restaurante")
    }

    // Crear usuario para el segundo restaurante
    const otherEmail = "other@restaurant.com"
    const existingOthers = await db.select().from(user).where(eq(user.email, otherEmail))
    if (existingOthers.length === 0) {
      const response = await auth.api.signUpEmail({
        body: {
          email: otherEmail,
          password: "password123",
          name: "Dueño Burger",
          role: "owner",
          restaurantId: otherRestaurant.id,
        }
      })
      console.log("✅ Segundo usuario owner semilla creado con Better Auth:", response.user.email)
    } else {
      console.log("ℹ️ Segundo usuario owner semilla ya existe en la base de datos:", existingOthers[0]?.email)
    }

    // 3. Seeding de Permisos por Rol en la tabla role_permissions
    console.log('🌱 Cargando permisos por rol en role_permissions...')
    await db.delete(rolePermissions)
    
    const insertValues = []
    for (const [role, permissions] of Object.entries(INITIAL_ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        insertValues.push({
          role,
          permission,
        })
      }
    }

    if (insertValues.length > 0) {
      await db.insert(rolePermissions).values(insertValues)
      console.log(`✅ Se cargaron ${insertValues.length} combinaciones de rol-permiso.`)
    }

    console.log('🌱 Seeding completado con éxito.')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error durante el seeding:', error)
    process.exit(1)
  }
}

runSeed()
