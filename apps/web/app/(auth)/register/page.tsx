"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Loader2, Store, User, Mail, Lock, AlertCircle } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

const registerSchema = z.object({
  restaurantName: z.string().min(2, "El nombre del restaurante debe tener al menos 2 caracteres"),
  ownerName: z.string().min(2, "El nombre del administrador debe tener al menos 2 caracteres"),
  email: z.string().email("Ingresá un correo electrónico válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
})

type RegisterFormValues = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      restaurantName: "",
      ownerName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (data: RegisterFormValues) => {
    setError(null)
    setIsLoading(true)

    try {
      // 1. Crear el restaurante y el usuario en una única operación atómica en el backend
      const res = await fetch(`${getApiUrl()}/api/auth/register-restaurant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          restaurantName: data.restaurantName,
          ownerName: data.ownerName,
          email: data.email,
          password: data.password,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setError(result.error || "Ocurrió un error al registrar el restaurante.")
        setIsLoading(false)
        return
      }

      // 2. Iniciar sesión automáticamente después de un registro exitoso
      const loginRes = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (loginRes.error) {
        setError("Restaurante registrado, pero falló el inicio de sesión automático. Por favor, iniciá sesión manualmente.")
        setIsLoading(false)
        return
      }

      // Redirigir directamente al panel del administrador (el rol siempre es owner)
      router.push("/admin")
      router.refresh()
    } catch (err: any) {
      console.error(err)
      setError("No se pudo conectar con el servidor de registro.")
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-linear-to-br from-slate-900 via-slate-950 to-indigo-950 px-4 py-12 sm:px-6 lg:px-8 overflow-hidden">
      {/* Decorative blurred circles for rich premium look */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Antigravity <span className="bg-linear-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Resto</span>
          </h1>
          <p className="mt-3 text-slate-400 text-sm">
            Creá tu cuenta de restaurante en un solo paso
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 py-4">
            <CardTitle className="text-2xl font-bold text-white text-center">Registrar Restaurante</CardTitle>
            <CardDescription className="text-slate-400 text-center">
              Comenzá a gestionar tu local hoy mismo
            </CardDescription>
          </CardHeader>
          <form
            method="POST"
            onSubmit={(e) => {
              e.preventDefault()
              handleSubmit(onSubmit)(e)
            }}
          >
            <CardContent className="space-y-3 py-2">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in zoom-in-95 duration-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="restaurantName" className="text-slate-300">Nombre del Restaurante</Label>
                <div className="relative">
                  <Store className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="restaurantName"
                    type="text"
                    placeholder="Mi Restaurante"
                    className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                    disabled={isLoading}
                    {...register("restaurantName")}
                  />
                </div>
                {errors.restaurantName && (
                  <p className="text-xs text-red-400">{errors.restaurantName.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="ownerName" className="text-slate-300">Nombre del Administrador (Owner)</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="ownerName"
                    type="text"
                    placeholder="Juan Pérez"
                    className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                    disabled={isLoading}
                    {...register("ownerName")}
                  />
                </div>
                {errors.ownerName && (
                  <p className="text-xs text-red-400">{errors.ownerName.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-slate-300">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="contacto@mirestaurante.com"
                    className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                    disabled={isLoading}
                    {...register("email")}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                      disabled={isLoading}
                      {...register("password")}
                    />
                  </div>
                  {errors.password && (
                    <p className="text-xs text-red-400">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="confirmPassword" className="text-slate-300">Confirmar</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      className="pl-9 bg-slate-950/40 border-slate-800 text-slate-100 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                      disabled={isLoading}
                      {...register("confirmPassword")}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-xs text-red-400">{errors.confirmPassword.message}</p>
                  )}
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-3 py-4">
              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all duration-200"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Registrando local...
                  </>
                ) : (
                  "Registrar e Ingresar"
                )}
              </Button>
              <div className="text-center text-xs text-slate-400 mt-2">
                ¿Ya tenés cuenta?{" "}
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium underline transition-all">
                  Iniciá sesión
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
