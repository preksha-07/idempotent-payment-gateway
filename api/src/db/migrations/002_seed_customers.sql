-- Seed: initial customers
-- These provide valid customer references for payment creation.
-- Uses INSERT ... ON CONFLICT DO NOTHING so the seed is idempotent
-- and can be run multiple times safely (same guarantee we teach in this project!).

INSERT INTO customers (id, external_id, name, created_at)
VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001', 'customer_001', 'Priya Sharma',    NOW()),
  ('a1b2c3d4-0002-0002-0002-000000000002', 'customer_002', 'Rahul Verma',     NOW()),
  ('a1b2c3d4-0003-0003-0003-000000000003', 'customer_003', 'Ananya Iyer',     NOW()),
  ('a1b2c3d4-0004-0004-0004-000000000004', 'customer_004', 'Karan Mehta',     NOW()),
  ('a1b2c3d4-0005-0005-0005-000000000005', 'customer_005', 'Sneha Patel',     NOW())
ON CONFLICT (external_id) DO NOTHING;
