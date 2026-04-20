import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { logger } from 'hono/logger'

const app = new Hono()

// Middleware de logging (Punto 5 del roadmap) 
app.use('*', logger())

// Manejo de errores global (Punto 5 del roadmap) 
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

const port = 3000
console.log(`Servidor corriendo en http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})