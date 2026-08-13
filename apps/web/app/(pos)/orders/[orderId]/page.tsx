"use client"

import { useState, useEffect, use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import {
  Loader2, ArrowLeft, Receipt, User, Clock, CheckCircle2, AlertCircle,
  Plus, Minus, Trash2, Search, Utensils, Tag, Edit2, Check
} from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"
import { useRealtimeConnection } from "@/hooks/useRealtimeConnection"

interface OrderDetail {
  id: string
  restaurantId: string
  tableId: string
  tableNumber: string
  sectionId?: string
  waiterId: string
  waiterName: string
  status: string
  coverCount: number
  openedAt: string
  closedAt?: string
}

interface Category {
  id: string
  name: string
  imageUrl?: string
}

interface Product {
  id: string
  name: string
  description?: string
  price: string
  imageUrl?: string
  categoryId: string
  available: boolean
}

interface OrderItem {
  id: string
  orderId: string
  productId: string
  productName: string
  productImageUrl?: string
  quantity: number
  unitPrice: string
  totalPrice: string
  notes?: string
  status: string
  createdAt: string
}

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const resolvedParams = use(params)
  const orderId = resolvedParams.orderId

  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  // State
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addingProductId, setAddingProductId] = useState<string | null>(null)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)

  // Editing Note Inline State
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null)
  const [tempNoteValue, setTempNoteValue] = useState("")

  // Fetch Order Details
  const fetchOrder = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Error al obtener comanda (${res.status}).`)
      }
      const data: OrderDetail = await res.json()
      setOrder(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al cargar datos de la comanda.")
    }
  }, [orderId])

  // Fetch Categories & Products
  const fetchCatalog = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/categories`, { credentials: "include" }),
        fetch(`${getApiUrl()}/api/products`, { credentials: "include" }),
      ])

      if (catRes.ok) {
        const catData: Category[] = await catRes.json()
        setCategories(catData)
      }

      if (prodRes.ok) {
        const prodData: Product[] = await prodRes.json()
        setProducts(prodData.filter((p) => p.available))
      }
    } catch (err) {
      console.error("Error al cargar menú y productos:", err)
    }
  }, [])

  // Fetch Order Items
  const fetchOrderItems = useCallback(async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/items`, {
        credentials: "include",
      })
      if (res.ok) {
        const data: OrderItem[] = await res.json()
        setOrderItems(data)
      }
    } catch (err) {
      console.error("Error al cargar ítems de comanda:", err)
    }
  }, [orderId])

  useEffect(() => {
    if (!session) return

    const loadAll = async () => {
      setLoading(true)
      await Promise.all([fetchOrder(), fetchCatalog(), fetchOrderItems()])
      setLoading(false)
    }

    loadAll()
  }, [session, fetchOrder, fetchCatalog, fetchOrderItems])

  // WebSocket Subscription for Realtime Items Updates
  const { subscribe } = useRealtimeConnection(session?.user?.restaurantId)

  useEffect(() => {
    const unsubItemsUpdated = subscribe("order:items_updated", (payload: { orderId: string }) => {
      if (payload.orderId === orderId) {
        fetchOrderItems()
        fetchOrder()
      }
    })

    const unsubItemReady = subscribe("order:item_ready", (payload: { orderId: string }) => {
      if (payload.orderId === orderId) {
        fetchOrderItems()
        fetchOrder()
      }
    })

    return () => {
      unsubItemsUpdated()
      unsubItemReady()
    }
  }, [subscribe, orderId, fetchOrderItems, fetchOrder])

  // Add Product to Order
  const handleAddProduct = async (product: Product) => {
    setAddingProductId(product.id)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          quantity: 1,
        }),
        credentials: "include",
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "No se pudo agregar el producto.")
      }

      await fetchOrderItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al agregar producto.")
    } finally {
      setAddingProductId(null)
    }
  }

  // Update Item Quantity
  const handleUpdateQuantity = async (item: OrderItem, newQty: number) => {
    setUpdatingItemId(item.id)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al actualizar cantidad.")
      }

      await fetchOrderItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo modificar la cantidad.")
    } finally {
      setUpdatingItemId(null)
    }
  }

  // Save Item Note
  const handleSaveNote = async (item: OrderItem) => {
    setUpdatingItemId(item.id)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: tempNoteValue }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al guardar nota.")
      }

      setEditingNoteItemId(null)
      await fetchOrderItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo guardar la nota.")
    } finally {
      setUpdatingItemId(null)
    }
  }

  // Delete Item
  const handleDeleteItem = async (itemId: string) => {
    setUpdatingItemId(itemId)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/items/${itemId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al eliminar ítem.")
      }

      await fetchOrderItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo eliminar el ítem.")
    } finally {
      setUpdatingItemId(null)
    }
  }

  // Send Pending Items to Kitchen / KDS
  const [sendingToKitchen, setSendingToKitchen] = useState(false)
  const handleSendToKitchen = async () => {
    setSendingToKitchen(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/send-to-kitchen`, {
        method: "POST",
        credentials: "include",
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "No se pudieron enviar los ítems a cocina.")
      }

      await fetchOrderItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al enviar comanda a cocina.")
    } finally {
      setSendingToKitchen(false)
    }
  }

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategoryId ? p.categoryId === selectedCategoryId : true
    const matchesSearch = searchQuery
      ? p.name.toLowerCase().includes(searchQuery.toLowerCase())
      : true
    return matchesCategory && matchesSearch
  })

  // Total Calculation
  const totalAmount = orderItems.reduce((acc, item) => acc + Number(item.totalPrice), 0)

  if (sessionPending || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando toma de pedidos...</p>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-4 md:p-8 overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto z-10 relative space-y-6">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <Link href="/map" className="inline-flex items-center text-xs text-slate-400 hover:text-indigo-400 gap-1.5 mb-1.5 transition-all group">
              <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-all" />
              Volver al Mapa de Mesas
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                <Receipt className="h-7 w-7 text-emerald-400" />
                Mesa <span className="bg-linear-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent font-black">#{order?.tableNumber || "N/A"}</span>
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Comanda Abierta
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-1 flex items-center gap-4">
              <span className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-slate-500" /> Mozo: {order?.waiterName || "N/A"}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-500" /> {order ? new Date(order.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""} hs</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {(session?.user?.role === "owner" || session?.user?.role === "manager" || session?.user?.role === "cashier") && (
              <Button
                onClick={() => router.push(`/orders/${orderId}/close`)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
              >
                <Receipt className="h-4 w-4" />
                Cerrar Cuenta
              </Button>
            )}
            <Button
              onClick={() => router.push("/map")}
              variant="outline"
              className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
            >
              Volver al Mapa
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

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Catalog (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search Bar & Category Filter */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <Input
                  type="text"
                  placeholder="Buscar producto por nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border-slate-800 pl-10 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              {/* Horizontal Category Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-800">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                    selectedCategoryId === null
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200"
                  }`}
                >
                  Todas las categorías
                </button>

                {categories.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
                        isSelected
                          ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-500/20"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.length === 0 ? (
                <div className="col-span-full py-12 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                  <Utensils className="mx-auto h-10 w-10 text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No se encontraron productos disponibles</p>
                </div>
              ) : (
                filteredProducts.map((prod) => {
                  const isAdding = addingProductId === prod.id
                  const existingQtyInCart = orderItems
                    .filter((item) => item.productId === prod.id)
                    .reduce((acc, item) => acc + item.quantity, 0)

                  return (
                    <button
                      key={prod.id}
                      onClick={() => handleAddProduct(prod)}
                      disabled={isAdding}
                      className="group relative flex flex-col justify-between p-3.5 rounded-2xl border border-slate-800 bg-slate-900/60 hover:bg-slate-850 hover:border-indigo-500/50 text-left transition-all duration-150 active:scale-[0.98] shadow-md"
                    >
                      {existingQtyInCart > 0 && (
                        <span className="absolute -top-2 -right-2 bg-emerald-500 text-slate-950 font-black text-xs h-6 w-6 rounded-full flex items-center justify-center border-2 border-slate-950 shadow-lg animate-in zoom-in-50">
                          {existingQtyInCart}
                        </span>
                      )}

                      <div className="space-y-1">
                        {prod.imageUrl ? (
                          <div className="w-full h-24 rounded-xl overflow-hidden mb-2 bg-slate-950 border border-slate-800">
                            <img src={prod.imageUrl} alt={prod.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          </div>
                        ) : (
                          <div className="w-full h-20 rounded-xl mb-2 bg-slate-950/80 border border-slate-800 flex items-center justify-center text-slate-600">
                            <Utensils className="h-6 w-6" />
                          </div>
                        )}
                        <h4 className="font-bold text-sm text-slate-200 group-hover:text-white line-clamp-2">
                          {prod.name}
                        </h4>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/80">
                        <span className="text-sm font-extrabold text-emerald-400">
                          ${Number(prod.price).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                        </span>
                        <div className="h-7 w-7 rounded-lg bg-indigo-600/20 group-hover:bg-indigo-600 text-indigo-400 group-hover:text-white flex items-center justify-center transition-colors">
                          {isAdding ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Column: Order Items / Cart (5 cols) */}
          <div className="lg:col-span-5">
            <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md text-white sticky top-4 shadow-xl">
              <CardHeader className="border-b border-slate-800/80 pb-4">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-emerald-400" />
                    Items en Comanda
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {orderItems.length} {orderItems.length === 1 ? "producto" : "productos"}
                  </span>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {orderItems.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                    <Utensils className="mx-auto h-10 w-10 text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-400">La comanda está vacía</p>
                    <p className="text-xs text-slate-500 mt-1">Tocá productos del menú a la izquierda para agregarlos.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                    {orderItems.map((item) => {
                      const isUpdating = updatingItemId === item.id
                      const isEditingNote = editingNoteItemId === item.id

                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col gap-2 transition-all hover:border-slate-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-sm text-slate-200">{item.productName}</h5>
                                {item.status === "pending" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Pendiente
                                  </span>
                                )}
                                {item.status === "sent_to_kitchen" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                                    <CheckCircle2 className="h-2.5 w-2.5" /> En Cocina / Barra
                                  </span>
                                )}
                                {item.status === "ready" && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20 flex items-center gap-1 animate-pulse">
                                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> ✅ Listo para retirar
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400">
                                ${Number(item.unitPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })} c/u
                              </p>
                            </div>
                            <span className="font-extrabold text-sm text-emerald-400">
                              ${Number(item.totalPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {/* Notes field */}
                          {isEditingNote ? (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Input
                                type="text"
                                placeholder="Ej. sin cebolla, bien cocido..."
                                value={tempNoteValue}
                                onChange={(e) => setTempNoteValue(e.target.value)}
                                className="h-7 text-xs bg-slate-900 border-slate-700 text-slate-100"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={() => handleSaveNote(item)}
                                className="h-7 px-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-xs text-slate-400 mt-0.5">
                              {item.notes ? (
                                <button
                                  onClick={() => {
                                    setEditingNoteItemId(item.id)
                                    setTempNoteValue(item.notes || "")
                                  }}
                                  className="inline-flex items-center gap-1 text-amber-400/90 hover:text-amber-300 italic font-medium"
                                >
                                  <Tag className="h-3 w-3" />
                                  "{item.notes}"
                                </button>
                              ) : (
                                item.status === "pending" && (
                                  <button
                                    onClick={() => {
                                      setEditingNoteItemId(item.id)
                                      setTempNoteValue("")
                                    }}
                                    className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-300 text-[11px]"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                    + Agregar nota/modificador
                                  </button>
                                )
                              )}
                            </div>
                          )}

                          {/* Controls Bar (solo permite editar si está pendiente) */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-900 mt-1">
                            {item.status === "pending" ? (
                              <>
                                <div className="flex items-center gap-1 bg-slate-900 rounded-lg border border-slate-800 p-0.5">
                                  <button
                                    onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                                    disabled={isUpdating}
                                    className="h-6 w-6 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors disabled:opacity-50"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="w-8 text-center font-bold text-xs">{item.quantity}</span>
                                  <button
                                    onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                                    disabled={isUpdating}
                                    className="h-6 w-6 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors disabled:opacity-50"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteItem(item.id)}
                                  disabled={isUpdating}
                                  className="h-7 w-7 p-0 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center justify-between w-full text-xs text-slate-500">
                                <span>Cantidad: <strong className="text-slate-300">{item.quantity}</strong></span>
                                <span className="italic text-[11px] text-indigo-400/80">Enviado marcha</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Total Summary Footer & Send to Kitchen Button */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex justify-between items-center text-lg font-extrabold">
                    <span className="text-slate-300">Total Acumulado</span>
                    <span className="text-emerald-400 text-2xl">
                      ${totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {orderItems.some((item) => item.status === "pending") && (
                    <Button
                      onClick={handleSendToKitchen}
                      disabled={sendingToKitchen}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {sendingToKitchen ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Enviando a marcha...
                        </>
                      ) : (
                        <>
                          <Utensils className="h-4 w-4" />
                          Enviar a Cocina / Barra ({orderItems.filter((i) => i.status === "pending").length} {orderItems.filter((i) => i.status === "pending").length === 1 ? "nuevo" : "nuevos"})
                        </>
                      )}
                    </Button>
                  )}

                  <p className="text-xs text-slate-500 text-center">
                    Los productos en marcha son notificados en tiempo real al KDS de Cocina y Barra.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
