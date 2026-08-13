import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('better_auth_session_token')?.value

  const { pathname } = request.nextUrl
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register')

  // Permitir archivos estáticos e internos de Next.js
  if (pathname.startsWith('/_next') || pathname.includes('.')) {
    return NextResponse.next()
  }

  // Redirección inmediata si no hay cookie
  if (!sessionToken) {
    if (!isAuthPage) {
      const loginUrl = new URL('/login', request.url)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // Si existe la cookie, validamos su vigencia contra el servidor de Better Auth
  let isValidSession = false
  try {
    const rawApiUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'http://localhost:3001/api/auth'
    const apiOrigin = rawApiUrl.replace(/\/api\/auth\/?$/, '')
    const res = await fetch(`${apiOrigin}/api/auth/get-session`, {
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    })

    if (res.ok) {
      const data = await res.json()
      if (data && data.session) {
        isValidSession = true
      }
    }
  } catch (err) {
    console.error('Error al validar sesión en el proxy:', err)
    isValidSession = false
  }

  // Si la sesión no es válida, limpiamos cookies y redirigimos a login
  if (!isValidSession) {
    if (!isAuthPage) {
      const loginUrl = new URL('/login', request.url)
      const response = NextResponse.redirect(loginUrl)
      response.cookies.delete('better-auth.session_token')
      response.cookies.delete('better_auth_session_token')
      return response
    }
    return NextResponse.next()
  }

  // Si la sesión es válida y está en login, redirigir a la home principal
  if (isAuthPage) {
    const homeUrl = new URL('/', request.url)
    return NextResponse.redirect(homeUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg).*)',
  ],
}