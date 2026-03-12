BEGIN;

-- Canonical school seed baseline (future use).
-- Keep only target schools and hard-delete other schools plus dependent academic rows.

WITH target_schools(name, address, city, contact_email, contact_phone) AS (
  VALUES
    ('Bali Island School', NULL, NULL, NULL, NULL),
    ('Gandhi Memorial Intercontinental School (GMIS)', NULL, NULL, NULL, NULL),
    ('Garden Early Learning Center', NULL, NULL, NULL, NULL),
    ('Little Stars Bali Learning Kindergarten', NULL, NULL, NULL, NULL),
    ('Rumah Kecil Learning Centre', NULL, NULL, NULL, NULL),
    ('Sanur Independent School', NULL, NULL, NULL, NULL)
)
INSERT INTO schools (name, address, city, contact_email, contact_phone, is_active)
SELECT t.name, t.address, t.city, t.contact_email, t.contact_phone, true
FROM target_schools t
WHERE NOT EXISTS (
  SELECT 1 FROM schools s WHERE lower(s.name) = lower(t.name)
);

WITH target_schools(name, address, city, contact_email, contact_phone) AS (
  VALUES
    ('Bali Island School', NULL, NULL, NULL, NULL),
    ('Gandhi Memorial Intercontinental School (GMIS)', NULL, NULL, NULL, NULL),
    ('Garden Early Learning Center', NULL, NULL, NULL, NULL),
    ('Little Stars Bali Learning Kindergarten', NULL, NULL, NULL, NULL),
    ('Rumah Kecil Learning Centre', NULL, NULL, NULL, NULL),
    ('Sanur Independent School', NULL, NULL, NULL, NULL)
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

WITH doomed_schools AS (
  SELECT s.id
  FROM schools s
  WHERE lower(s.name) NOT IN (
    lower('Bali Island School'),
    lower('Gandhi Memorial Intercontinental School (GMIS)'),
    lower('Garden Early Learning Center'),
    lower('Little Stars Bali Learning Kindergarten'),
    lower('Rumah Kecil Learning Centre'),
    lower('Sanur Independent School')
  )
),
del_terms AS (
  DELETE FROM academic_terms at
  USING academic_years ay, doomed_schools ds
  WHERE at.academic_year_id = ay.id
    AND ay.school_id = ds.id
  RETURNING 1
),
del_years AS (
  DELETE FROM academic_years ay
  USING doomed_schools ds
  WHERE ay.school_id = ds.id
  RETURNING 1
)
DELETE FROM schools s
USING doomed_schools ds
WHERE s.id = ds.id
  AND NOT EXISTS (SELECT 1 FROM children c WHERE c.school_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM delivery_school_assignments dsa WHERE dsa.school_id = s.id);

COMMIT;
