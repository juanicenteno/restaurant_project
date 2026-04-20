-- =============================================================================
-- SISTEMA DE GESTIÓN PARA RESTAURANTES
-- Schema completo — PostgreSQL con Row Level Security
-- Multi-tenancy: Opción B (tenant_id en cada tabla) + RLS
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- GRUPO 1: TENANCY Y USUARIOS
-- =============================================================================

-- Planes disponibles (referencia de negocio)
CREATE TYPE plan_type AS ENUM ('free', 'basic', 'pro', 'chain');

-- Roles de usuario
CREATE TYPE user_role AS ENUM ('owner', 'manager', 'waiter', 'cashier', 'cook', 'host');

-- Tipo de dispositivo
CREATE TYPE device_type AS ENUM ('tablet', 'phone', 'desktop', 'kds');

-- Restaurantes (un registro por tenant)
CREATE TABLE restaurants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,               -- para URL amigable
    cuit            TEXT,                               -- para facturación AFIP
    address         TEXT,
    city            TEXT,
    province        TEXT,
    phone           TEXT,
    email           TEXT,
    logo_url        TEXT,
    timezone        TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    currency        TEXT NOT NULL DEFAULT 'ARS',
    plan            plan_type NOT NULL DEFAULT 'free',
    trial_ends_at   TIMESTAMPTZ,
    settings        JSONB NOT NULL DEFAULT '{}',        -- config flexible del local
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usuarios (mozos, dueños, cajeros, cocineros, etc.)
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    name            TEXT NOT NULL,
    phone           TEXT,
    avatar_url      TEXT,
    role            user_role NOT NULL DEFAULT 'waiter',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, email)                       -- email único por restaurante
);

-- Dispositivos registrados (tablets fijas + celulares BYOD de mozos)
-- Clave para offline sync y notificaciones push
CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,                      -- "iPad barra", "Samsung Juan"
    type            device_type NOT NULL DEFAULT 'phone',
    platform        TEXT,                               -- 'ios', 'android', 'web'
    push_token      TEXT,                               -- para notificaciones push
    app_version     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- GRUPO 2: SALÓN — SECCIONES Y MESAS
-- =============================================================================

-- Estado de mesa
CREATE TYPE table_status AS ENUM ('free', 'occupied', 'reserved', 'waiting_bill', 'cleaning');

-- Forma de mesa en el mapa visual
CREATE TYPE table_shape AS ENUM ('rectangle', 'circle', 'square');

-- Secciones del local (salón principal, terraza, barra, VIP, etc.)
CREATE TABLE sections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mesas
-- pos_x, pos_y, width, height son coordenadas para el mapa visual drag-and-drop
CREATE TABLE tables (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    section_id      UUID NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
    number          TEXT NOT NULL,                      -- "1", "A1", "VIP-3"
    capacity        INTEGER NOT NULL DEFAULT 4,
    pos_x           NUMERIC NOT NULL DEFAULT 0,         -- posición X en el mapa (%)
    pos_y           NUMERIC NOT NULL DEFAULT 0,         -- posición Y en el mapa (%)
    width           NUMERIC NOT NULL DEFAULT 80,        -- ancho en el mapa (px)
    height          NUMERIC NOT NULL DEFAULT 80,        -- alto en el mapa (px)
    shape           table_shape NOT NULL DEFAULT 'rectangle',
    status          table_status NOT NULL DEFAULT 'free',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, number)
);

-- =============================================================================
-- GRUPO 3: MENÚ — CATEGORÍAS, PRODUCTOS Y MODIFICADORES
-- =============================================================================

-- Categorías de menú (con soporte para sub-categorías via parent_id)
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    image_url       TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Productos del menú
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name            TEXT NOT NULL,
    description     TEXT,
    image_url       TEXT,
    price           NUMERIC(12,2) NOT NULL,
    cost            NUMERIC(12,2),                      -- costo interno (para margen)
    sku             TEXT,                               -- código interno del producto
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    track_stock     BOOLEAN NOT NULL DEFAULT FALSE,     -- si descontar del inventario
    prep_time_min   INTEGER DEFAULT 10,                 -- tiempo estimado en cocina (min)
    display_order   INTEGER NOT NULL DEFAULT 0,
    tags            TEXT[] DEFAULT '{}',                -- "vegano", "sin gluten", etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grupos de modificadores (ej: "Término de cocción", "Tamaño", "Extras")
