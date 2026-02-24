BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_type') THEN
    CREATE TYPE role_type AS ENUM ('PARENT', 'CHILD', 'ADMIN', 'KITCHEN', 'DELIVERY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_type') THEN
    CREATE TYPE session_type AS ENUM ('LUNCH', 'SNACK', 'BREAKFAST');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender_type') THEN
    CREATE TYPE gender_type AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('PLACED', 'CANCELLED', 'LOCKED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blackout_type') THEN
    CREATE TYPE blackout_type AS ENUM ('ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM ('PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role role_type NOT NULL,
  username varchar(120) NOT NULL,
  password_hash text NOT NULL,
  first_name varchar(100),
  last_name varchar(100) NOT NULL,
  phone_number varchar(30) NOT NULL,
  email varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_phone_number_idx ON users (phone_number);

CREATE TABLE IF NOT EXISTS parents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  date_of_birth date NOT NULL,
  gender gender_type NOT NULL,
  school_grade varchar(50) NOT NULL,
  school_name varchar(150) NOT NULL,
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS children_school_idx ON children (school_name, school_grade);
CREATE INDEX IF NOT EXISTS children_dob_idx ON children (date_of_birth);

CREATE TABLE IF NOT EXISTS parent_children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id),
  child_id uuid NOT NULL REFERENCES children(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, child_id)
);

CREATE TABLE IF NOT EXISTS child_dietary_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  restriction_label varchar(120) NOT NULL,
  restriction_details text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session session_type NOT NULL,
  service_date date NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (session, service_date)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  allergen_flag boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredients_name_ci_uq ON ingredients (lower(name));

CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL REFERENCES menus(id),
  name varchar(150) NOT NULL,
  description text NOT NULL,
  nutrition_facts_text text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  image_url text NOT NULL,
  is_available boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS menu_items_menu_available_idx ON menu_items (menu_id, is_available);
CREATE UNIQUE INDEX IF NOT EXISTS menu_items_name_ci_uq ON menu_items (lower(name));

CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredients(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS blackout_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blackout_date date NOT NULL UNIQUE,
  type blackout_type NOT NULL,
  reason text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number uuid NOT NULL DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id),
  placed_by_user_id uuid NOT NULL REFERENCES users(id),
  session session_type NOT NULL,
  service_date date NOT NULL,
  status order_status NOT NULL DEFAULT 'PLACED',
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  dietary_snapshot text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivery_status delivery_status NOT NULL DEFAULT 'PENDING',
  delivered_at timestamptz,
  delivered_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT orders_order_number_uq UNIQUE (order_number),
  CONSTRAINT orders_service_weekday_chk CHECK (extract(isodow from service_date) BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_child_session_date_active_uq
  ON orders (child_id, session, service_date)
  WHERE status <> 'CANCELLED' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS orders_service_session_idx ON orders (service_date, session);
CREATE INDEX IF NOT EXISTS orders_child_service_idx ON orders (child_id, service_date);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  item_name_snapshot varchar(150) NOT NULL,
  price_snapshot numeric(12,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS order_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  action varchar(40) NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  mutation_at timestamptz NOT NULL DEFAULT now(),
  before_json jsonb,
  after_json jsonb
);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  delivery_user_id uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  parent_id uuid NOT NULL REFERENCES parents(id),
  status payment_status NOT NULL DEFAULT 'UNPAID',
  proof_image_url text,
  proof_uploaded_at timestamptz,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  delivery_status delivery_status NOT NULL DEFAULT 'PENDING',
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_daily_agg (
  service_date date NOT NULL,
  session session_type NOT NULL,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  total_qty bigint NOT NULL,
  PRIMARY KEY (service_date, session, menu_item_id)
);

CREATE OR REPLACE FUNCTION enforce_parent_child_limit()
RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM parent_children WHERE parent_id = NEW.parent_id) >= 10 THEN
    RAISE EXCEPTION 'A parent cannot have more than 10 children';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parent_child_limit ON parent_children;
CREATE TRIGGER trg_parent_child_limit
BEFORE INSERT ON parent_children
FOR EACH ROW
EXECUTE FUNCTION enforce_parent_child_limit();

CREATE OR REPLACE FUNCTION enforce_order_item_limit()
RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM order_items WHERE order_id = NEW.order_id) >= 5 THEN
    RAISE EXCEPTION 'An order cannot have more than 5 distinct items';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_item_limit ON order_items;
CREATE TRIGGER trg_order_item_limit
BEFORE INSERT ON order_items
FOR EACH ROW
EXECUTE FUNCTION enforce_order_item_limit();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'parents',
    'children',
    'child_dietary_restrictions',
    'menus',
    'ingredients',
    'menu_items',
    'blackout_days',
    'orders',
    'order_items',
    'delivery_assignments',
    'billing_records'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'trg_' || t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', 'trg_' || t || '_updated_at', t);
  END LOOP;
END$$;

COMMIT;
