import { relations } from "drizzle-orm";
import { restaurants } from "./schema/restaurants.js";
import { user } from "./auth-schema.js";
import {
  devices, sections, tables,
  categories, products, modifierGroups, productModifierGroups,
  modifiers, ingredients, recipes, stockMovements,
  orders, orderItems, orderItemModifiers,
  payments, invoices, customers, reservations, shifts,
} from "./schema.js";

export const restaurantsRelations = relations(restaurants, ({ many }) => ({
  users:        many(user),
  devices:      many(devices),
  sections:     many(sections),
  categories:   many(categories),
  products:     many(products),
  orders:       many(orders),
  customers:    many(customers),
  reservations: many(reservations),
}));

export const devicesRelations = relations(devices, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [devices.restaurantId],
    references: [restaurants.id],
  }),
  user: one(user, {
    fields: [devices.userId],
    references: [user.id],
  }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [sections.restaurantId],
    references: [restaurants.id],
  }),
  tables: many(tables),
}));

export const tablesRelations = relations(tables, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [tables.restaurantId],
    references: [restaurants.id],
  }),
  section: one(sections, {
    fields: [tables.sectionId],
    references: [sections.id],
  }),
  orders:       many(orders),
  reservations: many(reservations),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [categories.restaurantId],
    references: [restaurants.id],
  }),
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "subcategories",
  }),
  children: many(categories, { relationName: "subcategories" }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [products.restaurantId],
    references: [restaurants.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  modifierGroups: many(productModifierGroups),
  recipes:        many(recipes),
  orderItems:     many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurantId],
    references: [restaurants.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
  waiter: one(user, {
    fields: [orders.waiterId],
    references: [user.id],
  }),
  items:    many(orderItems),
  payments: many(payments),
  invoices: many(invoices),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  modifiers: many(orderItemModifiers),
}));

export const orderItemModifiersRelations = relations(orderItemModifiers, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [orderItemModifiers.orderItemId],
    references: [orderItems.id],
  }),
  modifier: one(modifiers, {
    fields: [orderItemModifiers.modifierId],
    references: [modifiers.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  processedBy: one(user, {
    fields: [payments.processedBy],
    references: [user.id],
  }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [customers.restaurantId],
    references: [restaurants.id],
  }),
  reservations: many(reservations),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [reservations.restaurantId],
    references: [restaurants.id],
  }),
  customer: one(customers, {
    fields: [reservations.customerId],
    references: [customers.id],
  }),
  table: one(tables, {
    fields: [reservations.tableId],
    references: [tables.id],
  }),
  waiter: one(user, {
    fields: [reservations.assignedWaiterId],
    references: [user.id],
  }),
}));

export const shiftsRelations = relations(shifts, ({ one }) => ({
  restaurant: one(restaurants, {
    fields: [shifts.restaurantId],
    references: [restaurants.id],
  }),
  user: one(user, {
    fields: [shifts.userId],
    references: [user.id],
  }),
}));

export const ingredientsRelations = relations(ingredients, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [ingredients.restaurantId],
    references: [restaurants.id],
  }),
  recipes:        many(recipes),
  stockMovements: many(stockMovements),
}));

export const recipesRelations = relations(recipes, ({ one }) => ({
  product: one(products, {
    fields: [recipes.productId],
    references: [products.id],
  }),
  ingredient: one(ingredients, {
    fields: [recipes.ingredientId],
    references: [ingredients.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  ingredient: one(ingredients, {
    fields: [stockMovements.ingredientId],
    references: [ingredients.id],
  }),
  createdBy: one(user, {
    fields: [stockMovements.createdBy],
    references: [user.id],
  }),
}));

export const modifierGroupsRelations = relations(modifierGroups, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [modifierGroups.restaurantId],
    references: [restaurants.id],
  }),
  modifiers:        many(modifiers),
  productGroups:    many(productModifierGroups),
}));

export const modifiersRelations = relations(modifiers, ({ one }) => ({
  group: one(modifierGroups, {
    fields: [modifiers.groupId],
    references: [modifierGroups.id],
  }),
}));