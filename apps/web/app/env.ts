import { z } from 'zod'

const clientSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url('NEXT_PUBLIC_API_URL debe ser una URL válida (ej. http://localhost:3001)'),
  NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url('NEXT_PUBLIC_BETTER_AUTH_URL debe ser una URL válida'),
})

const serverSchema = z.object({
  // Agregar variables de entorno exclusivas del servidor aquí (ej. DATABASE_URL, etc. si el frontend accediera directamente)
})

// En Next.js, las variables del cliente se reemplazan estáticamente durante la compilación.
// Es crucial destructurarlas de forma explícita para que se incluyan en el bundle del navegador.
const clientEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
}

const serverEnv = {
  // Vincular las variables exclusivas del servidor aquí
}

const isServer = typeof window === 'undefined'

const mergedSchema = isServer
  ? clientSchema.merge(serverSchema)
  : clientSchema

const envData = isServer
  ? { ...clientEnv, ...serverEnv }
  : clientEnv

const parsed = mergedSchema.safeParse(envData)

if (!parsed.success) {
  console.error('❌ Error de validación en las variables de entorno de Next.js:')
  const formattedErrors = parsed.error.format()
  for (const [key, value] of Object.entries(formattedErrors)) {
    if (key !== '_errors') {
      const errs = value as { _errors: string[] }
      console.error(`  - ${key}: ${errs._errors.join(', ')}`)
    }
  }

  if (isServer) {
    throw new Error('Variables de entorno del frontend inválidas. Deteniendo ejecución.')
  }
}

export const env = parsed.success ? parsed.data : (clientEnv as z.infer<typeof mergedSchema>)
