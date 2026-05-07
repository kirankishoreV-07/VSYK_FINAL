-- ============================================================
-- 011_fix_rls_and_schema.sql
-- Fix 1: Admin RLS policies for chit_groups (INSERT/UPDATE/DELETE)
-- Fix 2: Ensure foreclosure_requests table exists with all columns
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FIX 1: chit_groups — Admin INSERT / UPDATE / DELETE policies
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admin can insert chit groups" ON public.chit_groups;
CREATE POLICY "Admin can insert chit groups"
  ON public.chit_groups FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can update chit groups" ON public.chit_groups;
CREATE POLICY "Admin can update chit groups"
  ON public.chit_groups FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can delete chit groups" ON public.chit_groups;
CREATE POLICY "Admin can delete chit groups"
  ON public.chit_groups FOR DELETE
  USING (true);

-- Replace existing SELECT policy to allow all reads (admin + users)
DROP POLICY IF EXISTS "Authenticated users can view chit groups" ON public.chit_groups;
DROP POLICY IF EXISTS "Anyone can view chit groups" ON public.chit_groups;
CREATE POLICY "Anyone can view chit groups"
  ON public.chit_groups FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- FIX 2: foreclosure_requests — Drop & recreate with ALL columns
-- ─────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.foreclosure_requests CASCADE;

CREATE TABLE public.foreclosure_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chit_member_id     UUID REFERENCES public.chit_members(id) ON DELETE CASCADE NOT NULL,
  reason             TEXT,
  outstanding_amount BIGINT DEFAULT 0,
  risk_score         INTEGER DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  penalty_rate       NUMERIC(5,2) DEFAULT 0,
  admin_notes        TEXT,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.foreclosure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access foreclosure_requests"
  ON public.foreclosure_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- FIX 3: auctions — Extended columns
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.auctions
ADD COLUMN IF NOT EXISTS auction_number  INTEGER,
ADD COLUMN IF NOT EXISTS prize_pool      BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_limit_mins INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS ended_at        TIMESTAMPTZ;

DROP POLICY IF EXISTS "Admin can insert auctions" ON public.auctions;
CREATE POLICY "Admin can insert auctions"
  ON public.auctions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can update auctions" ON public.auctions;
CREATE POLICY "Admin can update auctions"
  ON public.auctions FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can view all auctions" ON public.auctions;
CREATE POLICY "Admin can view all auctions"
  ON public.auctions FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- FIX 4: auction_bids — Add bidder_name, open read policy
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.auction_bids
ADD COLUMN IF NOT EXISTS bidder_name TEXT;

DROP POLICY IF EXISTS "Admin can view all bids" ON public.auction_bids;
CREATE POLICY "Admin can view all bids"
  ON public.auction_bids FOR SELECT
  USING (true);

-- ─────────────────────────────────────────────────────────────
-- FIX 5: auction_events table
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.auction_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id   UUID REFERENCES public.auctions(id) ON DELETE CASCADE NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('started','paused','resumed','winner_declared','cancelled')),
  performed_by TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auction_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access auction_events" ON public.auction_events;
CREATE POLICY "Admin full access auction_events"
  ON public.auction_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- FIX 6: v_upcoming_auctions view
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_upcoming_auctions AS
SELECT
  a.id,
  a.chit_group_id,
  cg.name            AS group_name,
  cg.group_code,
  a.auction_number,
  a.scheduled_at,
  a.status,
  a.min_bid,
  a.current_bid,
  a.prize_pool,
  a.time_limit_mins,
  cg.capacity,
  (SELECT COUNT(*) FROM public.chit_members cm WHERE cm.chit_group_id = cg.id) AS enrolled_members,
  (SELECT COUNT(*) FROM public.auction_bids ab WHERE ab.auction_id = a.id)     AS total_bids
FROM public.auctions a
LEFT JOIN public.chit_groups cg ON cg.id = a.chit_group_id;
