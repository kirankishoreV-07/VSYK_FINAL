-- ============================================================
-- VSYK Chits — Migration 002: Chit Groups, Members & Payments
-- ============================================================

-- chit_groups: Each chit fund group
CREATE TABLE IF NOT EXISTS public.chit_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value BIGINT NOT NULL,                  -- total chit value in paise (₹1 = 100 paise)
  duration_months INTEGER NOT NULL,
  monthly_installment BIGINT NOT NULL,    -- in paise
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chit_groups ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view chit groups (for discovery)
CREATE POLICY "Authenticated users can view chit groups"
  ON public.chit_groups FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────

-- chit_members: Links a user to a chit group
CREATE TABLE IF NOT EXISTS public.chit_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chit_group_id UUID REFERENCES public.chit_groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  current_month INTEGER NOT NULL DEFAULT 1,
  bid_status TEXT NOT NULL DEFAULT 'active'
    CHECK (bid_status IN ('active', 'bidding', 'completed', 'foreclosed')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(chit_group_id, user_id)
);

ALTER TABLE public.chit_members ENABLE ROW LEVEL SECURITY;

-- Users can only view their own memberships
CREATE POLICY "Users can view their own chit memberships"
  ON public.chit_members FOR SELECT
  USING (auth.uid() = user_id);

-- Users can join chit groups (insert their own membership)
CREATE POLICY "Users can join chit groups"
  ON public.chit_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────

-- payment_schedules: Monthly payment plan per chit member
CREATE TABLE IF NOT EXISTS public.payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chit_member_id UUID REFERENCES public.chit_members(id) ON DELETE CASCADE NOT NULL,
  month_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount BIGINT NOT NULL,               -- in paise
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  dividend_amount BIGINT DEFAULT 0      -- dividend earned this month, in paise
);

ALTER TABLE public.payment_schedules ENABLE ROW LEVEL SECURITY;

-- Users can only view payment schedules linked to their chit memberships
CREATE POLICY "Users can view their own payment schedules"
  ON public.payment_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chit_members cm
      WHERE cm.id = payment_schedules.chit_member_id
        AND cm.user_id = auth.uid()
    )
  );

-- Users can update their own payment schedules (mark as paid)
CREATE POLICY "Users can update their own payment schedules"
  ON public.payment_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.chit_members cm
      WHERE cm.id = payment_schedules.chit_member_id
        AND cm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────

-- View: Dashboard stats per user (total portfolio value + total earnings)
CREATE OR REPLACE VIEW public.member_dashboard_stats AS
SELECT
  cm.user_id,
  COALESCE(SUM(cg.value), 0)              AS total_portfolio_value,
  COALESCE(SUM(ps.dividend_amount), 0)    AS total_earnings,
  COUNT(DISTINCT cm.id)                   AS active_chit_count
FROM public.chit_members cm
JOIN public.chit_groups cg ON cg.id = cm.chit_group_id AND cg.status = 'active'
LEFT JOIN public.payment_schedules ps
  ON ps.chit_member_id = cm.id AND ps.paid = TRUE
GROUP BY cm.user_id;

-- RLS for the view — only the owner can see their stats
ALTER VIEW public.member_dashboard_stats OWNER TO postgres;

-- ─────────────────────────────────────────────────────────────

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chit_members_user_id ON public.chit_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chit_members_group_id ON public.chit_members(chit_group_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_member ON public.payment_schedules(chit_member_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_due ON public.payment_schedules(due_date);
CREATE INDEX IF NOT EXISTS idx_payment_schedules_paid ON public.payment_schedules(paid);
