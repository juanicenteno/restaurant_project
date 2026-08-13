"use client"

import { useState, useEffect, use } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Loader2, ArrowLeft, Store, AlertCircle, CheckCircle2, Image as ImageIcon, Save, Clock, MapPin, Phone as PhoneIcon, FileText, DollarSign, QrCode, Unlink, ExternalLink } from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"

interface DayHours {
  closed: boolean
  open: string
  close: string
}

type OpeningHoursState = Record<string, DayHours>

const DAYS_TRANSLATION: Record<string, string> = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
}

const DEFAULT_OPENING_HOURS: OpeningHoursState = {
  monday: { closed: false, open: "12:00", close: "23:00" },
  tuesday: { closed: false, open: "12:00", close: "23:00" },
  wednesday: { closed: false, open: "12:00", close: "23:00" },
  thursday: { closed: false, open: "12:00", close: "23:00" },
  friday: { closed: false, open: "12:00", close: "00:00" },
  saturday: { closed: false, open: "12:00", close: "00:00" },
  sunday: { closed: false, open: "12:00", close: "23:00" },
}

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  // Form State
  const [name, setName] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [address, setAddress] = useState("")
  const [cuit, setCuit] = useState("")
  const [phone, setPhone] = useState("")
  const [currency, setCurrency] = useState("ARS")
  const [openingHours, setOpeningHours] = useState<OpeningHoursState>(DEFAULT_OPENING_HOURS)
  const [mpConnectedAt, setMpConnectedAt] = useState<string | null>(null)
  const [mpUserId, setMpUserId] = useState<string | null>(null)
  const [isDisconnectingMp, setIsDisconnectingMp] = useState(false)

  // Status State
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Check URL query parameters for OAuth results
  useEffect(() => {
    const mpSuccess = searchParams.get("mp_success")
    const mpErr = searchParams.get("mp_error")
    const mode = searchParams.get("mode")

    if (mpSuccess) {
      setSuccess(mode === "test" ? "¡Cuenta de Mercado Pago (Modo Test) conectada exitosamente!" : "¡Cuenta de Mercado Pago conectada exitosamente!")
      router.replace("/admin/settings")
    } else if (mpErr) {
      setError(`Error al conectar Mercado Pago: ${decodeURIComponent(mpErr)}`)
      router.replace("/admin/settings")
    }
  }, [searchParams, router])

  // Fetch Current Config
  const fetchConfig = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/restaurant/config`, {
        credentials: "include",
      })

      if (!res.ok) {
        throw new Error("No se pudo cargar la configuración del restaurante.")
      }

      const data = await res.json()
      setName(data.name || "")
      setLogoUrl(data.logoUrl || "")
      setAddress(data.address || "")
      setCuit(data.cuit || "")
      setPhone(data.phone || "")
      setCurrency(data.currency || "ARS")
      setMpConnectedAt(data.mpConnectedAt || null)
      setMpUserId(data.mpUserId || null)
      if (data.openingHours) {
        setOpeningHours(data.openingHours)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al conectar con el servidor.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchConfig()
    }
  }, [session])

  const handleDisconnectMp = async () => {
    if (!confirm("¿Estás seguro de que querés desconectar tu cuenta de Mercado Pago?")) return

    setIsDisconnectingMp(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/mercadopago/oauth/disconnect`, {
        method: "POST",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo desconectar la cuenta.")
      }

      setMpConnectedAt(null)
      setSuccess("Cuenta de Mercado Pago desconectada.")
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al desconectar Mercado Pago.")
    } finally {
      setIsDisconnectingMp(false)
    }
  }

  // Handle Logo Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError("Solo se permiten imágenes (JPG, PNG, WEBP).")
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen del logo no debe superar los 5MB.")
      return
    }

    setIsUploadingLogo(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`${getApiUrl()}/api/uploads/restaurant-logo`, {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al subir el logo.")
      }

      setLogoUrl(data.imageUrl)
      setSuccess("Logo actualizado correctamente.")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "No se pudo subir el logo.")
    } finally {
      setIsUploadingLogo(false)
    }
  }

  // Handle Day Change
  const handleDayChange = (dayKey: string, field: keyof DayHours, value: any) => {
    setOpeningHours((prev) => {
      const currentDay = prev[dayKey] || { closed: false, open: "12:00", close: "23:00" }
      return {
        ...prev,
        [dayKey]: {
          ...currentDay,
          [field]: value,
        },
      }
    })
  }

  // Handle Save Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`${getApiUrl()}/api/restaurant/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          logoUrl: logoUrl.trim() || null,
          address: address.trim() || null,
          cuit: cuit.trim() || null,
          phone: phone.trim() || null,
          currency: currency.trim() || "ARS",
          openingHours,
        }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "No se pudieron guardar los cambios.")
      }

      setSuccess("Configuración guardada exitosamente.")
      setTimeout(() => setSuccess(null), 4000)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al guardar la configuración.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sessionPending) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-2" />
        <p className="text-slate-400 text-sm">Cargando configuración...</p>
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
              Configuración del <span className="bg-linear-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent font-black">Restaurante</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Administrá los datos del local, logo, moneda e información de contacto
            </p>
          </div>
        </header>

        {/* Global Feedback */}
        {success && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-400 border border-emerald-500/20 animate-in fade-in zoom-in-95 duration-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-sm text-destructive-foreground border border-destructive/20 animate-in fade-in zoom-in-95 duration-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-slate-600 mb-2" />
            <p className="text-sm">Cargando datos del local...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* General Info Card */}
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
              <CardHeader className="border-b border-slate-800/60 pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Store className="h-5 w-5 text-indigo-400" />
                  Información General
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Datos de identificación del establecimiento
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Logo Upload Section */}
                <div className="space-y-2">
                  <Label className="text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-slate-400" />
                    Logo del Restaurante
                  </Label>
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? (
                        <img 
                          src={logoUrl} 
                          alt="Logo del Restaurante" 
                          className="h-full w-full object-cover" 
                          onError={(e) => {
                            console.error("Error cargando logo:", logoUrl)
                            ;(e.target as any).style.display = "none"
                          }}
                        />
                      ) : (
                        <Store className="h-8 w-8 text-slate-700" />
                      )}
                    </div>

                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          id="logoFileInput"
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="bg-slate-950/40 border-slate-800 text-slate-100 text-xs focus-visible:ring-indigo-500 file:bg-slate-800 file:hover:bg-slate-700 file:text-slate-200 file:border-0 file:rounded-md file:text-xs file:font-semibold cursor-pointer h-9 py-1"
                          disabled={isSubmitting || isUploadingLogo}
                        />
                        {isUploadingLogo && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 shrink-0" />}
                      </div>
                      <Input
                        type="text"
                        placeholder="O URL directa de imagen"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        className="bg-slate-950/40 border-slate-800 text-xs text-slate-400 h-8"
                        disabled={isSubmitting || isUploadingLogo}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurantName" className="text-slate-300">Nombre del Restaurante</Label>
                    <Input
                      id="restaurantName"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej. Don Juan Restó"
                      className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurantPhone" className="text-slate-300 flex items-center gap-1">
                      <PhoneIcon className="h-3.5 w-3.5 text-slate-400" />
                      Teléfono de Contacto
                    </Label>
                    <Input
                      id="restaurantPhone"
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej. +54 11 4567-8900"
                      className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* CUIT */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurantCuit" className="text-slate-300 flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      CUIT (Facturación)
                    </Label>
                    <Input
                      id="restaurantCuit"
                      type="text"
                      value={cuit}
                      onChange={(e) => setCuit(e.target.value)}
                      placeholder="Ej. 30-71234567-8"
                      className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Currency */}
                  <div className="space-y-2">
                    <Label htmlFor="restaurantCurrency" className="text-slate-300 flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                      Moneda Principal
                    </Label>
                    <select
                      id="restaurantCurrency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md text-sm px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-9"
                      disabled={isSubmitting}
                    >
                      <option value="ARS">ARS ($ - Peso Argentino)</option>
                      <option value="USD">USD ($ - Dólar Estadounidense)</option>
                      <option value="EUR">EUR (€ - Euro)</option>
                      <option value="BRL">BRL (R$ - Real Brasileño)</option>
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <Label htmlFor="restaurantAddress" className="text-slate-300 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    Dirección Comercial
                  </Label>
                  <Input
                    id="restaurantAddress"
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej. Av. Corrientes 1234, CABA"
                    className="bg-slate-950/40 border-slate-800 text-slate-100 focus-visible:ring-indigo-500"
                    disabled={isSubmitting}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Opening Hours Card */}
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
              <CardHeader className="border-b border-slate-800/60 pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-400" />
                  Horarios de Atención
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Configurá los días y turnos de apertura del establecimiento
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6">
                <div className="space-y-3">
                  {Object.keys(DAYS_TRANSLATION).map((dayKey) => {
                    const dayData = openingHours[dayKey] || { closed: false, open: "12:00", close: "23:00" }
                    return (
                      <div 
                        key={dayKey} 
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border transition-all gap-4 ${
                          dayData.closed ? "bg-slate-950/20 border-slate-850 opacity-60" : "bg-slate-950/50 border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-3 w-36">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox"
                              checked={!dayData.closed}
                              onChange={(e) => handleDayChange(dayKey, "closed", !e.target.checked)}
                              className="sr-only peer"
                              disabled={isSubmitting}
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          </label>
                          <span className="font-semibold text-sm text-slate-200">
                            {DAYS_TRANSLATION[dayKey]}
                          </span>
                        </div>

                        {dayData.closed ? (
                          <span className="text-xs text-slate-500 italic">Cerrado todo el día</span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-400">Abre:</span>
                              <Input
                                type="time"
                                value={dayData.open}
                                onChange={(e) => handleDayChange(dayKey, "open", e.target.value)}
                                className="bg-slate-900 border-slate-800 text-xs w-28 text-slate-200 h-8"
                                disabled={isSubmitting}
                              />
                            </div>
                            <span className="text-slate-600 text-xs">a</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-400">Cierra:</span>
                              <Input
                                type="time"
                                value={dayData.close}
                                onChange={(e) => handleDayChange(dayKey, "close", e.target.value)}
                                className="bg-slate-900 border-slate-800 text-xs w-28 text-slate-200 h-8"
                                disabled={isSubmitting}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Mercado Pago Integration Card */}
            <Card className="border-slate-800 bg-slate-900/40 backdrop-blur-md text-white">
              <CardHeader className="border-b border-slate-800/60 pb-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-sky-400" />
                  Integración con Mercado Pago
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Conectá tu cuenta de Mercado Pago (Marketplace OAuth) para permitir cobros por QR y links de pago Checkout Pro.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6">
                {mpConnectedAt ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-emerald-200">✅ Conectado con Mercado Pago</p>
                          {mpUserId === "test-connection" && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                              Modo Test
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-emerald-400/80">
                          Vinculado el {new Date(mpConnectedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} hs
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDisconnectMp}
                      disabled={isDisconnectingMp}
                      className="border-red-500/40 bg-red-950/20 hover:bg-red-900/40 text-red-300 text-xs font-semibold h-9 shrink-0 flex items-center gap-1.5"
                    >
                      {isDisconnectingMp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                      Desconectar
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-300">
                    <div>
                      <p className="font-bold text-sm text-slate-100">Cuenta no vinculada</p>
                      <p className="text-xs text-slate-400">
                        Al conectar tu cuenta, el sistema generará los links y QR de cobro directo a tu billetera de Mercado Pago.
                      </p>
                    </div>

                    <a
                      href={`${getApiUrl()}/api/mercadopago/oauth/connect`}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 transition-all shrink-0"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Conectar con Mercado Pago
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save Button Bar */}
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 px-6 py-2.5 shadow-lg shadow-indigo-500/20 transition-all duration-200"
                disabled={isSubmitting || loading}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Guardando cambios...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Guardar Cambios
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
