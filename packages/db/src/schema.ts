// Enums compartidos
export * from "./schema/restaurants.js";
export * from "./auth-schema.js";

// Re-exportar enums que todavía no tienen su propio archivo
import { sql } from "drizzle-orm";
import {
    pgTable, pgEnum, uuid, text, boolean, timestamp,
    numeric, integer, date, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { restaurants } from "./schema/restaurants.js";
import { user } from "./auth-schema.js";

export const userRoleEnum = pgEnum("user_role", ["owner", "manager", "waiter", "cashier", "cook", "host"]);
export const deviceTypeEnum = pgEnum("device_type", ["tablet", "phone", "desktop", "kds"]);
export const tableStatusEnum = pgEnum("table_status", ["free", "occupied", "reserved", "waiting_bill", "cleaning"]);
export const tableShapeEnum = pgEnum("table_shape", ["rectangle", "circle", "square"]);
export const unitTypeEnum = pgEnum("unit_type", ["g", "kg", "ml", "l", "unit", "portion"]);
export const stockMovementReasonEnum = pgEnum("stock_movement_reason", ["sale", "purchase", "adjustment", "waste", "return"]);
export const orderStatusEnum = pgEnum("order_status", ["open", "in_progress", "ready", "billed", "paid", "cancelled"]);
export const orderItemStatusEnum = pgEnum("order_item_status", ["pending", "sent", "preparing", "ready", "delivered", "cancelled"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "credit_card", "debit_card", "mercado_pago", "transfer", "voucher", "other"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "approved", "rejected", "refunded"]);
export const invoiceTypeEnum = pgEnum("invoice_type", ["A", "B", "C", "credit_note_A", "credit_note_B"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["pending", "confirmed", "seated", "completed", "cancelled", "no_show"]);

export const devices = pgTable("devices", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: deviceTypeEnum("type").notNull().default("phone"),
    platform: text("platform"),
    pushToken: text("push_token"),
    appVersion: text("app_version"),
    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("devices_restaurant_idx").on(table.restaurantId),
    index("devices_user_idx").on(table.userId),
]);

export const sections = pgTable("sections", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("sections_restaurant_idx").on(table.restaurantId),
]);

export const tables = pgTable("tables", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }).notNull(),
    number: text("number").notNull(),
    capacity: integer("capacity").notNull().default(4),
    posX: numeric("pos_x", { precision: 10, scale: 2 }).notNull().default("0"),
    posY: numeric("pos_y", { precision: 10, scale: 2 }).notNull().default("0"),
    width: numeric("width", { precision: 10, scale: 2 }).notNull().default("80"),
    height: numeric("height", { precision: 10, scale: 2 }).notNull().default("80"),
    shape: tableShapeEnum("shape").notNull().default("rectangle"),
    status: tableStatusEnum("status").notNull().default("free"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    uniqueIndex("tables_restaurant_number_unique").on(table.restaurantId, table.number),
    index("tables_restaurant_idx").on(table.restaurantId),
    index("tables_section_idx").on(table.sectionId),
    index("tables_status_idx").on(table.restaurantId, table.status),
]);

export const categories = pgTable("categories", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    parentId: uuid("parent_id").references((): any => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    displayOrder: integer("display_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("categories_restaurant_idx").on(table.restaurantId),
]);

export const products = pgTable("products", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    cost: numeric("cost", { precision: 12, scale: 2 }),
    sku: text("sku"),
    isAvailable: boolean("is_available").notNull().default(true),
    trackStock: boolean("track_stock").notNull().default(false),
    prepTimeMin: integer("prep_time_min").default(10),
    displayOrder: integer("display_order").notNull().default(0),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("products_restaurant_idx").on(table.restaurantId),
    index("products_category_idx").on(table.categoryId),
    index("products_available_idx").on(table.restaurantId, table.isAvailable),
]);

export const modifierGroups = pgTable("modifier_groups", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    required: boolean("required").notNull().default(false),
    multiple: boolean("multiple").notNull().default(false),
    minSelections: integer("min_selections").notNull().default(0),
    maxSelections: integer("max_selections"),
    displayOrder: integer("display_order").notNull().default(0),
}, (table) => [
    index("modifier_groups_restaurant_idx").on(table.restaurantId),
]);

export const productModifierGroups = pgTable("product_modifier_groups", {
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    groupId: uuid("group_id").references(() => modifierGroups.id, { onDelete: "cascade" }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
});

export const modifiers = pgTable("modifiers", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    groupId: uuid("group_id").references(() => modifierGroups.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    priceDelta: numeric("price_delta", { precision: 12, scale: 2 }).notNull().default("0"),
    isDefault: boolean("is_default").notNull().default(false),
    isAvailable: boolean("is_available").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
}, (table) => [
    index("modifiers_restaurant_idx").on(table.restaurantId),
    index("modifiers_group_idx").on(table.groupId),
]);

export const ingredients = pgTable("ingredients", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    unit: unitTypeEnum("unit").notNull().default("unit"),
    stockQuantity: numeric("stock_quantity", { precision: 12, scale: 3 }).notNull().default("0"),
    minStockAlert: numeric("min_stock_alert", { precision: 12, scale: 3 }),
    costPerUnit: numeric("cost_per_unit", { precision: 12, scale: 4 }),
    supplier: text("supplier"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("ingredients_restaurant_idx").on(table.restaurantId),
]);

export const recipes = pgTable("recipes", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "restrict" }).notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unit: unitTypeEnum("unit").notNull().default("unit"),
}, (table) => [
    uniqueIndex("recipes_product_ingredient_unique").on(table.productId, table.ingredientId),
    index("recipes_restaurant_idx").on(table.restaurantId),
]);