CREATE TABLE modifier_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                      -- "Término de cocción"
    required        BOOLEAN NOT NULL DEFAULT FALSE,
    multiple        BOOLEAN NOT NULL DEFAULT FALSE,     -- si permite elegir varios
    min_selections  INTEGER NOT NULL DEFAULT 0,
    max_selections  INTEGER,                            -- NULL = sin límite
    display_order   INTEGER NOT NULL DEFAULT 0
);

-- Relación productos ↔ grupos de modificadores (M:N)
CREATE TABLE product_modifier_groups (
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    group_id        UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, group_id)
);

-- Modificadores individuales (ej: "Bien cocido", "Grande", "Queso extra")
CREATE TABLE modifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    group_id        UUID NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    price_delta     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- suma al precio base
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INTEGER NOT NULL DEFAULT 0
);

-- =============================================================================
-- GRUPO 4: INVENTARIO Y RECETAS
-- =============================================================================

-- Unidades de medida
CREATE TYPE unit_type AS ENUM ('g', 'kg', 'ml', 'l', 'unit', 'portion');

-- Ingredientes (stock del almacén)
CREATE TABLE ingredients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    unit            unit_type NOT NULL DEFAULT 'unit',
    stock_quantity  NUMERIC(12,3) NOT NULL DEFAULT 0,
    min_stock_alert NUMERIC(12,3),                      -- alerta de stock bajo
    cost_per_unit   NUMERIC(12,4),                      -- costo por unidad/kg/l
    supplier        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recetas: qué ingredientes necesita cada producto
CREATE TABLE recipes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity        NUMERIC(12,4) NOT NULL,
    unit            unit_type NOT NULL DEFAULT 'unit',
    UNIQUE (product_id, ingredient_id)
);

-- Movimientos de inventario (para auditoría y trazabilidad)
CREATE TYPE stock_movement_reason AS ENUM (
    'sale',           -- descuento por venta
    'purchase',       -- ingreso por compra
    'adjustment',     -- ajuste manual
    'waste',          -- merma
    'return'          -- devolución al proveedor
);

CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    order_id        UUID,                               -- si fue por una venta
    reason          stock_movement_reason NOT NULL,
    quantity_delta  NUMERIC(12,4) NOT NULL,             -- positivo=entrada, negativo=salida
    quantity_after  NUMERIC(12,4) NOT NULL,             -- stock resultante
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- GRUPO 5: PEDIDOS Y COMANDAS
-- =============================================================================

-- Estado de la orden general
CREATE TYPE order_status AS ENUM (
    'open',           -- comanda abierta, tomando pedidos
    'in_progress',    -- enviado a cocina, en preparación
    'ready',          -- cocina terminó, listo para servir
    'billed',         -- cuenta pedida, esperando pago
    'paid',           -- pagado y cerrado
    'cancelled'       -- cancelado
);

-- Estado de cada ítem dentro de la orden
CREATE TYPE order_item_status AS ENUM (
    'pending',        -- ingresado pero no enviado a cocina
    'sent',           -- enviado al KDS
    'preparing',      -- cocinero lo tomó
    'ready',          -- listo para llevar a la mesa
    'delivered',      -- entregado al cliente
    'cancelled'       -- cancelado
);

