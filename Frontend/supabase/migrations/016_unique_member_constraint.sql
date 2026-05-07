-- ============================================================
-- 016_unique_member_constraint.sql
-- Ensure a customer cannot be added to the same group twice
-- ============================================================

ALTER TABLE public.chit_members
DROP CONSTRAINT IF EXISTS unique_group_customer;

ALTER TABLE public.chit_members
ADD CONSTRAINT unique_group_customer UNIQUE (chit_group_id, customer_id);