export const stockMovements = pgTable("stock_movements", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    ingredientId: uuid("ingredient_id").references(() => ingredients.id, { onDelete: "restrict" }).notNull(),
    orderId: uuid("order_id"),
    reason: stockMovementReasonEnum("reason").notNull(),
    quantityDelta: numeric("quantity_delta", { precision: 12, scale: 4 }).notNull(),
    quantityAfter: numeric("quantity_after", { precision: 12, scale: 4 }).notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("stock_movements_ingredient_idx").on(table.ingredientId),
    index("stock_movements_restaurant_idx").on(table.restaurantId, table.createdAt),
]);

export const orders = pgTable("orders", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    tableId: uuid("table_id").references(() => tables.id, { onDelete: "set null" }),
    waiterId: text("waiter_id").references(() => user.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    customerId: uuid("customer_id"),
    status: orderStatusEnum("status").notNull().default("open"),
    coverCount: integer("cover_count").notNull().default(1),
    notes: text("notes"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 4 }).notNull().default("0.21"),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
    firstItemAt: timestamp("first_item_at"),
    billedAt: timestamp("billed_at"),
    closedAt: timestamp("closed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("orders_restaurant_idx").on(table.restaurantId),
    index("orders_table_idx").on(table.tableId),
    index("orders_status_idx").on(table.restaurantId, table.status),
    index("orders_waiter_idx").on(table.waiterId),
    index("orders_opened_at_idx").on(table.restaurantId, table.openedAt),
]);

export const orderItems = pgTable("order_items", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "restrict" }).notNull(),
    guestNumber: integer("guest_number"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    totalPrice: numeric("total_price", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    status: orderItemStatusEnum("status").notNull().default("pending"),
    sentToKitchenAt: timestamp("sent_to_kitchen_at"),
    readyAt: timestamp("ready_at"),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("order_items_order_idx").on(table.orderId),
    index("order_items_status_idx").on(table.restaurantId, table.status),
    index("order_items_product_idx").on(table.productId),
]);

export const orderItemModifiers = pgTable("order_item_modifiers", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "cascade" }).notNull(),
    modifierId: uuid("modifier_id").references(() => modifiers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    priceDelta: numeric("price_delta", { precision: 12, scale: 2 }).notNull().default("0"),
}, (table) => [
    index("order_item_modifiers_restaurant_idx").on(table.restaurantId),
]);

export const payments = pgTable("payments", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }).notNull(),
    processedBy: text("processed_by").references(() => user.id, { onDelete: "set null" }),
    method: paymentMethodEnum("method").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    tipAmount: numeric("tip_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    externalId: text("external_id"),
    externalProvider: text("external_provider"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("payments_order_idx").on(table.orderId),
    index("payments_restaurant_idx").on(table.restaurantId),
]);

export const invoices = pgTable("invoices", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }).notNull(),
    customerId: uuid("customer_id"),
    type: invoiceTypeEnum("type").notNull().default("B"),
    afipPuntoVenta: integer("afip_punto_venta"),
    afipCbteNro: integer("afip_cbte_nro"),
    afipCae: text("afip_cae"),
    afipCaeVto: text("afip_cae_vto"),
    afipResultCode: text("afip_result_code"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 12, scale: 2 }).notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    pdfUrl: text("pdf_url"),
    xmlRaw: text("xml_raw"),
    status: text("status").notNull().default("pending"),
    issuedAt: timestamp("issued_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("invoices_restaurant_idx").on(table.restaurantId),
    index("invoices_order_idx").on(table.orderId),
]);

export const customers = pgTable("customers", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    cuit: text("cuit"),
    notes: text("notes"),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    birthday: date("birthday"),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`),
    lastVisitAt: timestamp("last_visit_at"),
    totalSpent: numeric("total_spent", { precision: 12, scale: 2 }).notNull().default("0"),
    visitCount: integer("visit_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("customers_restaurant_idx").on(table.restaurantId),
    index("customers_phone_idx").on(table.restaurantId, table.phone),
]);

export const reservations = pgTable("reservations", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    tableId: uuid("table_id").references(() => tables.id, { onDelete: "set null" }),
    assignedWaiterId: text("assigned_waiter_id").references(() => user.id, { onDelete: "set null" }),
    partySize: integer("party_size").notNull(),
    reservedAt: timestamp("reserved_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(90),
    status: reservationStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    source: text("source").default("manual"),
    confirmationCode: text("confirmation_code").unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
    index("reservations_restaurant_idx").on(table.restaurantId),
    index("reservations_date_idx").on(table.restaurantId, table.reservedAt),
]);

export const shifts = pgTable("shifts", {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }).notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
    clockInAt: timestamp("clock_in_at").notNull(),
    clockOutAt: timestamp("clock_out_at"),
    breakMinutes: integer("break_minutes").notNull().default(0),
    totalSales: numeric("total_sales", { precision: 12, scale: 2 }).notNull().default("0"),
    totalTips: numeric("total_tips", { precision: 12, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("shifts_restaurant_idx").on(table.restaurantId),
    index("shifts_user_idx").on(table.userId, table.clockInAt),
]);