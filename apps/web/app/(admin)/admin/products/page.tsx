"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Loader2, Plus, Edit2, Trash2, ArrowLeft, Tag, AlertCircle, CheckCircle2, DollarSign, Clock, Image as ImageIcon } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

interface Category {
  id: string
  name: string
}

interface Product {
  id: string
  restaurantId: string
  categoryId: string
  categoryName: string
  name: string
  description: string | null
  imageUrl: string | null
  price: string
  estimatedTime: number | null
  displayOrder: number
  available: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function ProductsPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  // Data State
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Filters State
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("")

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null)
  
  // Form State
  const [productName, setProductName] = useState("")
  const [productDescription, setProductDescription] = useState("")
  const [productPrice, setProductPrice] = useState("")
  const [productCategoryId, setProductCategoryId] = useState("")
  const [productImageUrl, setProductImageUrl] = useState("")
  const [productEstimatedTime, setProductEstimatedTime] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo (jpg, jpeg, png, webp)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError("Solo se permiten imágenes (JPG, PNG, WEBP).")
      return
    }

    // Validar tamaño (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setError("La imagen no debe superar los 5MB.")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      // DEUDA TÉCNICA: Si el producto ya tenía una imagen previa en productImageUrl, 
      // por ahora no se elimina del bucket R2 para priorizar la simplicidad del flujo.
      // En el futuro, se podría implementar una función para borrar el objeto previo en R2 antes de reemplazar.

      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`${getApiUrl()}/api/uploads/product-image`, {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al subir la imagen.")
      }

      setProductImageUrl(data.imageUrl)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo subir la imagen.")
    } finally {
      setIsUploading(false)
    }
  }

  // Fetch categories & products
  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch categories
      const categoriesRes = await fetch(`${getApiUrl()}/api/categories`, {
        credentials: "include",
      })
      if (!categoriesRes.ok) {
        throw new Error("No se pudieron obtener las categorías del menú.")
      }
      const categoriesData = await categoriesRes.json()
      setCategories(categoriesData)

      // 2. Fetch products
      const url = selectedCategoryFilter
        ? `${getApiUrl()}/api/products?categoryId=${selectedCategoryFilter}`
        : `${getApiUrl()}/api/products`

      const productsRes = await fetch(url, {
        credentials: "include",
      })
      if (!productsRes.ok) {
        throw new Error("No se pudieron obtener los productos del menú.")
      }
      const productsData = await productsRes.json()
      setProducts(productsData)
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
  }, [session, selectedCategoryFilter])

  // Handle Toggle Availability (PATCH)
  const handleToggleAvailability = async (product: Product) => {
    const newAvailable = !product.available
    setError(null)
    
    // Optimistic UI Update
    setProducts(prev => 
      prev.map(p => p.id === product.id ? { ...p, available: newAvailable } : p)
    )

    try {
      const res = await fetch(`${getApiUrl()}/api/products/${product.id}/availability`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ available: newAvailable }),
        credentials: "include",
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || "No se pudo actualizar la disponibilidad.")
      }

      setSuccess(`Disponibilidad de "${product.name}" actualizada.`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      // Revert Optimistic UI
      setProducts(prev => 
        prev.map(p => p.id === product.id ? { ...p, available: product.available } : p)
      )
      setError(err.message || "Error al actualizar la disponibilidad.")
    }
  }

  // Handle Save (Create / Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName.trim() || !productPrice || !productCategoryId) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const url = modalMode === "create"
        ? `${getApiUrl()}/api/products`
        : `${getApiUrl()}/api/products/${currentProduct?.id}`

      const method = modalMode === "create" ? "POST" : "PUT"

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: productName.trim(),
          description: productDescription.trim() || null,
          price: Number(productPrice),
          categoryId: productCategoryId,
          imageUrl: productImageUrl.trim() || null,
          estimatedTime: productEstimatedTime.trim() ? Number(productEstimatedTime) : null,
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error al guardar el producto.")
      }

      setSuccess(
        modalMode === "create"
          ? `Producto "${productName}" creado exitosamente.`
          : `Producto "${productName}" modificado exitosamente.`
      )
      setIsModalOpen(false)
      setProductName("")
      setProductDescription("")
      setProductPrice("")
      setProductCategoryId("")
      setProductImageUrl("")
      setProductEstimatedTime("")
      setCurrentProduct(null)
      fetchData()

      // Auto-hide success alert
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || "Error al guardar el producto.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Delete
  const handleDelete = async () => {
    if (!currentProduct) return

    setIsSubmitting(false)
    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    try {
      const res = await fetch(`${getApiUrl()}/api/products/${currentProduct.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "No se pudo eliminar el producto.")
      }

      setSuccess(`Producto "${currentProduct.name}" eliminado exitosamente.`)
      setIsDeleteModalOpen(false)
      setCurrentProduct(null)
      fetchData()

      // Auto-hide success alert
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      setError(err.message || "Error al eliminar el producto.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Modals Helpers
  const openCreateModal = () => {
    if (categories.length === 0) return
    setModalMode("create")
    setProductName("")
    setProductDescription("")
    setProductPrice("")
    setProductCategoryId(categories[0]?.id || "")
    setProductImageUrl("")
    setProductEstimatedTime("")
    setCurrentProduct(null)
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (product: Product) => {
    setModalMode("edit")
    setProductName(product.name)
    setProductDescription(product.description || "")
    setProductPrice(product.price)
    setProductCategoryId(product.categoryId)
    setProductImageUrl(product.imageUrl || "")
    setProductEstimatedTime(product.estimatedTime ? String(product.estimatedTime) : "")
    setCurrentProduct(product)
    setError(null)
    setIsModalOpen(true)
  }

  const openDeleteModal = (product: Product) => {
    setCurrentProduct(product)
    setError(null)
    setIsDeleteModalOpen(true)
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando productos...</p>
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
              Gestión de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Productos</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administrá los platos, bebidas y postres de tu menú
            </p>
          </div>
          {categories.length > 0 && (
            <Button 
              onClick={openCreateModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 self-start sm:self-center transition-all duration-200"
            >
              <Plus className="h-4 w-4" />
              Nuevo Producto
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

        {/* CRITICAL SAFETY NOTIFICATION: Missing Categories */}
        {!loading && categories.length === 0 && (
          <div className="mb-8 rounded-xl border border-amber-500/20 bg-amber-500/5 p-6 text-center animate-in fade-in slide-in-from-top-4 duration-300">
            <Tag className="mx-auto h-12 w-12 text-amber-500 mb-3" />
            <h3 className="text-lg font-bold text-amber-400">Categoría Requerida</h3>
            <p className="text-slate-300 text-sm mt-2 max-w-lg mx-auto">
              Para poder crear un producto, primero necesitás tener al menos una categoría de menú creada (ej. Entradas, Bebidas) donde clasificarlo.
            </p>
            <div className="mt-5">
              <Link href="/admin/categories">
                <Button className="bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all">
                  Crear Primera Categoría
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Table List & Filters */}
        {categories.length > 0 && (
          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  <Tag className="h-5 w-5 text-indigo-400" />
                  Listado de Productos
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Artículos del menú de venta
                </CardDescription>
              </div>

              {/* Dropdown filter */}
              <div className="flex items-center gap-2">
                <Label htmlFor="filterCategory" className="text-xs text-slate-400 whitespace-nowrap">Filtrar por Categoría:</Label>
                <select
                  id="filterCategory"
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-md text-xs px-3 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Todas las categorías</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
                  <p className="text-sm">Obteniendo productos...</p>
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                  <Tag className="mx-auto h-12 w-12 text-slate-600 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-300">No hay productos encontrados</h3>
                  <p className="text-slate-500 text-sm mt-1 mb-6">
                    {selectedCategoryFilter 
                      ? "No hay productos registrados en esta categoría en particular."
                      : "Registrá tu primer plato o bebida para armar tu carta."
                    }
                  </p>
                  {!selectedCategoryFilter && (
                    <Button 
                      onClick={openCreateModal}
                      variant="outline"
                      className="border-slate-800 hover:bg-slate-900 text-slate-300"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar Producto
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Producto</th>
                        <th className="px-6 py-4 font-semibold">Categoría</th>
                        <th className="px-6 py-4 font-semibold">Precio</th>
                        <th className="px-6 py-4 font-semibold text-center">Disponible</th>
                        <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {products.map((product) => (
                        <tr key={product.id} className="hover:bg-slate-900/40 transition-colors group">
                          <td className="px-6 py-4 font-bold text-slate-200">
                            <div className="flex items-center gap-3">
                              {product.imageUrl ? (
                                <img 
                                  src={product.imageUrl} 
                                  alt={product.name} 
                                  className="h-10 w-10 object-cover rounded-lg border border-slate-800"
                                  onError={(e) => {
                                    console.error("Error cargando imagen del producto:", product.imageUrl)
                                    ;(e.target as any).style.display = "none"
                                  }}
                                />
                              ) : (
                                <div className="h-10 w-10 bg-slate-950/60 border border-slate-850 rounded-lg flex items-center justify-center text-slate-600">
                                  <ImageIcon className="h-4 w-4" />
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-200">{product.name}</p>
                                {product.description && (
                                  <p className="text-slate-500 text-xs font-normal max-w-xs truncate">{product.description}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-slate-300">
                            <span className="bg-slate-800/80 px-2.5 py-1 rounded-md text-xs border border-slate-700/60">
                              {product.categoryName}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-200">
                            ${Number(product.price).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleToggleAvailability(product)}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                product.available ? "bg-indigo-600" : "bg-slate-800"
                              }`}
                              title={product.available ? "Marcar como no disponible" : "Marcar como disponible"}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  product.available ? "translate-x-4" : "translate-x-0"
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right space-x-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openEditModal(product)}
                              className="h-8 w-8 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all rounded-md"
                              title="Editar producto"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => openDeleteModal(product)}
                              className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-md"
                              title="Eliminar producto"
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
        )}
      </div>

      {/* CREATE & EDIT DIALOG MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold">
                {modalMode === "create" ? "Nuevo Producto" : "Editar Producto"}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {modalMode === "create"
                  ? "Crea un plato, bebida o artículo para vender en el menú."
                  : "Modificá la ficha técnica del producto seleccionado."
                }
              </p>
            </div>

            <form onSubmit={handleSave}>
              <div className="p-6 space-y-3.5 overflow-y-auto max-h-[70vh]">
                {error && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive-foreground border border-destructive/20 animate-in fade-in duration-150">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="modalProductName" className="text-slate-300">Nombre del Producto</Label>
                  <Input
                    id="modalProductName"
                    type="text"
                    placeholder="Ej. Hamburguesa Completa, Coca-Cola 350ml"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    autoFocus
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="modalProductDesc" className="text-slate-300">Descripción (Opcional)</Label>
                  <Input
                    id="modalProductDesc"
                    type="text"
                    placeholder="Ej. Medallón de carne 180g, queso cheddar, panceta, lechuga"
                    value={productDescription}
                    onChange={(e) => setProductDescription(e.target.value)}
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="modalProductPrice" className="text-slate-300 flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-slate-500" />
                      Precio ($)
                    </Label>
                    <Input
                      id="modalProductPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1200.00"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                      className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modalProductCategory" className="text-slate-300">Categoría</Label>
                    <select
                      id="modalProductCategory"
                      value={productCategoryId}
                      onChange={(e) => setProductCategoryId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-9"
                      required
                      disabled={isSubmitting}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5 text-slate-550" />
                      Imagen del Producto
                    </Label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          id="modalProductImgFile"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="bg-slate-950/40 border-slate-800 text-slate-100 text-xs focus-visible:ring-indigo-500 file:bg-slate-800 file:hover:bg-slate-700 file:text-slate-200 file:border-0 file:rounded-md file:text-xs file:font-semibold cursor-pointer h-9 py-1"
                          disabled={isSubmitting || isUploading}
                        />
                        {isUploading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />}
                      </div>
                      <Input
                        id="modalProductImg"
                        type="text"
                        placeholder="O pegá una URL directa de imagen"
                        value={productImageUrl}
                        onChange={(e) => setProductImageUrl(e.target.value)}
                        className="bg-slate-950/40 border-slate-800 text-xs text-slate-350 focus-visible:ring-indigo-500 h-8"
                        disabled={isSubmitting || isUploading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="modalProductTime" className="text-slate-300 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      Prep. Estimada (Minutos)
                    </Label>
                    <Input
                      id="modalProductTime"
                      type="number"
                      min="0"
                      placeholder="Ej. 15"
                      value={productEstimatedTime}
                      onChange={(e) => setProductEstimatedTime(e.target.value)}
                      className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                      disabled={isSubmitting}
                    />
                  </div>
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
                  disabled={isSubmitting || !productName.trim() || !productPrice || !productCategoryId}
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
      {isDeleteModalOpen && currentProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden text-white">
            <div className="px-6 pt-6 pb-4 border-b border-slate-850">
              <h3 className="text-xl font-bold flex items-center gap-2 text-red-400">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                ¿Eliminar Producto?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                El producto seleccionado será removido permanentemente de la carta.
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
                ¿Estás seguro de que deseas eliminar el producto{" "}
                <span className="font-bold text-white">"{currentProduct.name}"</span> (Categoría: {currentProduct.categoryName})?
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
