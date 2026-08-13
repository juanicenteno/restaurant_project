"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Loader2, LogOut, Wine, Clock, CheckCircle2, AlertTriangle, AlertCircle,
  Tag, Utensils, RefreshCw, Check
} from "lucide-react"
import { getApiUrl } from "@/lib/get-api-url"
import { useRealtimeConnection } from "@/hooks/useRealtimeConnection"

interface KdsItem {
  id: string
  orderId: string
  productId: string
  productName: string
  quantity: number
  notes?: string | null
  status: string
  sentToKitchenAt?: string | null
  createdAt: string
  tableNumber: string
  waiterName?: string | null
  station: "kitchen" | "bar"
}

interface OrderGroup {
  orderId: string
  tableNumber: string
  waiterName: string
  oldestTime: Date
  items: KdsItem[]
}

export default function KdsBarPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  const [items, setItems] = useState<KdsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState<Date>(new Date())
  const [actionLoadingItemId, setActionLoadingItemId] = useState<string | null>(null)

  // Live Timer ticker (updates every 10 seconds for elapsed time calculations)
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  // Fetch Pending Bar KDS Items
  const fetchKdsItems = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/kds/pending?station=bar`, {
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudieron obtener los pedidos para la barra.")
      }

      const data: KdsItem[] = await res.json()
      setItems(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al cargar la comandera de barra.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (session) {
      fetchKdsItems()
    }
  }, [session, fetchKdsItems])

  // Realtime Connection Subscription
  const { subscribe } = useRealtimeConnection(session?.user?.restaurantId)

  useEffect(() => {
    const unsubNewItems = subscribe("kds:new_items", (payload: { station: string }) => {
      if (payload.station === "bar") {
        fetchKdsItems()
      }
    })

    const unsubItemReady = subscribe("order:item_ready", () => {
      fetchKdsItems()
    })

    const unsubItemsUpdated = subscribe("order:items_updated", () => {
      fetchKdsItems()
    })

    return () => {
      unsubNewItems()
      unsubItemReady()
      unsubItemsUpdated()
    }
  }, [subscribe, fetchKdsItems])

  // Mark Item Status (e.g. to 'ready')
  const handleMarkStatus = async (itemId: string, newStatus: string) => {
    setActionLoadingItemId(itemId)
    try {
      const res = await fetch(`${getApiUrl()}/api/kds/items/${itemId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo actualizar el estado del ítem.")
      }

      await fetchKdsItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al marcar ítem como listo.")
    } finally {
      setActionLoadingItemId(null)
    }
  }

  // Mark all items in an order as Ready
  const handleMarkOrderReady = async (group: OrderGroup) => {
    setLoading(true)
    try {
      await Promise.all(
        group.items.map((item) =>
          fetch(`${getApiUrl()}/api/kds/items/${item.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ready" }),
            credentials: "include",
          })
        )
      )
      await fetchKdsItems()
    } catch (err: any) {
      console.error(err)
      setError("Error al marcar bebidas como listas.")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  // Group Items by Order ID
  const groupedOrders: OrderGroup[] = Object.values(
    items.reduce<Record<string, OrderGroup>>((acc, item) => {
      const timeDate = item.sentToKitchenAt ? new Date(item.sentToKitchenAt) : new Date(item.createdAt)

      let group = acc[item.orderId]
      if (!group) {
        group = {
          orderId: item.orderId,
          tableNumber: item.tableNumber || "N/A",
          waiterName: item.waiterName || "Sin asignar",
          oldestTime: timeDate,
          items: [],
        }
        acc[item.orderId] = group
      }

      group.items.push(item)
      if (timeDate < group.oldestTime) {
        group.oldestTime = timeDate
      }

      return acc
    }, {})
  ).sort((a, b) => a.oldestTime.getTime() - b.oldestTime.getTime())

  if (sessionPending || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando Monitor KDS de Barra...</p>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-4 md:p-8 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto z-10 relative space-y-6">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <Wine className="h-8 w-8 text-purple-400 animate-pulse" />
              Monitor <span className="bg-linear-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent font-black">KDS Barra</span>
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Visualizador marcha de bebidas y tragos en tiempo real — {groupedOrders.length} {groupedOrders.length === 1 ? "pedido en marcha" : "pedidos en marcha"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={fetchKdsItems}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Actualizar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="border-slate-800 hover:bg-slate-900 text-slate-300"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Cerrar Sesión
            </Button>
          </div>
        </header>

        {/* Global Error Banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3.5 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in duration-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Orders Grid */}
        {groupedOrders.length === 0 ? (
          <div className="py-24 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/20 max-w-xl mx-auto space-y-3">
            <Wine className="mx-auto h-12 w-12 text-slate-600 mb-1" />
            <h3 className="text-xl font-bold text-slate-300">No hay marchas pendientes en Barra</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Cuando el mozo pida bebidas o tragos desde el POS, aparecerán automáticamente en esta pantalla.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {groupedOrders.map((group) => {
              const elapsedMinutes = Math.floor((now.getTime() - group.oldestTime.getTime()) / 60000)

              // Delay Alert Colors
              const isUrgent = elapsedMinutes >= 15
              const isWarning = elapsedMinutes >= 10 && elapsedMinutes < 15

              let cardStyle = "border-slate-800 bg-slate-900/60"
              let badgeStyle = "bg-slate-800 text-slate-300 border-slate-700"

              if (isUrgent) {
                cardStyle = "border-red-500/80 bg-red-950/20 shadow-lg shadow-red-500/10 ring-1 ring-red-500/50"
                badgeStyle = "bg-red-500/20 text-red-300 border-red-500/40 font-black animate-pulse"
              } else if (isWarning) {
                cardStyle = "border-amber-500/80 bg-amber-950/20 shadow-md shadow-amber-500/10"
                badgeStyle = "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold"
              }

              return (
                <Card
                  key={group.orderId}
                  className={`backdrop-blur-md text-white transition-all duration-300 flex flex-col justify-between ${cardStyle}`}
                >
                  <div>
                    {/* Header */}
                    <CardHeader className="p-3.5 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-black flex items-center gap-1.5">
                          Mesa <span className="text-purple-400 font-black text-xl">#{group.tableNumber}</span>
                        </CardTitle>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs border flex items-center gap-1 ${badgeStyle}`}>
                          <Clock className="h-3 w-3" />
                          {elapsedMinutes < 1 ? "Ahora mismo" : `hace ${elapsedMinutes} min`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                        <span>Mozo: <strong className="text-slate-200">{group.waiterName}</strong></span>
                        {isUrgent && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      </p>
                    </CardHeader>

                    {/* Items List */}
                    <CardContent className="p-3.5 space-y-2.5">
                      {group.items.map((item) => {
                        const isActionLoading = actionLoadingItemId === item.id

                        return (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col gap-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2">
                                <span className="inline-flex items-center justify-center bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-md font-black text-sm min-w-7 text-center">
                                  {item.quantity}x
                                </span>
                                <div>
                                  <h4 className="font-bold text-sm text-slate-100 leading-snug">
                                    {item.productName}
                                  </h4>
                                </div>
                              </div>

                              <Button
                                size="sm"
                                onClick={() => handleMarkStatus(item.id, "ready")}
                                disabled={isActionLoading}
                                className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shrink-0"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Listo
                                  </>
                                )}
                              </Button>
                            </div>

                            {item.notes && (
                              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs italic font-medium w-fit">
                                <Tag className="h-3 w-3 shrink-0" />
                                "{item.notes}"
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </CardContent>
                  </div>

                  {/* Footer Action */}
                  <div className="p-3 pt-0 border-t border-slate-800/80 mt-2">
                    <Button
                      onClick={() => handleMarkOrderReady(group)}
                      className="w-full bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white font-bold py-2 text-xs transition-colors flex items-center justify-center gap-1.5 mt-2"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Marcar todo listo (Mesa #{group.tableNumber})
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
