"use client"

import { useState, useEffect, use, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import {
  Loader2, ArrowLeft, Receipt, User, Clock, AlertCircle,
  Tag, Percent, CreditCard, CheckCircle2, ShieldAlert, ArrowRight,
  Users, Divide, ShoppingBag, Plus, Trash2, Check, Banknote, QrCode, ArrowLeftRight, ExternalLink, Copy
} from "lucide-react"
import Link from "next/link"
import { getApiUrl } from "@/lib/get-api-url"
import { QRCodeSVG } from "qrcode.react"
import { useRealtimeConnection } from "@/hooks/useRealtimeConnection"

interface OrderSummaryItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: string
  totalPrice: string
  notes?: string | null
  splitGroupId?: string | null
  status: string
}

interface PaymentRecord {
  id: string
  orderId: string
  method: "cash" | "card" | "mercadopago" | "transfer"
  amount: string
  payerLabel?: string | null
  status: string
  createdAt: string
}

interface OrderSummaryData {
  order: {
    id: string
    tableNumber: string
    waiterName: string
    status: string
    subtotal: string
    discountAmount: string
    discountReason?: string | null
    total: string
    openedAt: string
  }
  items: OrderSummaryItem[]
  subtotal: number
  discountAmount: number
  discountReason: string
  total: number
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta (Débito/Crédito)", icon: CreditCard },
  { id: "transfer", label: "Transferencia Bancaria", icon: ArrowLeftRight },
]

