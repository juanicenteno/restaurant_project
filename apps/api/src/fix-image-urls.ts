import { env } from './env.js'
import { db } from '@repo/db/client'
import { products } from '@repo/db/schema'
import { like, eq } from 'drizzle-orm'

async function runFix() {
  console.log('🔄 Buscando productos con URLs de imágenes viejas (r2.cloudflarestorage.com)...')

  try {
    const list = await db
      .select()
      .from(products)
      .where(like(products.imageUrl, '%r2.cloudflarestorage.com%'))

    console.log(`📋 Se encontraron ${list.length} producto(s) para corregir.`)

    let updatedCount = 0

    for (const prod of list) {
      if (!prod.imageUrl) continue

      const urlObj = new URL(prod.imageUrl)
      let pathname = urlObj.pathname

      // Limpiar bucket name si aparecía en el pathname
      if (pathname.startsWith(`/${env.R2_BUCKET_NAME}/`)) {
        pathname = pathname.replace(`/${env.R2_BUCKET_NAME}/`, '/')
      }

      const key = pathname.startsWith('/') ? pathname.slice(1) : pathname
      const newUrl = `${env.R2_PUBLIC_URL}/${key}`

      console.log(`\n✏️ Actualizando "${prod.name}" (${prod.id}):`)
      console.log(`   Viejo: ${prod.imageUrl}`)
      console.log(`   Nuevo: ${newUrl}`)

      await db
        .update(products)
        .set({
          imageUrl: newUrl,
          updatedAt: new Date(),
        })
        .where(eq(products.id, prod.id))

      updatedCount++
    }

    console.log(`\n✅ ¡Proceso completado! Se actualizaron ${updatedCount} productos correctamente.`)
    process.exit(0)
  } catch (err: any) {
    console.error('❌ Error ejecutando la corrección de URLs:', err)
    process.exit(1)
  }
}

runFix()
