"use client"

import { useEffect, useRef, useCallback } from "react"
import { getApiUrl } from "@/lib/get-api-url"

export interface RealtimeEvent {
  type: string
  payload: any
  timestamp: string
}

export type EventHandler = (payload: any) => void

export function useRealtimeConnection(restaurantId: string | null | undefined) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const subscribe = useCallback((eventType: string, handler: EventHandler) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set())
    }
    handlersRef.current.get(eventType)?.add(handler)

    // Cleanup subscription
    return () => {
      handlersRef.current.get(eventType)?.delete(handler)
    }
  }, [])

  useEffect(() => {
    if (!restaurantId) return

    let isComponentMounted = true
    let backoffDelay = 1000

    const connect = () => {
      if (!isComponentMounted) return

      // Convertir HTTP/HTTPS API URL a WS/WSS URL
      const baseUrl = getApiUrl().replace(/^http/, "ws")
      const wsUrl = `${baseUrl}/ws/${restaurantId}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!isComponentMounted) {
          ws.close(1000, "Desmontado antes de completar conexión")
          return
        }
        console.log(`⚡ WebSocket conectado al canal del restaurante: ${restaurantId}`)
        backoffDelay = 1000
      }

      ws.onmessage = (event) => {
        if (!isComponentMounted) return
        try {
          const realtimeEvent: RealtimeEvent = JSON.parse(event.data)
          const handlers = handlersRef.current.get(realtimeEvent.type)
          if (handlers) {
            handlers.forEach((fn) => fn(realtimeEvent.payload))
          }
        } catch (err) {
          console.error("Error al deserializar evento WebSocket:", err)
        }
      }

      ws.onclose = (evt) => {
        if (!isComponentMounted) return
        console.warn(
          `⚠️ WebSocket desconectado (código: ${evt.code}, razón: "${evt.reason || 'sin detalle'}", wasClean: ${evt.wasClean}). Reintentando en ${backoffDelay}ms...`
        )
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isComponentMounted) {
            backoffDelay = Math.min(backoffDelay * 1.5, 10000)
            connect()
          }
        }, backoffDelay)
      }

      ws.onerror = () => {
        if (!isComponentMounted) return
        console.warn(`⚠️ Notificación de evento error en WebSocket.`)
      }
    }

    connect()

    return () => {
      isComponentMounted = false

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      if (wsRef.current) {
        const ws = wsRef.current
        // Desvincular manejadores antes de cerrar para evitar callbacks sobre componentes desmontados
        ws.onopen = null
        ws.onmessage = null
        ws.onclose = null
        ws.onerror = null

        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, "Componente desmontado")
        }
        wsRef.current = null
      }
    }
  }, [restaurantId])

  return { subscribe }
}
