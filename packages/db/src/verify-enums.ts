import { db } from "./client.js"
import * as schema from "./schema.js"

// Extraer todas las definiciones de pgEnum en schema.ts
const schemaEnums: Record<string, string[]> = {}

for (const [key, value] of Object.entries(schema)) {
  if (value && (typeof value === "object" || typeof value === "function")) {
    const enumName = (value as any).enumName
    const enumValues = (value as any).enumValues
    if (enumName && Array.isArray(enumValues)) {
      schemaEnums[enumName] = enumValues
    }
  }
}
console.log("Enums extraídos de schema.ts:", schemaEnums)

async function verifyEnums() {
  console.log("🔍 Verificando sincronización de Enums entre schema.ts y PostgreSQL...\n")

  try {
    const res = await db.execute(
      `SELECT t.typname, e.enumlabel 
       FROM pg_type t 
       JOIN pg_enum e ON t.oid = e.enumtypid 
       ORDER BY t.typname, e.enumsortorder;`
    )

    const dbEnums: Record<string, string[]> = {}
    const rows = Array.isArray(res) ? res : (res as any).rows || []

    for (const row of rows) {
      const typeName = row.typname
      const label = row.enumlabel
      if (!dbEnums[typeName]) {
        dbEnums[typeName] = []
      }
      dbEnums[typeName].push(label)
    }

    let hasDiscrepancies = false
    const missingStatements: string[] = []

    for (const [enumName, schemaValues] of Object.entries(schemaEnums)) {
      const currentDbValues = dbEnums[enumName] || []

      const missingInDb = schemaValues.filter((v) => !currentDbValues.includes(v))

      if (missingInDb.length > 0) {
        hasDiscrepancies = true
        console.error(`❌ ENUM DESSINCRONIZADO: "${enumName}"`)
        console.error(`   - Valores en schema.ts: [${schemaValues.join(", ")}]`)
        console.error(`   - Valores reales en Postgres: [${currentDbValues.join(", ")}]`)
        console.error(`   - VALORES FALTANTES EN POSTGRES: [${missingInDb.join(", ")}]\n`)

        for (const val of missingInDb) {
          missingStatements.push(`ALTER TYPE public."${enumName}" ADD VALUE IF NOT EXISTS '${val}';`)
        }
      } else {
        console.log(`✅ ${enumName}: Sincronizado (${currentDbValues.length} valores: [${currentDbValues.join(", ")}])`)
      }
    }

    if (hasDiscrepancies) {
      console.log("\n=======================================================")
      console.log("⚠️  SENTENCIAS SQL DE CORRECCIÓN SUGERIDAS:")
      console.log("=======================================================")
      missingStatements.forEach((stmt) => console.log(stmt))
      console.log("=======================================================\n")
      process.exit(1)
    } else {
      console.log("\n🎉 ¡Todos los enums están 100% sincronizados con la base de datos!")
      process.exit(0)
    }
  } catch (err) {
    console.error("Error al verificar los enums:", err)
    process.exit(1)
  }
}

verifyEnums()