export default function CloseOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const resolvedParams = use(params)
  const orderId = resolvedParams.orderId

  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: rawSession, isPending: sessionPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  const [summary, setSummary] = useState<OrderSummaryData | null>(null)
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([])
  const [totalPaid, setTotalPaid] = useState<number>(0)
  const [remainingAmount, setRemainingAmount] = useState<number>(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mpReturnNotice, setMpReturnNotice] = useState<string | null>(null)


  // Discount form state
  const [discountInput, setDiscountInput] = useState<string>("")
  const [discountReasonInput, setDiscountReasonInput] = useState<string>("")
  const [applyingDiscount, setApplyingDiscount] = useState(false)
  const [discountSuccess, setDiscountSuccess] = useState<string | null>(null)

  // Split mode state: "single" | "equitable" | "by_item"
  const [splitMode, setSplitMode] = useState<"single" | "equitable" | "by_item">("single")
  const [splitPeopleCount, setSplitPeopleCount] = useState<number>(2)

  // Items split assignment state: Map of itemId -> splitGroupId
  const [itemAssignments, setItemAssignments] = useState<Record<string, string>>({})
  const [availableGroups, setAvailableGroups] = useState<string[]>(["Persona 1", "Persona 2"])
  const [savingAssignments, setSavingAssignments] = useState(false)

  // New Payment registration form state
  const [selectedMethod, setSelectedMethod] = useState<string>("cash")
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>("")
  const [payerLabelInput, setPayerLabelInput] = useState<string>("")
  const [registeringPayment, setRegisteringPayment] = useState(false)
  const [actionLoadingPaymentId, setActionLoadingPaymentId] = useState<string | null>(null)

  // Mercado Pago Payment Link state
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null)
  const [generatingMpLink, setGeneratingMpLink] = useState(false)
  const [copiedMpUrl, setCopiedMpUrl] = useState(false)

  const canManagePayments =
    session?.user?.role === "owner" ||
    session?.user?.role === "manager" ||
    session?.user?.role === "cashier"

  // Fetch Order Summary & Payments
  const fetchAllData = useCallback(async () => {
    try {
      const [sumRes, payRes] = await Promise.all([
        fetch(`${getApiUrl()}/api/orders/${orderId}/summary`, { credentials: "include" }),
        fetch(`${getApiUrl()}/api/orders/${orderId}/payments`, { credentials: "include" }),
      ])

      if (!sumRes.ok) {
        const data = await sumRes.json()
        throw new Error(data.error || "No se pudo obtener el resumen de la comanda.")
      }

      const sumData: OrderSummaryData = await sumRes.json()
      setSummary(sumData)
      setDiscountInput(sumData.discountAmount > 0 ? String(sumData.discountAmount) : "")
      setDiscountReasonInput(sumData.discountReason || "")

      // Populate item assignments from fetched items
      const assignmentsMap: Record<string, string> = {}
      const existingGroups = new Set<string>(["Persona 1", "Persona 2"])

      sumData.items.forEach((item) => {
        if (item.splitGroupId) {
          assignmentsMap[item.id] = item.splitGroupId
          existingGroups.add(item.splitGroupId)
        }
      })
      setItemAssignments(assignmentsMap)
      setAvailableGroups(Array.from(existingGroups))

      if (payRes.ok) {
        const payData = await payRes.json()
        setPaymentsList(payData.payments || [])
        setTotalPaid(payData.totalPaid || 0)
        setRemainingAmount(payData.remainingAmount ?? (sumData.total - (payData.totalPaid || 0)))
        
        // Default single payment input to remaining amount
        if (!paymentAmountInput || Number(paymentAmountInput) <= 0) {
          setPaymentAmountInput(payData.remainingAmount ? payData.remainingAmount.toFixed(2) : sumData.total.toFixed(2))
        }
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al cargar el resumen de la comanda.")
    } finally {
      setLoading(false)
    }
  }, [orderId])

  // Mercado Pago Return Status check (definido DESPUÉS de fetchAllData para evitar ReferenceError)
  useEffect(() => {
    const mpStatus = searchParams.get("mp_status")
    if (mpStatus === "success") {
      setMpReturnNotice("Pago aprobado en Mercado Pago. Actualizando...")
      // El backend ya procesó el pago al recibir la redirección.
      // Hacemos refetch con un pequeño delay para dar tiempo al servidor.
      const timer = setTimeout(() => {
        fetchAllData()
        setMpReturnNotice(null)
        setMpInitPoint(null)
      }, 1500)
      return () => clearTimeout(timer)
    } else if (mpStatus === "pending") {
      setMpReturnNotice("Pago pendiente en Mercado Pago. Esperando confirmación automática por webhook...")
    } else if (mpStatus === "failure") {
      setError("El pago en Mercado Pago no pudo completarse o fue cancelado.")
    }
  }, [searchParams, fetchAllData])

  // Realtime WebSocket Subscription
  const restaurantId = session?.user?.restaurantId
  const { subscribe } = useRealtimeConnection(restaurantId)

  useEffect(() => {
    if (!restaurantId) return
    const unsubscribePayment = subscribe("payment:registered", () => {
      console.log("⚡ [WebSocket] Recibida notificación de pago registrado. Actualizando pre-cuenta...")
      setMpInitPoint(null)
      fetchAllData()
    })
    return () => {
      unsubscribePayment()
    }
  }, [restaurantId, subscribe, fetchAllData])

  useEffect(() => {
    if (session && canManagePayments) {
      fetchAllData()
    } else if (session && !canManagePayments) {
      setLoading(false)
    }
  }, [session, canManagePayments, fetchAllData])

  // Mercado Pago Link Generator
  const handleGenerateMpLink = async (customAmount?: number) => {
    setGeneratingMpLink(true)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/create-payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: customAmount }),
        credentials: "include",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "No se pudo generar el link de cobro con Mercado Pago.")
      }

      setMpInitPoint(data.sandbox_init_point || data.init_point)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al generar link de Mercado Pago.")
    } finally {
      setGeneratingMpLink(false)
    }
  }

  // Apply Discount Handler
  const handleApplyDiscount = async (e: React.FormEvent) => {
    e.preventDefault()
    setApplyingDiscount(true)
    setError(null)
    setDiscountSuccess(null)

    const discountAmountNum = Number(discountInput || 0)

    if (isNaN(discountAmountNum) || discountAmountNum < 0) {
      setError("Ingresá un monto de descuento válido (número positivo).")
      setApplyingDiscount(false)
      return
    }

    if (summary && discountAmountNum > summary.subtotal) {
      setError("El descuento no puede ser mayor al subtotal de la comanda.")
      setApplyingDiscount(false)
      return
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/apply-discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountAmount: discountAmountNum,
          discountReason: discountReasonInput.trim(),
        }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo aplicar el descuento.")
      }

      await fetchAllData()
      setDiscountSuccess("Descuento aplicado correctamente al total.")
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al aplicar el descuento.")
    } finally {
      setApplyingDiscount(false)
    }
  }

  // Register a Payment Handler
  const handleRegisterPayment = async (amountToPay: number, label: string, methodOverride?: string) => {
    setRegisteringPayment(true)
    setError(null)

    const methodToUse = methodOverride || selectedMethod
    if (amountToPay <= 0) {
      setError("El monto del pago debe ser mayor a 0.")
      setRegisteringPayment(false)
      return
    }

    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountToPay,
          method: methodToUse,
          payerLabel: label,
        }),
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo registrar el pago.")
      }

      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al registrar el pago.")
    } finally {
      setRegisteringPayment(false)
    }
  }

  // Cancel/Delete Payment Handler
  const handleDeletePayment = async (paymentId: string) => {
    setActionLoadingPaymentId(paymentId)
    setError(null)
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${orderId}/payments/${paymentId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "No se pudo anular el pago.")
      }

      await fetchAllData()
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Error al anular el pago.")
    } finally {
      setActionLoadingPaymentId(null)
    }
  }

  // Save Item Assignments to Backend
  const handleAssignItemSplitGroup = async (itemId: string, groupLabel: string) => {
    const updatedMap = { ...itemAssignments, [itemId]: groupLabel }
    setItemAssignments(updatedMap)

    setSavingAssignments(true)
    try {
      const assignmentsArray = Object.entries(updatedMap).map(([id, grp]) => ({
        itemId: id,
        splitGroupId: grp || null,
      }))

      await fetch(`${getApiUrl()}/api/orders/${orderId}/items/assign-split`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: assignmentsArray }),
        credentials: "include",
      })
    } catch (err) {
      console.error("Error al guardar asignación de ítem:", err)
    } finally {
      setSavingAssignments(false)
    }
  }

  // Add a new Person Group in By-Item mode
  const handleAddPersonGroup = () => {
    const nextNum = availableGroups.length + 1
    const newGroup = `Persona ${nextNum}`
    if (!availableGroups.includes(newGroup)) {
      setAvailableGroups([...availableGroups, newGroup])
    }
  }

  if (sessionPending || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-slate-400 text-sm">Generando pre-cuenta y división de cobro...</p>
      </div>
    )
  }

  if (!session) return null

  // Access control check for waiters or users without manage_payments
  if (!canManagePayments) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <Card className="max-w-md w-full border-red-500/40 bg-red-950/20 text-white text-center p-6 space-y-4">
          <ShieldAlert className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="text-xl font-bold text-red-200">Acceso Restringido</h2>
          <p className="text-xs text-slate-300">
            Tu rol actual ({session.user.role}) no tiene permisos para cerrar cuentas ni gestionar cobros (`manage_payments`).
          </p>
          <Button onClick={() => router.push(`/orders/${orderId}`)} className="bg-slate-800 hover:bg-slate-700 text-white w-full">
            Volver a la Comanda
          </Button>
        </Card>
      </div>
    )
  }

  const orderTotal = summary?.total || 0
  const isFullyPaid = remainingAmount <= 0.01 && orderTotal > 0

  return (
    <div className="relative min-h-screen bg-slate-950 text-white p-4 md:p-8 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-5xl mx-auto z-10 relative space-y-6">
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/orders/${orderId}`} className="inline-flex items-center text-xs text-slate-400 hover:text-emerald-400 gap-1.5 transition-all group">
                <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-all" />
                Volver a la Comanda
              </Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
              <Receipt className="h-7 w-7 text-emerald-400" />
              Cierre y División — <span className="bg-linear-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent font-black">Mesa #{summary?.order.tableNumber}</span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Gestión de pagos divididos, descuentos y saldo pendiente antes de facturar
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => router.push(`/orders/${orderId}`)}
              variant="outline"
              size="sm"
              className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
            >
              Editar Productos
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

        {/* Mercado Pago Return Notice Banner */}
        {mpReturnNotice && (
          <div className="flex items-center gap-2 rounded-lg bg-sky-500/10 p-3.5 text-sm text-sky-300 border border-sky-500/20 animate-in fade-in duration-200">
            <Loader2 className="h-4 w-4 shrink-0 text-sky-400 animate-spin" />
            <p>{mpReturnNotice}</p>
          </div>
        )}

        {/* Success Banner */}
        {discountSuccess && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3.5 text-sm text-emerald-300 border border-emerald-500/20 animate-in fade-in duration-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <p>{discountSuccess}</p>
          </div>
        )}

        {/* Progress & Real-time Balance Tracker */}
        <Card className={`border-slate-800 backdrop-blur-md transition-all ${isFullyPaid ? "bg-emerald-950/20 border-emerald-500/40" : "bg-slate-900/80"}`}>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Estado del Cobro</span>
                <h3 className="text-2xl font-black flex items-center gap-2 mt-0.5">
                  Total a cobrar: <span className="text-emerald-400">${orderTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </h3>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-xs text-slate-400">Total Cobrado</p>
                  <p className="text-lg font-extrabold text-emerald-400">${totalPaid.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Pendiente</p>
                  <p className={`text-lg font-extrabold ${remainingAmount <= 0.01 ? "text-emerald-400" : "text-amber-400"}`}>
                    ${remainingAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800 p-0.5">
              <div
                className="bg-linear-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, orderTotal > 0 ? (totalPaid / orderTotal) * 100 : 0)}%` }}
              />
            </div>

            {isFullyPaid && (
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>¡La cuenta ha sido cobrada en su totalidad! Ya podés continuar al cierre definitivo de la comanda.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Split Modes & Payment Actions (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Split Mode Selector */}
            <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md text-white">
              <CardHeader className="p-4 border-b border-slate-800 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Divide className="h-4 w-4 text-emerald-400" />
                  Modalidad de Pago
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Seleccioná cómo se dividirá la cuenta entre los comensales
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSplitMode("single")}
                    className={`h-16 flex flex-col items-center justify-center gap-1 border-slate-800 text-xs font-semibold ${
                      splitMode === "single" ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-slate-950 text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <Receipt className="h-4 w-4" />
                    Pago Único
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSplitMode("equitable")}
                    className={`h-16 flex flex-col items-center justify-center gap-1 border-slate-800 text-xs font-semibold ${
                      splitMode === "equitable" ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-slate-950 text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Equitativo (1/N)
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSplitMode("by_item")}
                    className={`h-16 flex flex-col items-center justify-center gap-1 border-slate-800 text-xs font-semibold ${
                      splitMode === "by_item" ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-slate-950 text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Por Ítems
                  </Button>
                </div>

                {/* Single Payment Mode Form */}
                {splitMode === "single" && (
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                    <h4 className="font-bold text-sm text-slate-200">Registrar Pago Único</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Método de Pago</Label>
                        <select
                          value={selectedMethod}
                          onChange={(e) => setSelectedMethod(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-md text-xs px-2.5 py-2 text-slate-100 h-9"
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Monto a Pagar ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={paymentAmountInput}
                          onChange={(e) => setPaymentAmountInput(e.target.value)}
                          className="bg-slate-900 border-slate-800 text-slate-100 h-9 text-xs"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => handleRegisterPayment(Number(paymentAmountInput || remainingAmount), "Pago completo")}
                      disabled={registeringPayment || remainingAmount <= 0.01}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-9 mt-2"
                    >
                      {registeringPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Registrar Pago de la Comanda"}
                    </Button>
                  </div>
                )}

                {/* Mercado Pago Dedicated Action & QR Box (Disponible en todas las modalidades) */}
                <div className="p-4 rounded-xl border border-sky-500/30 bg-slate-950/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-bold text-sm text-sky-400 flex items-center gap-1.5">
                        <QrCode className="h-4 w-4" />
                        Cobro Automatizado con Mercado Pago
                      </h4>
                      <p className="text-xs text-slate-400">
                        Generá un QR y link dinámico de Checkout Pro. El pago se confirmará en tiempo real sin intervención manual.
                      </p>
                    </div>

                    <Button
                      type="button"
                      onClick={() => handleGenerateMpLink(splitMode === "single" ? Number(paymentAmountInput || remainingAmount) : undefined)}
                      disabled={generatingMpLink || remainingAmount <= 0.01}
                      className="bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs h-9 shrink-0 flex items-center gap-1.5 shadow-md shadow-sky-500/20"
                    >
                      {generatingMpLink ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                      Generar QR / Link de Pago
                    </Button>
                  </div>

                  {mpInitPoint && (
                    <div className="p-5 rounded-xl bg-slate-900 border border-sky-500/50 space-y-4 text-center animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-center gap-2 text-sky-300 text-xs font-bold bg-sky-500/10 py-1.5 px-3 rounded-full w-fit mx-auto border border-sky-500/30">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                        <span>Esperando confirmación de pago de Mercado Pago...</span>
                      </div>

                      <div className="bg-white p-3.5 rounded-2xl inline-block mx-auto shadow-xl shadow-sky-500/10">
                        <QRCodeSVG value={mpInitPoint} size={180} />
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <a
                            href={mpInitPoint}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-500 text-slate-950 text-xs font-black hover:bg-sky-400 transition-all shadow-sm"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir Checkout de Mercado Pago
                          </a>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(mpInitPoint)
                              setCopiedMpUrl(true)
                              setTimeout(() => setCopiedMpUrl(false), 2000)
                            }}
                            className="h-8 border-slate-700 bg-slate-800 text-slate-300 text-xs flex items-center gap-1"
                          >
                            {copiedMpUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            {copiedMpUrl ? "Link Copiado" : "Copiar Link"}
                          </Button>
                        </div>

                        <p className="text-[11px] text-slate-400 italic">
                          Al completar el pago en la billetera de Mercado Pago, el webhook actualizará la cuenta automáticamente.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Equitable Split Mode */}
                {splitMode === "equitable" && (
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-bold text-slate-200">¿Entre cuántas personas dividen?</Label>
                        <p className="text-[11px] text-slate-400">División en partes iguales del total</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSplitPeopleCount(Math.max(2, splitPeopleCount - 1))}
                          className="h-8 w-8 border-slate-800 bg-slate-900 text-slate-200"
                        >
                          -
                        </Button>
                        <span className="font-black text-sm px-2 text-emerald-400">{splitPeopleCount}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSplitPeopleCount(splitPeopleCount + 1)}
                          className="h-8 w-8 border-slate-800 bg-slate-900 text-slate-200"
                        >
                          +
                        </Button>
                      </div>
                    </div>

                    {/* Calculated per person */}
                    {(() => {
                      const perPersonAmount = orderTotal / splitPeopleCount
                      return (
                        <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs flex items-center justify-between">
                          <span className="text-slate-300 font-semibold">Monto por persona:</span>
                          <span className="font-black text-sm text-emerald-400">
                            ${perPersonAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )
                    })()}

                    {/* Cards for each person in equitable mode */}
                    <div className="space-y-2 pt-1">
                      {Array.from({ length: splitPeopleCount }).map((_, idx) => {
                        const personLabel = `Persona ${idx + 1}`
                        const perPersonAmount = Number((orderTotal / splitPeopleCount).toFixed(2))
                        const isAlreadyPaid = paymentsList.some((p) => p.payerLabel === personLabel && p.status === "completed")

                        return (
                          <div
                            key={idx}
                            className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <User className="h-3.5 w-3.5 text-slate-400" />
                              <span className="font-bold text-slate-200">{personLabel}</span>
                              <span className="text-slate-400">(${perPersonAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })})</span>
                            </div>

                            {isAlreadyPaid ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <Check className="h-3 w-3 text-emerald-400" /> Cobrado
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => handleRegisterPayment(perPersonAmount, personLabel)}
                                disabled={registeringPayment || remainingAmount <= 0.01}
                                className="h-7 text-xs bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white font-semibold"
                              >
                                Registrar (${perPersonAmount.toLocaleString("es-AR")})
                              </Button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* By Item Split Mode */}
                {splitMode === "by_item" && (
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-slate-200">Asignar Ítems a Comensales</h4>
                        <p className="text-[11px] text-slate-400">Seleccioná qué consumo corresponde a cada persona</p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAddPersonGroup}
                        className="h-7 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Persona
                      </Button>
                    </div>

                    {/* List of items with selector */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {summary?.items.map((item) => {
                        const currentGroup = itemAssignments[item.id] || "Persona 1"

                        return (
                          <div
                            key={item.id}
                            className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="truncate max-w-[160px] sm:max-w-[220px]">
                              <p className="font-bold text-slate-200 truncate">{item.quantity}x {item.productName}</p>
                              <p className="text-[11px] text-slate-400">${Number(item.totalPrice).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                            </div>

                            <select
                              value={currentGroup}
                              onChange={(e) => handleAssignItemSplitGroup(item.id, e.target.value)}
                              className="bg-slate-950 border border-slate-800 rounded text-xs px-2 py-1 text-slate-200 h-7"
                            >
                              {availableGroups.map((grp) => (
                                <option key={grp} value={grp}>{grp}</option>
                              ))}
                            </select>
                          </div>
                        )
                      })}
                    </div>

                    {/* Calculated subtotals per group */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <h5 className="text-xs font-bold text-slate-300">Resumen por Comensal</h5>
                      {availableGroups.map((grp) => {
                        const groupSubtotal = (summary?.items || [])
                          .filter((i) => (itemAssignments[i.id] || "Persona 1") === grp)
                          .reduce((acc, i) => acc + Number(i.totalPrice), 0)

                        const isAlreadyPaid = paymentsList.some((p) => p.payerLabel === grp && p.status === "completed")

                        return (
                          <div key={grp} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                            <span className="font-bold text-slate-200">{grp}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-extrabold text-emerald-400">
                                ${groupSubtotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                              </span>

                              {isAlreadyPaid ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  Cobrado
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleRegisterPayment(groupSubtotal, grp)}
                                  disabled={registeringPayment || groupSubtotal <= 0 || remainingAmount <= 0.01}
                                  className="h-6 text-[11px] px-2 bg-slate-800 hover:bg-emerald-600 text-slate-200 font-semibold"
                                >
                                  Cobrar ${groupSubtotal.toLocaleString("es-AR")}
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Discount Adjustment Card */}
            {(() => {
              const isDiscountLocked = paymentsList.length > 0

              return (
                <Card className={`border-slate-800 transition-all ${isDiscountLocked ? "bg-slate-950/80 opacity-80" : "bg-slate-900/60"} backdrop-blur-md text-white`}>
                  <CardHeader className="p-4 border-b border-slate-800 pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4 text-emerald-400" />
                      Descuento Manual
                    </CardTitle>
                  </CardHeader>

                  <form onSubmit={handleApplyDiscount}>
                    <CardContent className="p-4 space-y-3">
                      {isDiscountLocked && (
                        <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                          <span>
                            El descuento no se puede modificar una vez que hay pagos registrados. Anulá los pagos primero si necesitás cambiarlo.
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="discountInput" className="text-slate-300 text-xs">Monto ($)</Label>
                          <Input
                            id="discountInput"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            disabled={isDiscountLocked || applyingDiscount}
                            value={discountInput}
                            onChange={(e) => setDiscountInput(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-100 h-9 text-xs disabled:opacity-50"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="discountReason" className="text-slate-300 text-xs">Motivo</Label>
                          <Input
                            id="discountReason"
                            type="text"
                            placeholder="Ej. Atención house"
                            disabled={isDiscountLocked || applyingDiscount}
                            value={discountReasonInput}
                            onChange={(e) => setDiscountReasonInput(e.target.value)}
                            className="bg-slate-950 border-slate-800 text-slate-100 h-9 text-xs disabled:opacity-50"
                          />
                        </div>
                      </div>
                    </CardContent>

                    <CardFooter className="p-4 pt-0">
                      <Button
                        type="submit"
                        disabled={isDiscountLocked || applyingDiscount}
                        variant="outline"
                        className="w-full border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs h-8 disabled:opacity-50 cursor-not-allowed"
                      >
                        {applyingDiscount ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : "Aplicar / Recalcular"}
                      </Button>
                    </CardFooter>
                  </form>
                </Card>
              )
            })()}
          </div>

          {/* Right Column: Registered Payments & Final Action (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="border-slate-800 bg-slate-900/60 backdrop-blur-md text-white">
              <CardHeader className="p-4 border-b border-slate-800 pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Pagos Registrados</span>
                  <span className="text-xs font-normal text-slate-400">({paymentsList.length})</span>
                </CardTitle>
              </CardHeader>

              <CardContent className="p-4 space-y-2.5 min-h-[160px] max-h-[280px] overflow-y-auto">
                {paymentsList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8 italic">
                    Todavía no se registraron pagos parciales para esta comanda.
                  </p>
                ) : (
                  paymentsList.map((payment) => {
                    const isDeleting = actionLoadingPaymentId === payment.id
                    const methodObj = PAYMENT_METHODS.find((m) => m.id === payment.method)
                    const MethodIcon = methodObj?.icon || CreditCard

                    return (
                      <div
                        key={payment.id}
                        className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <MethodIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-200">
                              {payment.payerLabel || "Pago Parcial"} — <span className="text-slate-400 font-normal">{methodObj?.label || payment.method}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {new Date(payment.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} hs
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-emerald-400">
                            ${Number(payment.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </span>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeletePayment(payment.id)}
                            disabled={isDeleting}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                            title="Anular pago"
                          >
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>

            {/* Final Close Order CTA Card */}
            <Card className={`backdrop-blur-md text-white border transition-all ${isFullyPaid ? "border-emerald-500 bg-emerald-950/20 shadow-xl shadow-emerald-500/10" : "border-slate-800 bg-slate-900/80"}`}>
              <CardContent className="p-4 space-y-3 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal consumos:</span>
                  <span>${Number(summary?.subtotal || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="flex justify-between text-amber-400">
                  <span>Descuento acumulado:</span>
                  <span>-${Number(summary?.discountAmount || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="font-bold text-sm text-slate-200">TOTAL FACTURACIÓN:</span>
                  <span className="font-black text-xl text-emerald-400">
                    ${orderTotal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t border-slate-800">
                <Button
                  onClick={() => alert("El cierre definitivo de la comanda y la emisión de comprobantes se completa en las Tareas 39-40.")}
                  disabled={!isFullyPaid}
                  className={`w-full font-extrabold py-3 text-sm flex items-center justify-center gap-2 transition-all ${
                    isFullyPaid
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                      : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isFullyPaid ? "Cerrar Comanda Definitivamente" : `Falta cobrar $${remainingAmount.toLocaleString("es-AR")}`}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