-- Órdenes / comandas
CREATE TABLE orders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id            UUID REFERENCES tables(id) ON DELETE SET NULL,
    waiter_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id           UUID REFERENCES devices(id) ON DELETE SET NULL,
    customer_id         UUID,                           -- FK a customers (opcional)
    status              order_status NOT NULL DEFAULT 'open',
    cover_count         INTEGER NOT NULL DEFAULT 1,     -- cantidad de personas
    notes               TEXT,                           -- nota general de la mesa
    subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_rate            NUMERIC(5,4) NOT NULL DEFAULT 0.21, -- IVA (21% por defecto)
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
    tip_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    opened_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    first_item_at       TIMESTAMPTZ,                    -- cuando llegó el primer plato
    billed_at           TIMESTAMPTZ,                    -- cuando pidió la cuenta
    closed_at           TIMESTAMPTZ,                    -- cuando se pagó
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ítems de cada orden
CREATE TABLE order_items (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    guest_number        INTEGER,                        -- para dividir la cuenta por persona
    quantity            INTEGER NOT NULL DEFAULT 1,
    unit_price          NUMERIC(12,2) NOT NULL,         -- precio al momento de pedir
    total_price         NUMERIC(12,2) NOT NULL,
    notes               TEXT,                           -- "sin cebolla", "bien caliente"
    status              order_item_status NOT NULL DEFAULT 'pending',
    sent_to_kitchen_at  TIMESTAMPTZ,
    ready_at            TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Modificadores aplicados a cada ítem (snapshot al momento del pedido)
CREATE TABLE order_item_modifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id     UUID REFERENCES modifiers(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,                      -- snapshot del nombre
    price_delta     NUMERIC(12,2) NOT NULL DEFAULT 0    -- snapshot del precio
);

-- =============================================================================
-- GRUPO 6: PAGOS Y FACTURACIÓN
-- =============================================================================

-- Métodos de pago
CREATE TYPE payment_method AS ENUM (
    'cash',
    'credit_card',
    'debit_card',
    'mercado_pago',
    'transfer',
    'voucher',
    'other'
);

-- Estado de pago
CREATE TYPE payment_status AS ENUM ('pending', 'approved', 'rejected', 'refunded');

-- Tipo de comprobante AFIP
CREATE TYPE invoice_type AS ENUM ('A', 'B', 'C', 'credit_note_A', 'credit_note_B');

-- Pagos (una orden puede tener múltiples pagos — split de cuenta)
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    processed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    method              payment_method NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    tip_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    status              payment_status NOT NULL DEFAULT 'pending',
    external_id         TEXT,                           -- ID de MP, terminal, etc.
    external_provider   TEXT,                           -- 'mercado_pago', 'getnet', etc.
    metadata            JSONB DEFAULT '{}',             -- respuesta raw del proveedor
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Facturas electrónicas AFIP
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    customer_id         UUID,                           -- FK a customers (opcional)
    type                invoice_type NOT NULL DEFAULT 'B',
    afip_punto_venta    INTEGER,                        -- punto de venta AFIP
    afip_cbte_nro       INTEGER,                        -- número de comprobante AFIP
    afip_cae            TEXT,                           -- CAE obtenido de AFIP
    afip_cae_vto        TEXT,                           -- vencimiento del CAE
    afip_result_code    TEXT,                           -- código resultado de AFIP
    subtotal            NUMERIC(12,2) NOT NULL,
    tax_amount          NUMERIC(12,2) NOT NULL,
    total               NUMERIC(12,2) NOT NULL,
    pdf_url             TEXT,                           -- URL del PDF en R2
    xml_raw             TEXT,                           -- XML completo enviado a AFIP
    status              TEXT NOT NULL DEFAULT 'pending', -- 'pending','issued','error'
    issued_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- GRUPO 7: CLIENTES Y CRM
-- =============================================================================

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    cuit            TEXT,                               -- para facturas A
    notes           TEXT,
    loyalty_points  INTEGER NOT NULL DEFAULT 0,
    birthday        DATE,
    tags            TEXT[] DEFAULT '{}',                -- "VIP", "alérgico frutos secos"
    last_visit_at   TIMESTAMPTZ,
    total_spent     NUMERIC(12,2) NOT NULL DEFAULT 0,
    visit_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (restaurant_id, phone)                       -- tel único por restaurante
);

-- =============================================================================
-- GRUPO 8: RESERVAS
-- =============================================================================

CREATE TYPE reservation_status AS ENUM (
    'pending',      -- esperando confirmación
    'confirmed',    -- confirmada
    'seated',       -- el cliente llegó y está sentado
    'completed',    -- terminaron y se fueron
    'cancelled',    -- cancelada
    'no_show'       -- no aparecieron
);

CREATE TABLE reservations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    table_id            UUID REFERENCES tables(id) ON DELETE SET NULL,
    assigned_waiter_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    party_size          INTEGER NOT NULL,
    reserved_at         TIMESTAMPTZ NOT NULL,
    duration_minutes    INTEGER NOT NULL DEFAULT 90,
    status              reservation_status NOT NULL DEFAULT 'pending',
    notes               TEXT,
    source              TEXT DEFAULT 'manual',          -- 'manual', 'web', 'whatsapp'
    confirmation_code   TEXT UNIQUE DEFAULT upper(substr(md5(random()::text), 1, 6)),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- GRUPO 9: RRHH — TURNOS Y ASISTENCIA
-- =============================================================================

CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    clock_in_at     TIMESTAMPTZ NOT NULL,
    clock_out_at    TIMESTAMPTZ,
    break_minutes   INTEGER NOT NULL DEFAULT 0,
    total_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,   -- ventas atendidas en el turno
    total_tips      NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ÍNDICES — rendimiento en queries frecuentes
