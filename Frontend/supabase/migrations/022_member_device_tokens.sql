-- ============================================================
-- 022_member_device_tokens.sql
-- Store FCM tokens per member customer
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  fcm_token TEXT NOT NULL,
  platform TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, fcm_token)
);

ALTER TABLE public.member_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access to member_device_tokens for demo"
  ON public.member_device_tokens FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_member_device_tokens_customer
  ON public.member_device_tokens(customer_id);
