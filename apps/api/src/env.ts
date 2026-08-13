import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL debe ser una URL válida (ej. postgresql://...)'),
  PORT: z.coerce.number().default(3001),
  BETTER_AUTH_SECRET: z.string().min(1, 'BETTER_AUTH_SECRET es requerido'),
  BETTER_AUTH_URL: z.string().url('BETTER_AUTH_URL debe ser una URL válida'),
  CLIENT_URL: z.string().url('CLIENT_URL debe ser una URL válida').default('http://localhost:3000'),
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID es requerido'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID es requerido'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY es requerido'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME es requerido'),
  R2_ENDPOINT: z.string().url('R2_ENDPOINT debe ser una URL válida'),
  R2_PUBLIC_URL: z.string().url('R2_PUBLIC_URL debe ser una URL válida'),
  LOCAL_NETWORK_ORIGIN: z.string().optional(),
  MP_CLIENT_ID: z.string().optional(),
  MP_CLIENT_SECRET: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
  MP_REDIRECT_URI: z.string().optional(),
  MP_TEST_ACCESS_TOKEN: z.string().optional(),
  MP_USE_REAL_OAUTH: z.string().optional().transform((val) => val === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Error de validación en las variables de entorno de la API:')
  const formattedErrors = parsed.error.format()
  for (const [key, value] of Object.entries(formattedErrors)) {
    if (key !== '_errors') {
      const errs = value as { _errors: string[] }
      console.error(`  - ${key}: ${errs._errors.join(', ')}`)
    }
  }
  process.exit(1)
}

export const env = parsed.data
