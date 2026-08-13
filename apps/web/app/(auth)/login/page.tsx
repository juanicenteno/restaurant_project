"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2, Lock, Mail, AlertCircle } from "lucide-react"
import Link from "next/link"

const loginSchema = z.object({
  email: z.string().email("Ingresá un correo electrónico válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
})

type LoginFormValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  const getRedirectPath = (role: string) => {
    switch (role) {
      case "owner":
      case "manager":
        return "/admin"
      case "waiter":
      case "cashier":
      case "host":
        return "/pos"
      case "cook":
        return "/kds"
      default:
        return "/"
    }
  }

  const onSubmit = async (data: LoginFormValues) => {
    setError(null)
    setIsLoading(true)

    try {
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (response.error) {
        setError(response.error.message || "Credenciales inválidas. Inténtalo de nuevo.")
        setIsLoading(false)
        return
      }

      // Obtener el rol para redirigir
      const sessionResponse = await authClient.getSession()
      const session = sessionResponse.data as unknown as CustomSession | null
      const userRole = session?.user?.role || "waiter"
      const redirectPath = getRedirectPath(userRole)
      
      router.push(redirectPath)
      router.refresh()
    } catch (err: any) {
      setError("Ocurrió un error inesperado al intentar iniciar sesión.")
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-950 to-indigo-950 px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Dynamic background glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full space-y-8 z-10">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-white tracking-tight">
            Antigravity <span className="bg-linear-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Resto</span>
          </h2>
          <p className="mt-3 text-slate-400 text-sm">
            Gestión inteligente y facturación electrónica para tu restaurante
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-white text-center">Inicia sesión</CardTitle>
            <CardDescription className="text-slate-400 text-center">
              Ingresá tus credenciales de acceso
            </CardDescription>
          </CardHeader>
          <form
            method="POST"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit(onSubmit)(e)
            }}
          >
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in zoom-in-95 duration-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="ejemplo@restaurante.com"
                    className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                    disabled={isLoading}
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-400 animate-in slide-in-from-top-1 duration-150">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
                    disabled={isLoading}
                    {...register("password")}
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-red-400 animate-in slide-in-from-top-1 duration-150">{errors.password.message}</p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all duration-200"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  "Ingresar"
                )}
              </Button>
              <div className="text-center text-xs text-slate-400 mt-2">
                ¿No tenés cuenta?{" "}
                <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium underline transition-all">
                  Registrate
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
