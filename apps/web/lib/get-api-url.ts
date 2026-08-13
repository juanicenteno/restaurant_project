/**
 * Determina dinámicamente la URL base de la API en tiempo de ejecución.
 * Si se ejecuta en el navegador (cliente), usa el mismo hostname que la página actual
 * (ej: localhost:3000 -> http://localhost:3001, 192.168.x.x:3000 -> http://192.168.x.x:3001)
 * para evitar bloqueos de cookies entre orígenes distintos.
 */
export function getApiUrl(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"
  }

  const { hostname } = window.location
  const apiPort = "3001"
  return `http://${hostname}:${apiPort}`
}
