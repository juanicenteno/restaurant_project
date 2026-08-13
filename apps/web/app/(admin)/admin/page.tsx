"use client"

import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2, LogOut, Shield, MapPin, Mail, User } from "lucide-react"

export default function AdminPage() {
  const router = useRouter()
  const { data: rawSession, isPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  const handleLogout = async () => {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando panel de administración...</p>
      </div>
    )
  }

  if (!session) {
    return null // Redirigido por middleware
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-6 md:p-12 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl mx-auto z-10 relative">
        <header className="flex justify-between items-center mb-8 pb-6 border-b border-slate-800">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Panel de <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Administración</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Configuración general y reportes</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout} className="border-slate-800 hover:bg-slate-900 text-slate-300">
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-400" />
                Información de la Sesión Activa
              </CardTitle>
              <CardDescription className="text-slate-400">
                Detalles del usuario autenticado y su restaurante asignado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/60">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    <span>USUARIO</span>
                  </div>
                  <p className="font-semibold text-slate-200">{session.user.name}</p>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/60">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Mail className="h-3.5 w-3.5 text-slate-500" />
                    <span>CORREO</span>
                  </div>
                  <p className="font-semibold text-slate-200">{session.user.email}</p>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/60">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <Shield className="h-3.5 w-3.5 text-slate-500" />
                    <span>ROL DEL USUARIO</span>
                  </div>
                  <p className="font-semibold text-indigo-400 capitalize">{session.user.role}</p>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-800/60">
                  <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-500" />
                    <span>RESTAURANTE ID</span>
                  </div>
                  <p className="font-mono text-xs font-semibold text-slate-300 break-all select-all">
                    {session.user.restaurantId || "No asignado"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white flex flex-col justify-between">
            <CardHeader>
              <CardTitle className="text-xl">Módulos</CardTitle>
              <CardDescription className="text-slate-400">Accesos rápidos disponibles</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button onClick={() => router.push("/admin/sections")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Gestionar Secciones
              </Button>
              <Button onClick={() => router.push("/admin/tables")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Gestionar Mesas
              </Button>
              <Button onClick={() => router.push("/admin/categories")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Gestionar Categorías
              </Button>
              <Button onClick={() => router.push("/admin/products")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Gestionar Productos
              </Button>
              <Button onClick={() => router.push("/admin/settings")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Configuración del Local
              </Button>
              <Button onClick={() => router.push("/admin/staff")} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Gestionar Staff / Equipo
              </Button>
              {session.user.role !== "cook" && (
                <Button onClick={() => router.push("/pos")} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                  Ir al POS (Mesas y Ventas)
                </Button>
              )}

              {(session.user.role === "owner" || session.user.role === "manager" || session.user.role === "cook") && (
                <Button onClick={() => router.push("/kds")} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                  Ir al KDS (Cocina)
                </Button>
              )}

              {(session.user.role === "owner" || session.user.role === "manager" || session.user.role === "bartender") && (
                <Button onClick={() => router.push("/kds-bar")} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700">
                  Ir al KDS (Barra)
                </Button>
              )}
            </CardContent>
            <CardFooter className="text-xs text-slate-500 text-center justify-center border-t border-slate-800/60 pt-4">
              Restaurante Multi-tenant MVP
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
