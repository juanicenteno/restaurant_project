import { db } from "./client.js"
import * as schema from "./schema.js"
import { is } from "drizzle-orm"
import { PgTable, getTableConfig } from "drizzle-orm/pg-core"

// 1. Extraer todas las definiciones de pgEnum en schema.ts
const schemaEnums: Record<string, string[]> = {}
// 2. Extraer todas las tablas y sus columnas esperadas en schema.ts
const schemaTables: Record<string, string[]> = {}

for (const [key, value] of Object.entries(schema)) {
  if (value && (typeof value === "object" || typeof value === "function")) {
    // Detectar Enums
    const enumName = (value as any).enumName
    const enumValues = (value as any).enumValues
    if (enumName && Array.isArray(enumValues)) {
      schemaEnums[enumName] = enumValues
    }

    // Detectar Tablas de Drizzle
    if (is(value, PgTable)) {
      try {
        const config = getTableConfig(value)
        const tableName = config.name
        const columnNames = config.columns.map((col) => col.name)
        schemaTables[tableName] = columnNames
      } catch (e) {
        // Ignorar si no se puede extraer la configuración de la tabla
      }
    }
  }
}

async function verifySchema() {
  console.log("🔍 AUDITORÍA GENERAL DE ESQUEMA: Verificando Enums y Columnas entre Drizzle schema.ts y PostgreSQL...\n")

  let hasErrors = false

  try {
    // -------------------------------------------------------------
    // AUDITORÍA 1: VERIFICAR ENUMS
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------")
    console.log("1. Verificando Tipos ENUM...")
    console.log("-------------------------------------------------------")
    const enumRes = await db.execute(
      `SELECT t.typname, e.enumlabel 
       FROM pg_type t 
       JOIN pg_enum e ON t.oid = e.enumtypid 
       ORDER BY t.typname, e.enumsortorder;`
    )

    const dbEnums: Record<string, string[]> = {}
    const enumRows = Array.isArray(enumRes) ? enumRes : (enumRes as any).rows || []

    for (const row of enumRows) {
      const typeName = row.typname
      const label = row.enumlabel
      if (!dbEnums[typeName]) {
        dbEnums[typeName] = []
      }
      dbEnums[typeName].push(label)
    }

    const missingEnumStatements: string[] = []

    for (const [enumName, schemaValues] of Object.entries(schemaEnums)) {
      const currentDbValues = dbEnums[enumName] || []
      const missingInDb = schemaValues.filter((v) => !currentDbValues.includes(v))

      if (missingInDb.length > 0) {
        hasErrors = true
        console.error(`❌ ENUM DESSINCRONIZADO: "${enumName}"`)
        console.error(`   - Esperados en schema.ts: [${schemaValues.join(", ")}]`)
        console.error(`   - Reales en Postgres:     [${currentDbValues.join(", ")}]`)
        console.error(`   - FALTANTES EN POSTGRES:  [${missingInDb.join(", ")}]\n`)

        for (const val of missingInDb) {
          missingEnumStatements.push(`ALTER TYPE public."${enumName}" ADD VALUE IF NOT EXISTS '${val}';`)
        }
      } else {
        console.log(`  ✅ Enum "${enumName}": OK (${currentDbValues.length} valores)`)
      }
    }

    // -------------------------------------------------------------
    // AUDITORÍA 2: VERIFICAR COLUMNAS DE TABLAS
    // -------------------------------------------------------------
    console.log("\n-------------------------------------------------------")
    console.log("2. Verificando Estructura de Tablas y Columnas...")
    console.log("-------------------------------------------------------")

    const dbColumnsRes = await db.execute(
      `SELECT table_name, column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public';`
    )

    const dbTables: Record<string, string[]> = {}
    const colRows = Array.isArray(dbColumnsRes) ? dbColumnsRes : (dbColumnsRes as any).rows || []

    for (const row of colRows) {
      const tableName = row.table_name
      const columnName = row.column_name
      if (!dbTables[tableName]) {
        dbTables[tableName] = []
      }
      dbTables[tableName].push(columnName)
    }

    for (const [tableName, expectedCols] of Object.entries(schemaTables)) {
      const actualCols = dbTables[tableName]

      if (!actualCols) {
        hasErrors = true
        console.error(`❌ TABLA FALTANTE EN POSTGRES: "${tableName}" (esperada en schema.ts)`)
        continue
      }

      const missingCols = expectedCols.filter((col) => !actualCols.includes(col))

      if (missingCols.length > 0) {
        hasErrors = true
        console.error(`❌ TABLA CON COLUMNAS FALTANTES: "${tableName}"`)
        console.error(`   - Columnas faltantes en Postgres: [${missingCols.join(", ")}]\n`)
      } else {
        console.log(`  ✅ Tabla "${tableName}": OK (${expectedCols.length} columnas verificadas)`)
      }
    }

    console.log("\n=======================================================")
    if (hasErrors) {
      console.error("⚠️ AUDITORÍA FALLIDA: Existen desincronizaciones entre schema.ts y Postgres.")
      if (missingEnumStatements.length > 0) {
        console.log("\nSQL para corregir enums:")
        missingEnumStatements.forEach((stmt) => console.log(stmt))
      }
      console.log("=======================================================\n")
      process.exit(1)
    } else {
      console.log("🎉 AUDITORÍA COMPLETA EXITOSA: Todas las tablas, columnas y enums coinciden al 100% con Postgres.")
      console.log("=======================================================\n")
      process.exit(0)
    }
  } catch (err) {
    console.error("❌ Error ejecutando la auditoría general de esquema:", err)
    process.exit(1)
  }
}

verifySchema()
