import { db } from "./client.js"

async function applyEnumFix() {
  console.log("🛠️ Aplicando correcciones ALTER TYPE para payment_method y payment_status...\n")

  try {
    await db.execute(`ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card';`)
    await db.execute(`ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'mercadopago';`)
    await db.execute(`ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'completed';`)

    console.log("✅ Sentencias ALTER TYPE ejecutadas con éxito.")
    process.exit(0)
  } catch (err) {
    console.error("❌ Error al ejecutar ALTER TYPE:", err)
    process.exit(1)
  }
}

applyEnumFix()
