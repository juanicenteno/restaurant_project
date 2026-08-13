import postgres from 'postgres'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../../apps/api/.env') })

const dbUrl = process.env.DATABASE_URL || 'postgres://admin:juani123@localhost:5432/sistema_restaurantes'
console.log('Connecting to:', dbUrl)
const sql = postgres(dbUrl)

async function run() {
  try {
    await sql`
      ALTER TABLE restaurants 
      ADD COLUMN IF NOT EXISTS mp_access_token text,
      ADD COLUMN IF NOT EXISTS mp_refresh_token text,
      ADD COLUMN IF NOT EXISTS mp_user_id text,
      ADD COLUMN IF NOT EXISTS mp_connected_at timestamp;
    `
    console.log('✅ Migración manual de Mercado Pago completada exitosamente.')
  } catch (err) {
    console.error('❌ Error en la migración:', err)
  } finally {
    await sql.end()
  }
}

run()
