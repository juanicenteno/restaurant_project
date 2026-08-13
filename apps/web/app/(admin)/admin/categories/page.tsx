"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Loader2, Plus, Edit2, Trash2, ArrowLeft, Tag, AlertCircle, CheckCircle2, ListOrdered } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

interface Category {
  id: string
  restaurantId: string
  parentId: string | null
  name: string
  description: string | null
  imageUrl: string | null
  station?: "kitchen" | "bar"
  displayOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function CategoriesPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  // Data State
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [currentCategory, setCurrentCategory] = useState<Category | null>(null)
  
  // Form State
  const [categoryName, setCategoryName] = useState("")
  const [categoryDescription, setCategoryDescription] = useState("")
  const [categoryOrder, setCategoryOrder] = useState("")
  const [categoryStation, setCategoryStation] = useState<"kitchen" | "bar">("kitchen")
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch Categories
  const fetchCategories = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/categories`, {
        credentials: "include",
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "No se pudieron obtener las categorías.")
      }

      const data = await res.json()
      setCategories(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al cargar las categorías.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchCategories()
    }
  }, [session])

  // Handle Save (Create / Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryName.trim()) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const url = modalMode === "create"
        ? `${getApiUrl()}/api/categories`
        : `${getApiUrl()}/api/categories/${currentCategory?.id}`

      const method = modalMode === "create" ? "POST" : "PUT"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: categoryName.trim(),
          description: categoryDescription.trim() || null,
          station: categoryStation,
          ...(categoryOrder.trim() !== "" && { displayOrder: Number(categoryOrder) }),
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al guardar la categoría.")
      }

      setSuccess(
        modalMode === "create"
          ? `Categoría "${categoryName}" creada exitosamente.`
          : `Categoría "${categoryName}" modificada exitosamente.`
      )
      setIsModalOpen(false)
      setCategoryName("")
      setCategoryDescription("")
      setCategoryOrder("")
      setCategoryStation("kitchen")
      setCurrentCategory(null)
      fetchCategories()

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
    if (!currentCategory) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`${getApiUrl()}/api/categories/${currentCategory.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "No se pudo eliminar la categoría.")
      }

      setSuccess(`Categoría "${currentCategory.name}" eliminada exitosamente.`)
      setIsDeleteModalOpen(false)
      setCurrentCategory(null)
      fetchCategories()

      // Auto-hide success alert
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || "Error al eliminar la categoría.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modals Helpers
  const openCreateModal = () => {
    setModalMode("create")
    setCategoryName("")
    setCategoryDescription("")
    setCategoryOrder("")
    setCategoryStation("kitchen")
    setCurrentCategory(null)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (category: Category) => {
    setModalMode("edit")
    setCategoryName(category.name)
    setCategoryDescription(category.description || "")
    setCategoryOrder(String(category.displayOrder))
    setCategoryStation(category.station === "bar" ? "bar" : "kitchen")
    setCurrentCategory(category)
    setError(null)
    setIsModalOpen(true)
  }

  const openDeleteModal = (category: Category) => {
    setCurrentCategory(category)
    setError(null)
    setIsDeleteModalOpen(true)
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando categorías...</p>
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
              Categorías de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Menú</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Agrupá los productos de tu menú (ej. Entradas, Platos principales, Bebidas)
            </p>
          </div>
          <Button 
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 self-start sm:self-center transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
            Nueva Categoría
          </Button>
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

        {/* Content Card */}
        <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
          <CardContent className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
                <p className="text-sm">Obteniendo categorías del menú...</p>
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                <Tag className="mx-auto h-12 w-12 text-slate-600 mb-4" />
                <h3 className="text-lg font-semibold text-slate-300">No hay categorías registradas</h3>
                <p className="text-slate-500 text-sm mt-1 mb-6">
                  Crea tu primera categoría de menú para empezar a cargar productos.
                </p>
                <Button 
                  onClick={openCreateModal}
                  variant="outline"
                  className="border-slate-800 hover:bg-slate-900 text-slate-300"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Agregar Categoría
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-semibold w-16 text-center">Orden</th>
                      <th className="px-6 py-4 font-semibold">Nombre de Categoría</th>
                      <th className="px-6 py-4 font-semibold">Estación KDS</th>
                      <th className="px-6 py-4 font-semibold">Descripción</th>
                      <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {categories.map((category) => (
                      <tr key={category.id} className="hover:bg-slate-900/40 transition-colors group">
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center justify-center bg-slate-800/80 px-2 py-0.5 rounded-md text-xs font-mono font-bold text-indigo-400 border border-slate-700/60">
                            {category.displayOrder}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-200">
                          {category.name}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                            category.station === "bar"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                              : "bg-indigo-500/10 text-indigo-300 border-indigo-500/30"
                          }`}>
                            {category.station === "bar" ? "🍹 Barra" : "🍳 Cocina"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400 text-xs">
                          {category.description || <span className="text-slate-600 italic">Sin descripción</span>}
                        </td>
                        <td className="px-6 py-4 text-right space-x-1.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openEditModal(category)}
                            className="h-8 w-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all rounded-md"
                            title="Editar categoría"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openDeleteModal(category)}
                            className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-md"
                            title="Eliminar categoría"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CREATE & EDIT DIALOG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold">
                {modalMode === "create" ? "Nueva Categoría" : "Editar Categoría"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {modalMode === "create" 
                  ? "Añadí una nueva categoría para organizar tus platos y bebidas."
                  : "Modificá los detalles de la categoría seleccionada."
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
                  <Label htmlFor="modalCategoryName" className="text-slate-300">Nombre de la Categoría</Label>
                  <Input
                    id="modalCategoryName"
                    type="text"
                    placeholder="Ej. Entradas, Platos Fuertes, Postres, Vinos"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    autoFocus
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modalCategoryStation" className="text-slate-300">Estación de Destino KDS</Label>
                  <select
                    id="modalCategoryStation"
                    value={categoryStation}
                    onChange={(e) => setCategoryStation(e.target.value as "kitchen" | "bar")}
                    className="w-full h-9 rounded-md bg-slate-950/40 border border-slate-800 text-slate-100 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={isSubmitting}
                  >
                    <option value="kitchen">🍳 Cocina (Platos, entradas, postres)</option>
                    <option value="bar">🍹 Barra (Bebidas, tragos, vinos, café)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modalCategoryDescription" className="text-slate-300">Descripción (Opcional)</Label>
                  <Input
                    id="modalCategoryDescription"
                    type="text"
                    placeholder="Ej. Platos de entrada para compartir antes de la comida"
                    value={categoryDescription}
                    onChange={(e) => setCategoryDescription(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modalCategoryOrder" className="text-slate-300 flex items-center gap-1">
                    <ListOrdered className="h-3.5 w-3.5 text-slate-550" />
                    Posición de Orden (Opcional)
                  </Label>
                  <Input
                    id="modalCategoryOrder"
                    type="number"
                    min="0"
                    placeholder="Asignar siguiente orden automático"
                    value={categoryOrder}
                    onChange={(e) => setCategoryOrder(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    disabled={isSubmitting}
                  />
                </div>
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
                  disabled={isSubmitting || !categoryName.trim()}
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
      {isDeleteModalOpen && currentCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold flex items-center gap-2 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                ¿Eliminar Categoría?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                La categoría y sus agrupaciones serán retiradas definitivamente.
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
                ¿Estás seguro de que deseas eliminar la categoría de menú{" "}
                <span className="font-bold text-white">"{currentCategory.name}"</span>?
              </p>

              <div className="rounded-lg bg-slate-950/40 p-3 text-xs text-amber-500 border border-amber-500/20">
                ⚠️ <span className="font-semibold">Nota:</span> Si la categoría posee platos o bebidas asociadas en tu base de datos, la acción será rechazada para evitar inconsistencias en el menú.
              </div>
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
