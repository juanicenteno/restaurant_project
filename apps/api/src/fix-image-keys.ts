import { env } from './env.js'
import { db } from '@repo/db/client'
import { products } from '@repo/db/schema'
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { eq, isNotNull } from 'drizzle-orm'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

async function runUnifyKeys() {
  console.log('🔄 Iniciando unificación de claves (keys) de imágenes en Cloudflare R2...')
  console.log(`🎯 Formato estándar objetivo: restaurants/{restaurantId}/products/{uuid}-{filename}`)

  try {
    const list = await db
      .select()
      .from(products)
      .where(isNotNull(products.imageUrl))

    console.log(`📋 Se analizarán ${list.length} producto(s) con imagen en la base de datos.`)

    let migratedCount = 0

    for (const prod of list) {
      if (!prod.imageUrl) continue

      const urlObj = new URL(prod.imageUrl)
      let oldPath = urlObj.pathname

      // Limpiar bucket name si está al inicio de la ruta
      if (oldPath.startsWith(`/${env.R2_BUCKET_NAME}/`)) {
        oldPath = oldPath.replace(`/${env.R2_BUCKET_NAME}/`, '/')
      }

      const oldKey = oldPath.startsWith('/') ? oldPath.slice(1) : oldPath

      // Extraer el nombre de archivo (última parte del path)
      const filename = oldKey.substring(oldKey.lastIndexOf('/') + 1)
      const expectedPrefix = `restaurants/${prod.restaurantId}/products/`
      const newKey = `${expectedPrefix}${filename}`

      // Si ya cumple el formato estándar exacto, omitir
      if (oldKey === newKey) {
        console.log(`✔️ El producto "${prod.name}" (${prod.id}) ya cumple el formato estándar: ${oldKey}`)
        continue
      }

      console.log(`\n🚚 Migrando imagen para "${prod.name}" (${prod.id}):`)
      console.log(`   Clave vieja en R2: ${oldKey}`)
      console.log(`   Clave nueva en R2: ${newKey}`)

      // 1. Copiar objeto en R2
      const copySource = `${env.R2_BUCKET_NAME}/${encodeURI(oldKey)}`
      await s3.send(
        new CopyObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          CopySource: copySource,
          Key: newKey,
        })
      )
      console.log(`   ✅ Copia exitosa en R2.`)

      // 2. Eliminar objeto viejo de R2
      await s3.send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: oldKey,
        })
      )
      console.log(`   🗑️ Objeto viejo eliminado de R2.`)

      // 3. Actualizar la base de datos
      const newUrl = `${env.R2_PUBLIC_URL}/${newKey}`
      await db
        .update(products)
        .set({
          imageUrl: newUrl,
          updatedAt: new Date(),
        })
        .where(eq(products.id, prod.id))

      console.log(`   💾 Registro actualizado en BD: ${newUrl}`)
      migratedCount++
    }

    console.log(`\n✅ ¡Proceso completado! Se unificaron ${migratedCount} claves de imágenes correctamente.`)
    process.exit(0)
  } catch (err: any) {
    console.error('❌ Error unificando claves de imágenes en R2:', err)
    process.exit(1)
  }
}

runUnifyKeys()
