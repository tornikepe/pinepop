-- PINEPOP schema. Money is always integer tetri (1 ₾ = 100 tetri).

CREATE TABLE products (
  id          serial PRIMARY KEY,
  slug        text        NOT NULL UNIQUE,
  flavor      text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  color       text        NOT NULL,                 -- hex, tints the 3D jar
  price       integer     NOT NULL CHECK (price >= 0),
  cost        integer     NOT NULL DEFAULT 0 CHECK (cost >= 0),   -- what one jar costs to make
  stock       integer     NOT NULL DEFAULT 0,
  low_stock   integer     NOT NULL DEFAULT 10,      -- warn on the dashboard at or below this
  active      boolean     NOT NULL DEFAULT true,
  sort        integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_zones (
  id          serial PRIMARY KEY,
  name        text    NOT NULL,                    -- a city or district
  fee         integer NOT NULL DEFAULT 0,
  free_above  integer,                             -- order subtotal from which delivery is free
  eta         text    NOT NULL DEFAULT '',         -- "იმავე დღეს", "1–2 დღეში"
  sort        integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE coupons (
  id          serial PRIMARY KEY,
  code        text        NOT NULL UNIQUE,         -- stored upper-case
  percent_off integer CHECK (percent_off BETWEEN 1 AND 100),
  amount_off  integer CHECK (amount_off > 0),
  min_order   integer     NOT NULL DEFAULT 0,
  max_uses    integer,
  used_count  integer     NOT NULL DEFAULT 0,
  expires_at  timestamptz,
  active      boolean     NOT NULL DEFAULT true,
  note        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((percent_off IS NULL) <> (amount_off IS NULL))
);

CREATE TABLE customers (
  id            serial PRIMARY KEY,
  phone         text        NOT NULL UNIQUE,       -- +995…, the identity of a guest customer
  name          text        NOT NULL,
  note          text        NOT NULL DEFAULT '',   -- staff only
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_order_at timestamptz
);

-- An order is a snapshot: names, prices, costs, zone and discount are copied in when it is placed.
CREATE TABLE orders (
  id            serial PRIMARY KEY,
  code          text        NOT NULL UNIQUE,
  customer_id   integer REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text        NOT NULL,
  phone         text        NOT NULL,
  city          text        NOT NULL,
  address       text        NOT NULL,
  note          text        NOT NULL DEFAULT '',
  zone_id       integer REFERENCES delivery_zones(id) ON DELETE SET NULL,
  subtotal      integer     NOT NULL,
  shipping      integer     NOT NULL DEFAULT 0,
  discount      integer     NOT NULL DEFAULT 0,
  total         integer     NOT NULL,
  coupon_id     integer REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code   text        NOT NULL DEFAULT '',
  status        text        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'confirmed', 'delivering', 'delivered', 'cancelled')),
  staff_note    text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz
);
CREATE INDEX orders_status_idx ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at);
CREATE INDEX orders_customer_idx ON orders (customer_id);

CREATE TABLE order_items (
  id          serial PRIMARY KEY,
  order_id    integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  integer REFERENCES products(id) ON DELETE SET NULL,
  flavor      text    NOT NULL,
  color       text    NOT NULL DEFAULT '#ffd23f',
  qty         integer NOT NULL CHECK (qty > 0),
  unit_price  integer NOT NULL,
  unit_cost   integer NOT NULL DEFAULT 0
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

-- Every status change and staff note on an order, in order.
CREATE TABLE order_events (
  id          serial PRIMARY KEY,
  order_id    integer     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      text        NOT NULL,
  note        text        NOT NULL DEFAULT '',
  actor       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id);

-- Every change of stock, with the balance after it.
CREATE TABLE stock_movements (
  id          serial PRIMARY KEY,
  product_id  integer     NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta       integer     NOT NULL,
  balance     integer     NOT NULL,
  reason      text        NOT NULL CHECK (reason IN ('order', 'cancel', 'restock', 'adjust', 'import')),
  note        text        NOT NULL DEFAULT '',
  order_id    integer REFERENCES orders(id) ON DELETE SET NULL,
  actor       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product_idx ON stock_movements (product_id, created_at);

-- Only a customer whose order was delivered can review it, so every star is a fact.
CREATE TABLE reviews (
  id          serial PRIMARY KEY,
  order_id    integer     NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  rating      integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text        NOT NULL DEFAULT '',
  flavors     text        NOT NULL DEFAULT '',
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'hidden')),
  reply       text        NOT NULL DEFAULT '',     -- the shop's public answer
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_status_idx ON reviews (status, created_at);

CREATE TABLE faqs (
  id        serial PRIMARY KEY,
  question  text    NOT NULL,
  answer    text    NOT NULL,
  sort      integer NOT NULL DEFAULT 0,
  active    boolean NOT NULL DEFAULT true
);

-- Public site options (brand, jar, contacts…) and site texts. Values are JSON.
CREATE TABLE settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);
CREATE TABLE content (
  key         text PRIMARY KEY,
  value       text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- Internal values that must never reach the browser.
CREATE TABLE meta (
  key    text PRIMARY KEY,
  value  text NOT NULL
);

CREATE TABLE staff (
  id                   serial PRIMARY KEY,
  username             text        NOT NULL UNIQUE,
  name                 text        NOT NULL DEFAULT '',
  role                 text        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'manager', 'viewer')),
  password_hash        text        NOT NULL,
  active               boolean     NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  password_changed_at  timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,                   -- sha256 of the cookie value
  staff_id    integer     NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  user_agent  text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Who changed what, and what it was before.
CREATE TABLE audit_log (
  id          serial PRIMARY KEY,
  actor       text        NOT NULL,
  action      text        NOT NULL,
  entity      text        NOT NULL,
  entity_id   text        NOT NULL DEFAULT '',
  label       text        NOT NULL DEFAULT '',
  changes     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log (created_at);

-- Visitors counted without cookies: a daily hash that cannot be turned back into a person.
CREATE TABLE visits (
  day      date    NOT NULL,
  visitor  text    NOT NULL,
  views    integer NOT NULL DEFAULT 1,
  PRIMARY KEY (day, visitor)
);
