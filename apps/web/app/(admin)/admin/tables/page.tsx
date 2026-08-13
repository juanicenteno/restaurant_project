"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Loader2, Plus, Edit2, Trash2, ArrowLeft, Store, AlertCircle, CheckCircle2, LayoutGrid, Users, Settings } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

interface Section {
  id: string
  name: string
}

interface Table {
  id: string
  restaurantId: string
  sectionId: string
  sectionName: string
  number: string
  capacity: number
  status: "free" | "occupied" | "reserved" | "waiting_bill" | "cleaning"
  isActive: boolean
  createdAt: string
  updatedAt: string
}

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  free: { label: "Libre", class: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" },
  occupied: { label: "Ocupada", class: "bg-rose-500/10 text-rose-400 border border-rose-500/20" },
  reserved: { label: "Reservada", class: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" },
  waiting_bill: { label: "Esperando Cuenta", class: "bg-amber-500/10 text-amber-400 border border-amber-500/20" },
  cleaning: { label: "Limpieza", class: "bg-purple-500/10 text-purple-400 border border-purple-500/20" },
}

export default function TablesPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  // Data State
  const [tables, setTables] = useState<Table[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filters State
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("")

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [currentTable, setCurrentTable] = useState<Table | null>(null)
  
  // Form State
  const [tableNumber, setTableNumber] = useState("")
  const [tableCapacity, setTableCapacity] = useState("4")
  const [tableSectionId, setTableSectionId] = useState("")
  const [tableStatus, setTableStatus] = useState<Table["status"]>("free")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch sections & tables
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch sections
      const sectionsRes = await fetch(`${getApiUrl()}/api/sections`, {
        credentials: "include",
      })
      if (!sectionsRes.ok) {
        throw new Error("No se pudieron obtener las secciones del local.")
      }
      const sectionsData = await sectionsRes.json()
      setSections(sectionsData)

      // 2. Fetch tables
      const url = selectedSectionFilter 
        ? `${getApiUrl()}/api/tables?sectionId=${selectedSectionFilter}`
        : `${getApiUrl()}/api/tables`

      const tablesRes = await fetch(url, {
        credentials: "include",
      })
      if (!tablesRes.ok) {
        throw new Error("No se pudieron obtener las mesas.")
      }
      const tablesData = await tablesRes.json()
      setTables(tablesData)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error de comunicación con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchData()
    }
  }, [session, selectedSectionFilter])

  // Handle Save (Create / Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tableNumber.trim() || !tableSectionId) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const url = modalMode === "create"
        ? `${getApiUrl()}/api/tables`
        : `${getApiUrl()}/api/tables/${currentTable?.id}`

      const method = modalMode === "create" ? "POST" : "PUT"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: tableNumber.trim(),
          capacity: Number(tableCapacity),
          sectionId: tableSectionId,
          ...(modalMode === "edit" && { status: tableStatus }),
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al guardar la mesa.")
      }

      setSuccess(
        modalMode === "create"
          ? `Mesa "${tableNumber}" creada exitosamente.`
          : `Mesa "${tableNumber}" modificada exitosamente.`
      )
      setIsModalOpen(false)
      setTableNumber("")
      setTableCapacity("4")
      setTableSectionId("")
      setCurrentTable(null)
      fetchData()

      // Auto-hide success alert
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete
  const handleDelete = async () => {
    if (!currentTable) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`${getApiUrl()}/api/tables/${currentTable.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "No se pudo eliminar la mesa.")
      }

      setSuccess(`Mesa "${currentTable.number}" eliminada exitosamente.`)
      setIsDeleteModalOpen(false)
      setCurrentTable(null)
      fetchData()

      // Auto-hide success alert
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || "Error al eliminar la mesa.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modals Helpers
  const openCreateModal = () => {
    if (sections.length === 0) return
    setModalMode("create")
    setTableNumber("")
    setTableCapacity("4")
    setTableSectionId(sections[0]?.id || "")
    setTableStatus("free")
    setCurrentTable(null)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (table: Table) => {
    setModalMode("edit")
    setTableNumber(table.number)
    setTableCapacity(String(table.capacity))
    setTableSectionId(table.sectionId)
    setTableStatus(table.status)
    setCurrentTable(table)
    setError(null)
    setIsModalOpen(true)
  }

  const openDeleteModal = (table: Table) => {
    setCurrentTable(table)
    setError(null)
    setIsDeleteModalOpen(true)
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando mesas...</p>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-6 md:p-12 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto z-10 relative">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <Link href="/admin" className="inline-flex items-center text-xs text-slate-400 hover:text-indigo-400 gap-1.5 mb-2 transition-all group">
              <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-all" />
              Volver al Panel
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Gestión de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Mesas</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administrá el número, capacidad, área física y estado de tus mesas
            </p>
          </div>
          {sections.length > 0 && (
            <Button 
              onClick={openCreateModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 self-start sm:self-center transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Nueva Mesa
            </Button>
          )}
        </header>

        {/* Global Feedback */}
        {success && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-400 border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {error && !isModalOpen && !isDeleteModalOpen && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in zoom-in-95 duration-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* CRITICAL SAFETY NOTIFICATION: Missing Sections */}
        {!loading && sections.length === 0 && (
          <div className="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center animate-in fade-in slide-in-from-top-4 duration-300">
            <Store className="mx-auto h-12 w-12 text-amber-500 mb-3" />
            <h3 className="text-lg font-bold text-amber-400">Sección Requerida</h3>
            <p className="text-slate-300 text-sm mt-2 max-w-lg mx-auto">
              Para poder crear una mesa, primero necesitás tener al menos una sección física registrada (ej. Salón, Terraza) donde ubicarla.
            </p>
            <div className="mt-5">
              <Link href="/admin/sections">
                <Button className="bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all">
                  Crear Primera Sección
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Table List & Filters */}
        {sections.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5 text-indigo-400" />
                  Listado de Mesas
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Mesas habilitadas para el servicio
                </CardDescription>
              </div>

              {/* Dropdown filter */}
              <div className="flex items-center gap-2">
                <Label htmlFor="filterSection" className="text-xs text-slate-400 whitespace-nowrap">Filtrar por Área:</Label>
                <select
                  id="filterSection"
                  value={selectedSectionFilter}
                  onChange={(e) => setSelectedSectionFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-md text-xs px-3 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Todas las áreas</option>
                  {sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
                  <p className="text-sm">Obteniendo mesas...</p>
                </div>
              ) : tables.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                  <LayoutGrid className="mx-auto h-12 w-12 text-slate-600 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-300">No hay mesas encontradas</h3>
                  <p className="text-slate-500 text-sm mt-1 mb-6">
                    {selectedSectionFilter 
                      ? "No hay mesas registradas en esta sección en particular."
                      : "Registrá tu primera mesa física para habilitar el POS."
                    }
                  </p>
                  {!selectedSectionFilter && (
                    <Button 
                      onClick={openCreateModal}
                      variant="outline"
                      className="border-slate-800 hover:bg-slate-900 text-slate-300"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar Mesa
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Mesa</th>
                        <th className="px-6 py-4 font-semibold">Sección</th>
                        <th className="px-6 py-4 font-semibold">Capacidad</th>
                        <th className="px-6 py-4 font-semibold">Estado</th>
                        <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {tables.map((table) => {
                        const statusConfig = STATUS_LABELS[table.status] || { label: table.status, class: "bg-slate-500/10 text-slate-400" }
                        return (
                          <tr key={table.id} className="hover:bg-slate-900/40 transition-colors group">
                            <td className="px-6 py-4 font-bold text-slate-200">
                              Mesa {table.number}
                            </td>
                            <td className="px-6 py-4 text-slate-300">
                              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md text-xs border border-slate-700/60">
                                {table.sectionName}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-300">
                              <div className="flex items-center gap-1.5 text-xs">
                                <Users className="h-3.5 w-3.5 text-slate-500" />
                                <span>{table.capacity} comensales</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusConfig.class}`}>
                                {statusConfig.label}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right space-x-1.5">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openEditModal(table)}
                                className="h-8 w-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all rounded-md"
                                title="Editar mesa"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => openDeleteModal(table)}
                                className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-md"
                                title="Eliminar mesa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* CREATE & EDIT DIALOG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold">
                {modalMode === "create" ? "Nueva Mesa" : "Editar Mesa"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {modalMode === "create" 
                  ? "Añadí una nueva mesa asignándole número, capacidad y área."
                  : "Modificá la configuración física de la mesa."
                }
              </p>
            </div>

            <form onSubmit={handleSave}>
              <div className="p-6 space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive-foreground border border-destructive/20 animate-in fade-in duration-150">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="modalTableNumber" className="text-slate-300">Número / Identificador de Mesa</Label>
                  <Input
                    id="modalTableNumber"
                    type="text"
                    placeholder="Ej. 1, 14, Terraza-3"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                    autoFocus
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="modalTableCapacity" className="text-slate-300">Capacidad (Pax)</Label>
                    <Input
                      id="modalTableCapacity"
                      type="number"
                      min="1"
                      placeholder="4"
                      value={tableCapacity}
                      onChange={(e) => setTableCapacity(e.target.value)}
                      className="bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modalTableSection" className="text-slate-300">Ubicación / Área</Label>
                    <select
                      id="modalTableSection"
                      value={tableSectionId}
                      onChange={(e) => setTableSectionId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-9"
                      required
                      disabled={isSubmitting}
                    >
                      {sections.map((sec) => (
                        <option key={sec.id} value={sec.id}>{sec.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Status Dropdown - Editable only in Edit Mode for testing purposes */}
                {modalMode === "edit" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="modalTableStatus" className="text-slate-300 flex items-center gap-1">
                      <Settings className="h-3.5 w-3.5 text-slate-400" />
                      Estado del Servicio (Testing)
                    </Label>
                    <select
                      id="modalTableStatus"
                      value={tableStatus}
                      onChange={(e) => setTableStatus(e.target.value as Table["status"])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-9 capitalize"
                      required
                      disabled={isSubmitting}
                    >
                      {Object.keys(STATUS_LABELS).map((statusKey) => (
                        <option key={statusKey} value={statusKey}>{STATUS_LABELS[statusKey]?.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-850 flex justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200"
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                  disabled={isSubmitting || !tableNumber.trim() || !tableSectionId}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG MODAL */}
      {isDeleteModalOpen && currentTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold flex items-center gap-2 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                ¿Eliminar Mesa?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                La mesa será retirada de forma definitiva del panel POS.
              </p>
            </div>

            <div className="p-6 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive-foreground border border-destructive/20 animate-in fade-in duration-150">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <p className="text-sm text-slate-300">
                ¿Estás seguro de que deseas eliminar la mesa número{" "}
                <span className="font-bold text-white">"{currentTable.number}"</span> (ubicada en {currentTable.sectionName})?
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-950/40 border-t border-slate-850 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDeleteModalOpen(false)}
                className="border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200"
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  "Confirmar y Eliminar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
