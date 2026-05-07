-- ============================================================
-- VSYK Chits — Migration 003: Auctions & Reminders
-- ============================================================

-- auctions: Each live or upcoming auction for a chit group
CREATE TABLE IF NOT EXISTS public.auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chit_group_id UUID REFERENCES public.chit_groups(id) ON DELETE CASCADE NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
  min_bid BIGINT DEFAULT 0,             -- minimum bid in paise
  current_bid BIGINT DEFAULT 0,         -- current highest bid in paise
  winner_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view auctions
CREATE POLICY "Authenticated users can view auctions"
  ON public.auctions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────

-- auction_bids: Each bid placed by a user in an auction
CREATE TABLE IF NOT EXISTS public.auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID REFERENCES public.auctions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bid_amount BIGINT NOT NULL,           -- in paise
  placed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.auction_bids ENABLE ROW LEVEL SECURITY;

-- Users can view all bids (for the activity feed)
CREATE POLICY "Authenticated users can view bids"
  ON public.auction_bids FOR SELECT
  USING (auth.role() = 'authenticated');

-- Users can only place bids as themselves
CREATE POLICY "Users can place their own bids"
  ON public.auction_bids FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────

-- auction_reminders: User sets a reminder for an upcoming auction
CREATE TABLE IF NOT EXISTS public.auction_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID REFERENCES public.auctions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auction_id, user_id)
);

ALTER TABLE public.auction_reminders ENABLE ROW LEVEL SECURITY;

-- Users can view their own reminders
CREATE POLICY "Users can view their own reminders"
  ON public.auction_reminders FOR SELECT
  USING (auth.uid() = user_id);

-- Users can set reminders for themselves
CREATE POLICY "Users can insert their own reminders"
  ON public.auction_reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete (cancel) their own reminders
CREATE POLICY "Users can delete their own reminders"
  ON public.auction_reminders FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auctions_group_id ON public.auctions(chit_group_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON public.auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_scheduled_at ON public.auctions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON public.auction_bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_reminders_user ON public.auction_reminders(user_id);
