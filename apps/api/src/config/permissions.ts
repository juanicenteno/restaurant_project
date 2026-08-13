export const PERMISSIONS = [
  "manage_orders",         // tomar/editar pedidos de mesa
  "manage_tables",         // ver/mover mapa de mesas
  "manage_kitchen_kds",    // ver/actualizar KDS de cocina
  "manage_bar_kds",        // ver/actualizar KDS de barra
  "manage_stock_kitchen",  // stock/recetas de cocina
  "manage_stock_bar",      // stock/recetas de barra
  "manage_payments",       // cerrar cuenta, cobrar
  "manage_staff",          // invitar/editar usuarios del local
  "manage_config",         // configuración del local
  "view_reports",
] as const

export type Permission = typeof PERMISSIONS[number]

export const INITIAL_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: [...PERMISSIONS],
  manager: PERMISSIONS.filter(p => p !== "manage_staff"),
  waiter: ["manage_orders", "manage_tables"],
  cashier: ["manage_payments"],
  cook: ["manage_kitchen_kds"],
  bartender: ["manage_bar_kds", "manage_orders"],
  host: ["manage_tables"],
}
