-- ============================================================
-- 015_chit_members_user_id_optional.sql
-- Make user_id in chit_members optional since admins are adding
-- CRM customers who don't necessarily have an auth account yet.
-- ============================================================

ALTER TABLE public.chit_members ALTER COLUMN user_id DROP NOT NULL;
