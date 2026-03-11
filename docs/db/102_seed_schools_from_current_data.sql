BEGIN;

-- Future-use school seed snapshot based on current operational school names.
-- Keeps only latest target schools; non-target rows are deactivated and flagged deleted.
WITH school_seed(name, address, city, contact_email, contact_phone) AS (
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
SELECT s.name, s.address, s.city, s.contact_email, s.contact_phone, true
FROM school_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM schools x WHERE lower(x.name) = lower(s.name)
);

WITH school_seed(name, address, city, contact_email, contact_phone) AS (
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
SET address = COALESCE(seed.address, s.address),
    city = COALESCE(seed.city, s.city),
    contact_email = COALESCE(seed.contact_email, s.contact_email),
    contact_phone = COALESCE(seed.contact_phone, s.contact_phone),
    is_active = true,
    deleted_at = NULL,
    updated_at = now()
FROM school_seed seed
WHERE lower(s.name) = lower(seed.name);

WITH target_schools(name) AS (
  VALUES
    ('Blossom Primary Campus'),
    ('Bali Island School'),
    ('GMIS'),
    ('Garden Early Learning'),
    ('Little Star Bali'),
    ('Rumah Kecil Learning'),
    ('Sanur Indepenent')
),
old_schools AS (
  SELECT s.id
  FROM schools s
  WHERE NOT EXISTS (
    SELECT 1
    FROM target_schools t
    WHERE lower(t.name) = lower(s.name)
  )
)
UPDATE schools s
SET is_active = false,
    deleted_at = COALESCE(s.deleted_at, now()),
    updated_at = now()
FROM old_schools os
WHERE s.id = os.id;

COMMIT;
