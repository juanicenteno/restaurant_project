import { db } from "./client.js"

async function applyMigration() {
  try {
    console.log("🛠️ Aplicando DDL ALTER TABLE para Mercado Pago...")
    await db.execute(`
      ALTER TABLE restaurants 
      ADD COLUMN IF NOT EXISTS mp_access_token text,
      ADD COLUMN IF NOT EXISTS mp_refresh_token text,
      ADD COLUMN IF NOT EXISTS mp_user_id text,
      ADD COLUMN IF NOT EXISTS mp_connected_at timestamp;
    `)
    console.log("✅ DDL ejecutado exitosamente.")
  } catch (err) {
    console.error("❌ Error ejecutando DDL:", err)
  } finally {
    process.exit(0)
  }
}

applyMigration()
