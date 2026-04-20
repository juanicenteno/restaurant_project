import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { logger } from 'hono/logger'
import { auth } from './auth.js'
import type { AppVariables } from './types.js'

const app = new Hono<{ Variables: AppVariables }>()

app.use('*', logger())

app.onError((err, c) => {
  console.error(`${err}`)
  return c.text('Error interno del servidor', 500)
})

app.get('/', (c) => {
  return c.json({
    message: 'Sistema de Gestión para Restaurantes API v1.0',
    status: 'online'
  })
})

app.on(['GET', 'POST'], '/api/auth/**', (c) => {
  return auth.handler(c.req.raw)
})

const port = Number(process.env.PORT) ?? 3001
console.log(`Servidor corriendo en http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})