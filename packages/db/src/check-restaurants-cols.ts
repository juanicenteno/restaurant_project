import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../../../apps/api/.env") })

import { db } from "./client.js"

async function checkColumns() {
  try {
    const res = await db.execute(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'restaurants';`
    )
    const rows = Array.isArray(res) ? res : (res as any).rows || []
    const cols = rows.map((r: any) => r.column_name)

    console.log("📌 Columnas en la tabla 'restaurants':")
    console.log(cols)

    const expected = ["mp_access_token", "mp_refresh_token", "mp_user_id", "mp_connected_at"]
    const missing = expected.filter(c => !cols.includes(c))

    if (missing.length > 0) {
      console.error("\n❌ FALTAN COLUMNAS:", missing)
    } else {
      console.log("\n✅ TODAS LAS COLUMNAS DE MERCADO PAGO ESTÁN PRESENTES.")
    }
  } catch (err) {
    console.error("Error al consultar columnas:", err)
  } finally {
    process.exit(0)
  }
}

checkColumns()
