import { createAuthClient } from "better-auth/react"
import { getApiUrl } from "./get-api-url"

export const authClient = createAuthClient({
  baseURL: `${getApiUrl()}/api/auth`,
})

export const { signIn, signOut, useSession } = authClient

// Interfaces personalizadas para tipado fuerte en el frontend
export interface CustomUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image?: string | null
  createdAt: Date
  updatedAt: Date
  role: "owner" | "manager" | "waiter" | "cashier" | "cook" | "bartender" | "host"
  restaurantId: string
  isActive?: boolean
  phone?: string | null
}

export interface CustomSession {
  user: CustomUser
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    createdAt: Date
    updatedAt: Date
    ipAddress?: string | null
    userAgent?: string | null
  }
}
