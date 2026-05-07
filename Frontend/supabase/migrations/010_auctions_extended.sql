-- ============================================================
-- 010_auctions_extended.sql
-- Extended schema for Auctions & Foreclosure Requests
-- ============================================================

-- 1. Ensure auction_bids has profile names accessible via join
-- (auction_bids already exists from 003_auctions.sql)

-- 2. Foreclosure / Exit Requests table
CREATE TABLE IF NOT EXISTS public.foreclosure_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chit_member_id UUID REFERENCES public.chit_members(id) ON DELETE CASCADE NOT NULL,
  reason         TEXT,
  outstanding_amount BIGINT DEFAULT 0, -- in paise
  risk_score     INTEGER DEFAULT 0,    -- 0-100; higher = more risk
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  penalty_rate   NUMERIC(5,2) DEFAULT 0,
  admin_notes    TEXT,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.foreclosure_requests ENABLE ROW LEVEL SECURITY;

-- Admin can do everything; users can only see their own request
CREATE POLICY "Admin full access foreclosure_requests"
  ON public.foreclosure_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Extend auctions table with admin-facing fields
ALTER TABLE public.auctions
ADD COLUMN IF NOT EXISTS auction_number   INTEGER,
ADD COLUMN IF NOT EXISTS chit_group_name  TEXT,
ADD COLUMN IF NOT EXISTS prize_pool       BIGINT DEFAULT 0, -- in paise
ADD COLUMN IF NOT EXISTS time_limit_mins  INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS ended_at         TIMESTAMPTZ;

-- 4. Add winner info & name to auction_bids
ALTER TABLE public.auction_bids
ADD COLUMN IF NOT EXISTS bidder_name TEXT;

-- 5. Audit log for foreman actions
CREATE TABLE IF NOT EXISTS public.auction_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id   UUID REFERENCES public.auctions(id) ON DELETE CASCADE NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('started','paused','resumed','winner_declared','cancelled')),
  performed_by TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auction_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access auction_events"
  ON public.auction_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Helpful view: upcoming auctions joined with group details
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
