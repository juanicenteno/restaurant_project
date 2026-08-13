"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { TableMap, type TableItem } from "@/components/pos/TableMap"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Loader2, ArrowLeft, LayoutGrid, Map, RefreshCw, Edit3, Eye, Plus, CheckCircle2, AlertCircle, X } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"
import { useRealtimeConnection } from "@/hooks/useRealtimeConnection"

interface Section {
  id: string
  name: string
  displayOrder: number
}

const STATUS_LEGEND = [
  { status: "free", label: "Libre", colorBg: "bg-emerald-500", colorText: "text-emerald-400" },
  { status: "occupied", label: "Ocupada", colorBg: "bg-rose-500", colorText: "text-rose-400" },
  { status: "reserved", label: "Reservada", colorBg: "bg-indigo-500", colorText: "text-indigo-400" },
  { status: "waiting_bill", label: "Esperando Cuenta", colorBg: "bg-amber-500", colorText: "text-amber-400" },
  { status: "cleaning", label: "Limpieza", colorBg: "bg-purple-500", colorText: "text-purple-400" },
]

export default function TableMapPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  const [sections, setSections] = useState<Section[]>([])
  const [tables, setTables] = useState<TableItem[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  // Mode & UI State
  const [isEditMode, setIsEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Add Table Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState("")
  const [newTableCapacity, setNewTableCapacity] = useState("4")
  const [newTableShape, setNewTableShape] = useState<"rectangle" | "circle" | "square">("square")
  const [isSubmittingNewTable, setIsSubmittingNewTable] = useState(false)

  // Delete Confirmation Modal
  const [tableToDeleteId, setTableToDeleteId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch Sections
      const secRes = await fetch(`${getApiUrl()}/api/sections`, {
        credentials: "include",
      })

      if (!secRes.ok) {
        throw new Error(`No se pudieron cargar las secciones del local (${secRes.status}).`)
      }

      const secData: Section[] = await secRes.json()
      setSections(secData)

      if (secData.length > 0 && secData[0] && !selectedSectionId) {
        setSelectedSectionId(secData[0].id)
      }

      // 2. Fetch Tables
      const tblRes = await fetch(`${getApiUrl()}/api/tables`, {
        credentials: "include",
      })

      if (!tblRes.ok) {
        throw new Error(`No se pudieron cargar las mesas del local (${tblRes.status}).`)
      }

      const tblData: TableItem[] = await tblRes.json()
      setTables(tblData)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al conectar con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session])

  // Realtime WebSocket Subscription
  const { subscribe } = useRealtimeConnection(session?.user?.restaurantId)

  useEffect(() => {
    // 1. Crear mesa en tiempo real (Idempotente: si ya existe, se actualizan sus propiedades)
    const unsubscribeCreated = subscribe("table:created", (newTable: TableItem) => {
      setTables((prev) => {
        const exists = prev.some((t) => t.id === newTable.id)
        if (exists) {
          return prev.map((t) => (t.id === newTable.id ? { ...t, ...newTable } : t))
        }
        return [...prev, newTable]
      })
    })

    // 2. Actualizar mesa en tiempo real (Idempotente)
    const unsubscribeUpdated = subscribe("table:updated", (updatedTable: TableItem) => {
      setTables((prev) => {
        const exists = prev.some((t) => t.id === updatedTable.id)
        if (exists) {
          return prev.map((t) => (t.id === updatedTable.id ? { ...t, ...updatedTable } : t))
        }
        return [...prev, updatedTable]
      })
    })

    // 3. Eliminar mesa en tiempo real
    const unsubscribeDeleted = subscribe("table:deleted", (payload: { id: string }) => {
      setTables((prev) => prev.filter((t) => t.id !== payload.id))
    })

    return () => {
      unsubscribeCreated()
      unsubscribeUpdated()
      unsubscribeDeleted()
    }
  }, [subscribe])

  // Table Click Handler (Abrir nueva comanda en mesa libre O reingresar a comanda de mesa ocupada)
  const handleTableClick = async (table: TableItem) => {
    if (isEditMode) return

    setLoading(true)
    setError(null)

    if (table.status === "occupied") {
      try {
        const res = await fetch(`${getApiUrl()}/api/tables/${table.id}/active-order`, {
          credentials: "include",
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || `No se encontró una comanda abierta para la mesa #${table.number}.`)
        }

        router.push(`/orders/${data.id}`)
      } catch (err: any) {
        console.error(err)
        setError(err.message || `No se pudo obtener la comanda de la mesa #${table.number}.`)
        setLoading(false)
      }
      return
    }

    if (table.status !== "free") {
      setError(`La mesa #${table.number} se encuentra en estado '${table.status}'. Solo podés abrir o reingresar comandas en mesas libres u ocupadas.`)
      setLoading(false)
      setTimeout(() => setError(null), 3000)
      return
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: table.id }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `No se pudo abrir la comanda (${res.status}).`)
      }

      router.push(`/orders/${data.id}`)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al abrir la comanda.")
      setLoading(false)
    }
  }

  // Move Handler (soltar mesa)
  const handleTableMoveEnd = async (tableId: string, posX: number, posY: number) => {
    // Update local state immediately
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, posX, posY } : t))
    )

    try {
      const res = await fetch(`${getApiUrl()}/api/tables/${tableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posX, posY }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo guardar la nueva posición.")
      }
    } catch (err: any) {
      console.error("Error guardando posición:", err)
      setError(err.message || "Error al guardar la posición de la mesa.")
    }
  }

  // Resize Handler (soltar manija de redimensión)
  const handleTableResizeEnd = async (tableId: string, width: number, height: number) => {
    // Update local state immediately
    setTables((prev) =>
      prev.map((t) => (t.id === tableId ? { ...t, width, height } : t))
    )

    try {
      const res = await fetch(`${getApiUrl()}/api/tables/${tableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width, height }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudieron guardar las dimensiones.")
      }
    } catch (err: any) {
      console.error("Error guardando dimensiones:", err)
      setError(err.message || "Error al redimensionar la mesa.")
    }
  }

  // Add Table Form Submit
  const handleAddTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSectionId || !newTableNumber.trim()) return

    setIsSubmittingNewTable(true)
    setError(null)

    // Calculate a default position near top-left or staggered
    const sectionTables = tables.filter((t) => t.sectionId === selectedSectionId)
    const offsetX = 50 + (sectionTables.length % 5) * 110
    const offsetY = 60 + Math.floor(sectionTables.length / 5) * 110

    try {
      const res = await fetch(`${getApiUrl()}/api/tables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: newTableNumber.trim(),
          capacity: Number(newTableCapacity) || 4,
          sectionId: selectedSectionId,
          posX: offsetX,
          posY: offsetY,
          width: 90,
          height: 90,
          shape: newTableShape,
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al crear la mesa.")
      }

      setTables((prev) => [...prev, data])
      setIsAddModalOpen(false)
      setNewTableNumber("")
      setSuccess(`Mesa "${data.number}" agregada correctamente.`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al crear la mesa.")
    } finally {
      setIsSubmittingNewTable(false)
    }
  }

  // Delete Table Handler
  const confirmDeleteTable = async () => {
    if (!tableToDeleteId) return

    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/tables/${tableToDeleteId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Error al eliminar la mesa.")
      }

      setTables((prev) => prev.filter((t) => t.id !== tableToDeleteId))
      setTableToDeleteId(null)
      setSuccess("Mesa eliminada correctamente.")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo eliminar la mesa.")
    }
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando plano de salón...</p>
      </div>
    )
  }

  if (!session) {
    return null
  }

  const canEdit = session.user.role === "owner" || session.user.role === "manager"
  const currentSectionTables = tables.filter(
    (t) => t.sectionId === selectedSectionId
  )

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-4 md:p-8 overflow-x-hidden">
      {/* Background glow decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto z-10 relative space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/pos" className="inline-flex items-center text-xs text-slate-400 hover:text-indigo-400 gap-1 transition-all group">
                <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-all" />
                Volver a POS
              </Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <Map className="h-7 w-7 text-indigo-400" />
              Mapa Visual de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Mesas</span>
            </h1>
            <p className="text-slate-400 text-xs md:text-sm mt-0.5">
              {isEditMode ? "Modo Edición: arrastrá, redimensioná o agregá mesas" : "Visualización del plano del establecimiento"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canEdit && (
              <Button
                onClick={() => setIsEditMode(!isEditMode)}
                className={
                  isEditMode
                    ? "bg-amber-600 hover:bg-amber-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-amber-500/20"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                }
              >
                {isEditMode ? (
                  <>
                    <Eye className="h-4 w-4" />
                    Salir de Edición
                  </>
                ) : (
                  <>
                    <Edit3 className="h-4 w-4" />
                    Editar Layout
                  </>
                )}
              </Button>
            )}

            {isEditMode && (
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-1.5"
                disabled={!selectedSectionId}
              >
                <Plus className="h-4 w-4" />
                Agregar Mesa
              </Button>
            )}

            <Button
              onClick={fetchData}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 gap-2"
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </header>

        {/* Global Feedback */}
        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3.5 text-sm text-emerald-400 border border-emerald-500/20 animate-in fade-in duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3.5 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in duration-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Status Legend Bar */}
        <Card className="border-slate-800/80 bg-slate-900/40 backdrop-blur-md p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Referencias de Estado:
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {STATUS_LEGEND.map((item) => (
                <div key={item.status} className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-850">
                  <span className={`h-2.5 w-2.5 rounded-full ${item.colorBg}`} />
                  <span className={`text-xs font-medium ${item.colorText}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Section Tabs Selector */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {sections.map((section) => {
            const isSelected = section.id === selectedSectionId
            const count = tables.filter((t) => t.sectionId === section.id).length

            return (
              <button
                key={section.id}
                onClick={() => setSelectedSectionId(section.id)}
                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-medium text-sm transition-all whitespace-nowrap border shrink-0 ${
                  isSelected
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200"
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>{section.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  isSelected ? "bg-indigo-500/40 text-white" : "bg-slate-950 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Main Table Map Container */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
            <p className="text-sm">Obteniendo distribución de mesas...</p>
          </div>
        ) : (
          <TableMap
            tables={currentSectionTables}
            canvasWidth={1200}
            canvasHeight={800}
            isEditMode={isEditMode}
            onTableClick={handleTableClick}
            onTableMoveEnd={handleTableMoveEnd}
            onTableResizeEnd={handleTableResizeEnd}
            onTableDelete={(tableId) => setTableToDeleteId(tableId)}
          />
        )}
      </div>

      {/* Modal: Agregar Mesa Nueva */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold mb-1">Agregar Mesa al Plano</h3>
            <p className="text-slate-400 text-xs mb-4">
              Ingresá el número y capacidad para colocar la nueva mesa en esta sección.
            </p>

            <form onSubmit={handleAddTableSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tableName" className="text-slate-300">Número / Nombre de la Mesa</Label>
                <Input
                  id="tableName"
                  placeholder="Ej. Mesa 12"
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tableCap" className="text-slate-300">Capacidad (pax)</Label>
                  <Input
                    id="tableCap"
                    type="number"
                    min={1}
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-slate-100"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tableShape" className="text-slate-300">Forma</Label>
                  <select
                    id="tableShape"
                    value={newTableShape}
                    onChange={(e) => setNewTableShape(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 h-9"
                  >
                    <option value="square">Cuadrada</option>
                    <option value="rectangle">Rectangular</option>
                    <option value="circle">Redonda</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                  disabled={isSubmittingNewTable}
                >
                  {isSubmittingNewTable ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear Mesa"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Eliminación */}
      {tableToDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-rose-400 mb-1">¿Eliminar Mesa?</h3>
            <p className="text-slate-400 text-xs mb-6">
              Esta acción borrará la mesa seleccionada del salón. ¿Deseas continuar?
            </p>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTableToDeleteId(null)}
                className="border-slate-800 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={confirmDeleteTable}
                className="bg-rose-600 hover:bg-rose-500 text-white font-semibold"
              >
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
