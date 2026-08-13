"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Loader2, ArrowLeft, Users, UserPlus, Shield, CheckCircle2, AlertCircle, X, Mail } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

interface StaffUser {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  createdAt: string
}

const ROLE_LABELS: Record<string, { name: string; badgeClass: string }> = {
  owner: { name: "Propietario", badgeClass: "bg-purple-500/20 text-purple-300 border-purple-500/40" },
  manager: { name: "Gerente", badgeClass: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40" },
  waiter: { name: "Mozo", badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  cashier: { name: "Cajero", badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  cook: { name: "Cocinero", badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  host: { name: "Recepcionista", badgeClass: "bg-teal-500/20 text-teal-300 border-teal-500/40" },
}

export default function StaffPage() {
  const router = useRouter()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("waiter")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchStaff = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/staff`, {
        credentials: "include",
      })

      if (!res.ok) {
        throw new Error("No se pudo cargar la lista de personal.")
      }

      const data: StaffUser[] = await res.json()
      setStaffList(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al obtener miembros del equipo.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchStaff()
    }
  }, [session])

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !password || !role) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${getApiUrl()}/api/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al registrar miembro del equipo.")
      }

      setSuccess(`Usuario "${data.name}" registrado correctamente.`)
      setIsAddModalOpen(false)
      setName("")
      setEmail("")
      setPassword("")
      setRole("waiter")
      fetchStaff()
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo crear el usuario.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando gestión de personal...</p>
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

      <div className="max-w-5xl mx-auto z-10 relative">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 pb-6 border-b border-slate-800">
          <div>
            <Link href="/admin" className="inline-flex items-center text-xs text-slate-400 hover:text-indigo-400 gap-1.5 mb-2 transition-all group">
              <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-all" />
              Volver al Panel
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Gestión de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Staff</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administrá los usuarios del establecimiento y sus roles de acceso
            </p>
          </div>

          <Button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            <UserPlus className="h-4 w-4" />
            Agregar Miembro del Staff
          </Button>
        </header>

        {/* Feedback Banners */}
        {success && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-400 border border-emerald-500/20 animate-in fade-in duration-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in duration-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Staff Table Card */}
        <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
          <CardHeader className="border-b border-slate-800/60 pb-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-400" />
              Miembros del Equipo
            </CardTitle>
            <CardDescription className="text-slate-400">
              Personal con acceso al sistema y sus funciones habilitadas
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
                <p className="text-sm">Cargando miembros...</p>
              </div>
            ) : staffList.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl bg-slate-950/20">
                <Users className="mx-auto h-12 w-12 text-slate-600 mb-3" />
                <h3 className="text-lg font-semibold text-slate-300">No hay usuarios en el staff</h3>
                <p className="text-slate-500 text-sm mt-1 mb-4">
                  Registrá mozos, cocineros y gerentes para operar el local.
                </p>
                <Button onClick={() => setIsAddModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Agregar Primer Miembro
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/60 text-xs uppercase text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Nombre</th>
                      <th className="px-6 py-4 font-semibold">Correo Electrónico</th>
                      <th className="px-6 py-4 font-semibold text-center">Rol de Acceso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {staffList.map((user) => {
                      const roleConfig = ROLE_LABELS[user.role] || { name: user.role, badgeClass: "bg-slate-800 text-slate-300 border-slate-700" }
                      return (
                        <tr key={user.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-200">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 text-slate-400 flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5 text-slate-600" />
                            {user.email}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${roleConfig.badgeClass}`}>
                              <Shield className="h-3 w-3" />
                              {roleConfig.name}
                            </span>
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
      </div>

      {/* Modal: Crear Usuario de Staff */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold mb-1">Agregar Miembro del Staff</h3>
            <p className="text-slate-400 text-xs mb-4">
              Ingresá las credenciales y el rol asignado al usuario
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="staffName" className="text-slate-300">Nombre Completo</Label>
                <Input
                  id="staffName"
                  type="text"
                  placeholder="Ej. Martín Gómez"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staffEmail" className="text-slate-300">Correo Electrónico</Label>
                <Input
                  id="staffEmail"
                  type="email"
                  placeholder="ej. martin@restaurante.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staffPassword" className="text-slate-300">Contraseña inicial</Label>
                <Input
                  id="staffPassword"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                  minLength={8}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staffRole" className="text-slate-300">Rol asignado</Label>
                <select
                  id="staffRole"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 h-9"
                  required
                >
                  <option value="waiter">Mozo (Toma de pedidos y mesas)</option>
                  <option value="cook">Cocinero (KDS Cocina)</option>
                  <option value="bartender">Bartender (KDS Barra)</option>
                  <option value="cashier">Cajero (Facturación y cobros)</option>
                  <option value="manager">Gerente (Administración y reportes)</option>
                  <option value="host">Recepcionista (Reservas y mapa)</option>
                </select>
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
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registrando...
                    </>
                  ) : (
                    "Crear Usuario"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
