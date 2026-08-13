import './env.js'

async function runTest() {
  console.log('🧪 Iniciando prueba automatizada de RBAC...')
  const apiBaseUrl = 'http://localhost:3001'

  try {
    // 1. Iniciar sesión como Cocinero (cook@restaurant.com)
    console.log('\n🔑 Iniciando sesión como Cocinero (cook@restaurant.com)...')
    const cookLoginRes = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        email: 'cook@restaurant.com',
        password: 'password123',
      })
    })

    if (!cookLoginRes.ok) {
      const errText = await cookLoginRes.text()
      throw new Error(`Error en login de cocinero: status ${cookLoginRes.status}, body: ${errText}`)
    }

    // Usar getSetCookie si está disponible en Node.js, si no, fallback a get('set-cookie')
    const cookCookie = typeof cookLoginRes.headers.getSetCookie === 'function' 
      ? cookLoginRes.headers.getSetCookie().join('; ') 
      : cookLoginRes.headers.get('set-cookie') || ''

    if (!cookCookie) {
      throw new Error('No se recibió cookie de sesión para el cocinero')
    }

    console.log('✅ Sesión de Cocinero iniciada correctamente.')

    // 2. Probar acceso a /api/test-permission/orders (Rol cook -> NO tiene permiso manage_orders)
    console.log('\n🔒 Cocinero intentando acceder a Pedidos (/api/test-permission/orders)...')
    const cookOrdersRes = await fetch(`${apiBaseUrl}/api/test-permission/orders`, {
      headers: { Cookie: cookCookie }
    })
    
    if (cookOrdersRes.status === 403) {
      const data = await cookOrdersRes.json()
      console.log(`✅ Éxito esperado: Bloqueado con estado 403 y mensaje:`, data)
    } else {
      const errText = await cookOrdersRes.text()
      console.log(`❌ Error: Se esperaba 403 pero se obtuvo ${cookOrdersRes.status}. Body: ${errText}`)
    }

    // 3. Probar acceso a /api/test-permission/payments (Rol cook -> NO tiene permiso manage_payments)
    console.log('\n🔒 Cocinero intentando acceder a Pagos (/api/test-permission/payments)...')
    const cookPaymentsRes = await fetch(`${apiBaseUrl}/api/test-permission/payments`, {
      headers: { Cookie: cookCookie }
    })
    
    if (cookPaymentsRes.status === 403) {
      const data = await cookPaymentsRes.json()
      console.log(`✅ Éxito esperado: Bloqueado con estado 403 y mensaje:`, data)
    } else {
      const errText = await cookPaymentsRes.text()
      console.log(`❌ Error: Se esperaba 403 pero se obtuvo ${cookPaymentsRes.status}. Body: ${errText}`)
    }

    // 4. Iniciar sesión como Dueño (test@restaurant.com)
    console.log('\n🔑 Iniciando sesión como Dueño (test@restaurant.com)...')
    const ownerLoginRes = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        email: 'test@restaurant.com',
        password: 'password123',
      })
    })

    if (!ownerLoginRes.ok) {
      const errText = await ownerLoginRes.text()
      throw new Error(`Error en login de dueño: status ${ownerLoginRes.status}, body: ${errText}`)
    }

    const ownerCookie = typeof ownerLoginRes.headers.getSetCookie === 'function' 
      ? ownerLoginRes.headers.getSetCookie().join('; ') 
      : ownerLoginRes.headers.get('set-cookie') || ''

    if (!ownerCookie) {
      throw new Error('No se recibió cookie de sesión para el dueño')
    }

    console.log('✅ Sesión de Dueño iniciada correctamente.')

    // 5. Probar acceso a /api/test-permission/orders (Rol owner -> TIENE todos los permisos)
    console.log('\n🔓 Dueño intentando acceder a Pedidos (/api/test-permission/orders)...')
    const ownerOrdersRes = await fetch(`${apiBaseUrl}/api/test-permission/orders`, {
      headers: { Cookie: ownerCookie }
    })
    
    if (ownerOrdersRes.status === 200) {
      const data = await ownerOrdersRes.json()
      console.log(`✅ Éxito: Acceso concedido con estado 200:`, data)
    } else {
      const errText = await ownerOrdersRes.text()
      console.log(`❌ Error: Se esperaba 200 pero se obtuvo ${ownerOrdersRes.status}. Body: ${errText}`)
    }

    // 6. Probar acceso a /api/test-permission/payments (Rol owner -> TIENE todos los permisos)
    console.log('\n🔓 Dueño intentando acceder a Pagos (/api/test-permission/payments)...')
    const ownerPaymentsRes = await fetch(`${apiBaseUrl}/api/test-permission/payments`, {
      headers: { Cookie: ownerCookie }
    })
    
    if (ownerPaymentsRes.status === 200) {
      const data = await ownerPaymentsRes.json()
      console.log(`✅ Éxito: Acceso concedido con estado 200:`, data)
    } else {
      const errText = await ownerPaymentsRes.text()
      console.log(`❌ Error: Se esperaba 200 pero se obtuvo ${ownerPaymentsRes.status}. Body: ${errText}`)
    }

    // ==========================================
    // 7. Prueba de Concurrencia (Aislamiento de RLS / Multi-tenant)
    // ==========================================
    console.log('\n🧪 Iniciando prueba de concurrencia para verificar aislamiento de RLS...')

    // Iniciar sesión como Dueño del Segundo Restaurante (other@restaurant.com)
    console.log('🔑 Iniciando sesión como Dueño Burger (other@restaurant.com)...')
    const otherLoginRes = await fetch(`${apiBaseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000'
      },
      body: JSON.stringify({
        email: 'other@restaurant.com',
        password: 'password123',
      })
    })

    const otherCookie = typeof otherLoginRes.headers.getSetCookie === 'function' 
      ? otherLoginRes.headers.getSetCookie().join('; ') 
      : otherLoginRes.headers.get('set-cookie') || ''

    if (!otherCookie) {
      throw new Error('No se recibió cookie de sesión para el segundo dueño')
    }
    console.log('✅ Sesión de Dueño Burger iniciada.')

    // Lanzar dos peticiones concurrentes:
    // Petición A: Dueño Don Juan (ownerCookie) -> lenta (delay de 600ms)
    // Petición B: Dueño Burger (otherCookie) -> rápida (delay de 100ms)
    console.log('\n⚡ Lanzando peticiones concurrentes a /api/test-concurrency...')
    console.log(' - Petición A (Dueño Don Juan): lenta (delay 600ms)')
    console.log(' - Petición B (Dueño Burger): rápida (delay 100ms)')

    const start = Date.now()
    const [resA, resB] = await Promise.all([
      fetch(`${apiBaseUrl}/api/test-concurrency?delay=600`, { headers: { Cookie: ownerCookie } }),
      fetch(`${apiBaseUrl}/api/test-concurrency?delay=100`, { headers: { Cookie: otherCookie } })
    ])

    const duration = Date.now() - start
    console.log(`⏱️ Ambas peticiones respondieron en ${duration}ms.`)

    const dataA = await resA.json()
    const dataB = await resB.json()

    console.log('\n📄 Resultados:')
    console.log('Petición A (Don Juan):', dataA)
    console.log('Petición B (Burger):', dataB)

    if (dataA.matches && dataB.matches) {
      console.log('\n✅ ÉXITO DE AISLAMIENTO: Las consultas mantuvieron su RLS aislado transaccionalmente. No hubo contaminación cruzada de pool de conexiones.')
    } else {
      console.log('\n❌ ERROR DE SEGURIDAD: Hubo fuga de contexto RLS o contaminación de conexión entre tenants!')
      process.exit(1)
    }

    // ==========================================
    // 8. Prueba de Ciclo de Vida: Mesas y Secciones
    // ==========================================
    console.log('\n🧪 Iniciando prueba de ciclo de vida para Mesas y Secciones...')

    // A. Crear una sección de prueba
    console.log('➕ Creando sección de prueba "Terraza Test"...')
    const createSecRes = await fetch(`${apiBaseUrl}/api/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Terraza Test' })
    })
    const secData = await createSecRes.json() as any
    console.log('✅ Sección creada:', secData)

    // B. Crear una mesa asignada a esa sección
    console.log('➕ Creando mesa de prueba "Mesa Test-101" en la sección...')
    const createTableRes = await fetch(`${apiBaseUrl}/api/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ number: 'Mesa Test-101', capacity: 6, sectionId: secData.id })
    })
    const tableData = await createTableRes.json() as any
    console.log('✅ Mesa creada:', tableData)

    // C. Editar la mesa
    console.log('✏️ Editando capacidad de la mesa a 8...')
    const updateTableRes = await fetch(`${apiBaseUrl}/api/tables/${tableData.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ capacity: 8 })
    })
    const updatedTableData = await updateTableRes.json()
    console.log('✅ Mesa editada:', updatedTableData)

    // D. Intentar borrar la sección (debe fallar con 400 por claves de tablas asociadas)
    console.log('🗑️ Intentando borrar la sección "Terraza Test" con mesas asociadas...')
    const deleteSecFailRes = await fetch(`${apiBaseUrl}/api/sections/${secData.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteSecFailData = await deleteSecFailRes.json() as any
    
    if (deleteSecFailRes.status === 400) {
      console.log('✅ Éxito esperado: Bloqueado correctamente con estado 400. Detalle:', deleteSecFailData.error)
    } else {
      console.log(`❌ Error: Se esperaba 400 pero se obtuvo ${deleteSecFailRes.status}. Body:`, deleteSecFailData)
      process.exit(1)
    }

    // E. Borrar la mesa
    console.log('🗑️ Eliminando mesa de prueba "Mesa Test-101"...')
    const deleteTableRes = await fetch(`${apiBaseUrl}/api/tables/${tableData.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteTableData = await deleteTableRes.json()
    console.log('✅ Mesa eliminada:', deleteTableData)

    // F. Borrar la sección (ahora debe funcionar con 200)
    console.log('🗑️ Eliminando sección "Terraza Test" (ahora vacía)...')
    const deleteSecSuccessRes = await fetch(`${apiBaseUrl}/api/sections/${secData.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteSecSuccessData = await deleteSecSuccessRes.json()
    console.log('✅ Sección eliminada:', deleteSecSuccessData)

    // ==========================================
    // 9. Prueba de Ciclo de Vida: Categorías y Reordenamiento
    // ==========================================
    console.log('\n🧪 Iniciando prueba de ciclo de vida para Categorías de Menú...')

    // A. Crear varias categorías
    console.log('➕ Creando categoría "Entradas"...')
    const createCat1Res = await fetch(`${apiBaseUrl}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Entradas', description: 'Platos de entrada' })
    })
    const cat1 = await createCat1Res.json() as any
    console.log('✅ Categoría creada:', cat1)

    console.log('➕ Creando categoría "Postres"...')
    const createCat2Res = await fetch(`${apiBaseUrl}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Postres', description: 'Cosas dulces' })
    })
    const cat2 = await createCat2Res.json() as any
    console.log('✅ Categoría creada:', cat2)

    // B. Editar una categoría
    console.log('✏️ Editando categoría "Postres" a "Postres y Cafetería"...')
    const updateCatRes = await fetch(`${apiBaseUrl}/api/categories/${cat2.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Postres y Cafetería' })
    })
    const updatedCat2 = await updateCatRes.json() as any
    console.log('✅ Categoría editada:', updatedCat2)

    // C. Reordenar las categorías
    console.log('🔄 Reordenando categorías ("Postres y Cafetería" -> orden 0, "Entradas" -> orden 1)...')
    const reorderRes = await fetch(`${apiBaseUrl}/api/categories/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        orders: [
          { id: cat2.id, displayOrder: 0 },
          { id: cat1.id, displayOrder: 1 }
        ]
      })
    })
    const reorderData = await reorderRes.json() as any
    console.log('✅ Reordenamiento exitoso:', reorderData)

    // Verificar listado ordenado
    console.log('🔍 Listando categorías para verificar orden...')
    const listCatsRes = await fetch(`${apiBaseUrl}/api/categories`, {
      headers: { Cookie: ownerCookie }
    })
    const catsList = await listCatsRes.json() as any[]
    console.log('📋 Categorías ordenadas en BD:')
    catsList.forEach(c => console.log(` - ${c.name} (displayOrder: ${c.displayOrder})`))

    // D. Eliminar las categorías
    console.log('🗑️ Eliminando categoría "Entradas"...')
    const deleteCat1Res = await fetch(`${apiBaseUrl}/api/categories/${cat1.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteCat1Data = await deleteCat1Res.json()
    console.log('✅ Categoría eliminada:', deleteCat1Data)

    console.log('🗑️ Eliminando categoría "Postres y Cafetería"...')
    const deleteCat2Res = await fetch(`${apiBaseUrl}/api/categories/${cat2.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteCat2Data = await deleteCat2Res.json()
    console.log('✅ Categoría eliminada:', deleteCat2Data)

    // ==========================================
    // 10. Prueba de Ciclo de Vida: Productos de Menú
    // ==========================================
    console.log('\n🧪 Iniciando prueba de ciclo de vida para Productos de Menú...')

    // A. Crear una categoría de prueba para los productos
    console.log('➕ Creando categoría de prueba "Platos Fuertes"...')
    const testCatRes = await fetch(`${apiBaseUrl}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ name: 'Platos Fuertes', description: 'Platos principales calientes' })
    })
    const testCat = await testCatRes.json() as any
    console.log('✅ Categoría creada:', testCat)

    // B. Crear un producto asignado a esa categoría
    console.log('➕ Creando producto de prueba "Lomo con Papas" ($1450.00, 25min)...')
    const createProdRes = await fetch(`${apiBaseUrl}/api/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        name: 'Lomo con Papas',
        description: 'Bife de lomo tierno con papas fritas bastón',
        price: 1450.00,
        categoryId: testCat.id,
        estimatedTime: 25
      })
    })
    const prod = await createProdRes.json() as any
    console.log('✅ Producto creado:', prod)

    // C. Editar el precio del producto
    console.log('✏️ Editando precio del producto a $1550.00...')
    const updateProdRes = await fetch(`${apiBaseUrl}/api/products/${prod.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ price: 1550.00 })
    })
    const updatedProd = await updateProdRes.json() as any
    console.log('✅ Producto editado:', updatedProd)

    // D. Togglear la disponibilidad a false vía PATCH
    console.log('⚡ Cambiando disponibilidad del producto a inactivo (available: false)...')
    const toggleAvailRes = await fetch(`${apiBaseUrl}/api/products/${prod.id}/availability`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({ available: false })
    })
    const toggledProd = await toggleAvailRes.json() as any
    console.log('✅ Disponibilidad cambiada:', toggledProd)

    // E. Intentar eliminar la categoría asociada al producto (debe fallar con 400)
    console.log('🗑️ Intentando borrar la categoría "Platos Fuertes" con productos asociados...')
    const deleteCatFailRes = await fetch(`${apiBaseUrl}/api/categories/${testCat.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteCatFailData = await deleteCatFailRes.json() as any
    
    if (deleteCatFailRes.status === 400) {
      console.log('✅ Éxito esperado: Bloqueado correctamente con estado 400. Detalle:', deleteCatFailData.error)
    } else {
      console.log(`❌ Error: Se esperaba 400 pero se obtuvo ${deleteCatFailRes.status}. Body:`, deleteCatFailData)
      process.exit(1)
    }

    // F. Eliminar el producto
    console.log('🗑️ Eliminando producto "Lomo con Papas"...')
    const deleteProdRes = await fetch(`${apiBaseUrl}/api/products/${prod.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteProdData = await deleteProdRes.json()
    console.log('✅ Producto eliminado:', deleteProdData)

    // G. Eliminar la categoría (ahora debe funcionar con 200)
    console.log('🗑️ Eliminando categoría "Platos Fuertes" (ahora vacía)...')
    const deleteCatSuccessRes = await fetch(`${apiBaseUrl}/api/categories/${testCat.id}`, {
      method: 'DELETE',
      headers: { Cookie: ownerCookie }
    })
    const deleteCatSuccessData = await deleteCatSuccessRes.json()
    console.log('✅ Categoría eliminada:', deleteCatSuccessData)

    // ==========================================
    // 11. Prueba de Configuración del Local
    // ==========================================
    console.log('\n🧪 Iniciando prueba para Configuración del Restaurante...')

    // A. Obtener configuración actual
    console.log('🔍 Obteniendo configuración actual del restaurante...')
    const getConfigRes = await fetch(`${apiBaseUrl}/api/restaurant/config`, {
      headers: { Cookie: ownerCookie }
    })
    const currentConfig = await getConfigRes.json() as any
    console.log('✅ Configuración obtenida:', currentConfig)

    // B. Actualizar configuración
    console.log('✏️ Actualizando dirección, CUIT, teléfono y horarios...')
    const updateConfigRes = await fetch(`${apiBaseUrl}/api/restaurant/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
      body: JSON.stringify({
        address: 'Av. Libertador 4500, CABA',
        cuit: '30-71234567-8',
        phone: '+54 11 5555-1234',
        currency: 'ARS',
        openingHours: {
          monday: { closed: false, open: '12:00', close: '23:00' },
          tuesday: { closed: true, open: '12:00', close: '23:00' }
        }
      })
    })
    const updatedConfig = await updateConfigRes.json() as any
    console.log('✅ Configuración actualizada:', updatedConfig)

    console.log('\n🧪 Prueba de RBAC, Aislamiento y Ciclo de Vida finalizada con éxito.')
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Falló la prueba de RBAC:', error.message)
    process.exit(1)
  }
}

runTest()