-- =============================================================================

-- Usuarios
CREATE INDEX idx_users_restaurant ON users(restaurant_id);
CREATE INDEX idx_users_email ON users(email);

-- Dispositivos
CREATE INDEX idx_devices_restaurant ON devices(restaurant_id);
CREATE INDEX idx_devices_user ON devices(user_id);

-- Mesas
CREATE INDEX idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX idx_tables_section ON tables(section_id);
CREATE INDEX idx_tables_status ON tables(restaurant_id, status);

-- Productos
CREATE INDEX idx_products_restaurant ON products(restaurant_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_available ON products(restaurant_id, is_available);

-- Órdenes
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX idx_orders_waiter ON orders(waiter_id);
CREATE INDEX idx_orders_opened_at ON orders(restaurant_id, opened_at DESC);

-- Ítems de órdenes
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_status ON order_items(restaurant_id, status);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- Pagos
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_restaurant ON payments(restaurant_id);

-- Facturas
CREATE INDEX idx_invoices_restaurant ON invoices(restaurant_id);
CREATE INDEX idx_invoices_order ON invoices(order_id);

-- Clientes
CREATE INDEX idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX idx_customers_phone ON customers(restaurant_id, phone);

-- Reservas
CREATE INDEX idx_reservations_restaurant ON reservations(restaurant_id);
CREATE INDEX idx_reservations_date ON reservations(restaurant_id, reserved_at);

-- Inventario
CREATE INDEX idx_stock_movements_ingredient ON stock_movements(ingredient_id);
CREATE INDEX idx_stock_movements_restaurant ON stock_movements(restaurant_id, created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Garantiza que cada sesión solo vea datos de su restaurant_id
-- =============================================================================

-- Habilitar RLS en todas las tablas multi-tenant
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_groups   ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifiers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts            ENABLE ROW LEVEL SECURITY;

-- Función helper: devuelve el restaurant_id de la sesión actual
-- Se setea en el middleware de Hono: SET LOCAL app.current_restaurant_id = '...'
CREATE OR REPLACE FUNCTION current_restaurant_id() RETURNS UUID AS $$
  SELECT current_setting('app.current_restaurant_id', TRUE)::UUID;
$$ LANGUAGE SQL STABLE;

-- Políticas RLS (un patrón repetido por tabla)
-- Solo ven y modifican datos de su propio restaurante

CREATE POLICY tenant_isolation ON users
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON devices
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON sections
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON tables
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON categories
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON products
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON modifier_groups
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON modifiers
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON ingredients
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON recipes
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON stock_movements
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON orders
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON order_items
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON order_item_modifiers
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON payments
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON invoices
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON customers
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON reservations
    USING (restaurant_id = current_restaurant_id());

CREATE POLICY tenant_isolation ON shifts
    USING (restaurant_id = current_restaurant_id());

-- =============================================================================
-- MIDDLEWARE HONO — cómo setear el restaurant_id por request
-- (comentario de referencia, no SQL)
--
-- En tu middleware de Hono, antes de cada query:
--
--   await db.execute(sql`
--     SET LOCAL app.current_restaurant_id = ${restaurantId}
--   `)
--
-- Esto activa automáticamente las políticas RLS para esa transacción.
-- El restaurant_id viene del JWT del usuario autenticado.
-- =============================================================================

-- =============================================================================
-- TRIGGERS — updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a tablas con updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON ingredients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- DATOS SEMILLA (seed) — para desarrollo local
-- =============================================================================

INSERT INTO restaurants (id, name, slug, cuit, address, city, province, plan)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Restaurante Demo',
    'demo',
    '20-12345678-9',
    'Av. Corrientes 1234',
    'Buenos Aires',
    'CABA',
    'pro'
);

INSERT INTO users (restaurant_id, email, password_hash, name, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@demo.com',
    -- password: 'demo1234' (bcrypt — reemplazar con hash real)
    '$2b$10$placeholder_hash_replace_me',
    'Admin Demo',
    'owner'
);

INSERT INTO sections (restaurant_id, name, display_order)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Salón principal', 1),
    ('00000000-0000-0000-0000-000000000001', 'Terraza', 2),
    ('00000000-0000-0000-0000-000000000001', 'Barra', 3);
