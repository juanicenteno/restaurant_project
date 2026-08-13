"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { authClient, type CustomSession } from "@/lib/auth-client"
import { Loader2 } from "lucide-react"

export default function HomePage() {
  const router = useRouter()
  const { data: rawSession, isPending } = authClient.useSession()
  const session = rawSession as unknown as CustomSession | null

  useEffect(() => {
    if (isPending) return

    if (!session) {
      router.push("/login")
      return
    }

    const role = session.user?.role || "waiter"
    switch (role) {
      case "owner":
      case "manager":
        router.push("/admin")
        break
      case "waiter":
      case "cashier":
      case "host":
        router.push("/pos")
        break
      case "cook":
        router.push("/kds")
        break
      default:
        router.push("/pos")
    }
  }, [session, isPending, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-4" />
      <p className="text-slate-400 text-sm">Cargando tu espacio de trabajo...</p>
    </div>
  )
}
