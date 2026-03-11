BEGIN;

-- Canonical school seed baseline (future use).
-- Replace-style behavior: target schools stay active, non-target are soft-deactivated.

WITH target_schools(name, address, city, contact_email, contact_phone) AS (
  VALUES
    ('Blossom Primary Campus', 'Jl. Example No.1, Denpasar', 'Denpasar', NULL, NULL),
    ('Bali Island School', NULL, NULL, NULL, NULL),
    ('GMIS', NULL, NULL, NULL, NULL),
    ('Garden Early Learning', NULL, NULL, NULL, NULL),
    ('Little Star Bali', NULL, NULL, NULL, NULL),
    ('Rumah Kecil Learning', NULL, NULL, NULL, NULL),
    ('Sanur Indepenent', NULL, NULL, NULL, NULL)
)
INSERT INTO schools (name, address, city, contact_email, contact_phone, is_active)
SELECT t.name, t.address, t.city, t.contact_email, t.contact_phone, true
FROM target_schools t
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE lower(s.name) = lower(t.name)
);

WITH target_schools(name, address, city, contact_email, contact_phone) AS (
  VALUES
    ('Blossom Primary Campus', 'Jl. Example No.1, Denpasar', 'Denpasar', NULL, NULL),
    ('Bali Island School', NULL, NULL, NULL, NULL),
    ('GMIS', NULL, NULL, NULL, NULL),
    ('Garden Early Learning', NULL, NULL, NULL, NULL),
    ('Little Star Bali', NULL, NULL, NULL, NULL),
    ('Rumah Kecil Learning', NULL, NULL, NULL, NULL),
    ('Sanur Indepenent', NULL, NULL, NULL, NULL)
)
UPDATE schools s
SET address = COALESCE(t.address, s.address),
    city = COALESCE(t.city, s.city),
    contact_email = COALESCE(t.contact_email, s.contact_email),
    contact_phone = COALESCE(t.contact_phone, s.contact_phone),
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
FROM target_schools t
WHERE lower(s.name) = lower(t.name);

WITH target_school_names(name) AS (
  VALUES
    ('Blossom Primary Campus'),
    ('Bali Island School'),
    ('GMIS'),
    ('Garden Early Learning'),
    ('Little Star Bali'),
    ('Rumah Kecil Learning'),
    ('Sanur Indepenent')
)
UPDATE schools s
SET is_active = false,
    deleted_at = COALESCE(s.deleted_at, now()),
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM target_school_names t WHERE lower(t.name) = lower(s.name)
);

COMMIT;
