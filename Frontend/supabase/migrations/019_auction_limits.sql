-- ============================================================
-- 019_auction_limits.sql
-- Add bid limits and close time to auctions, plus participants
-- ============================================================

ALTER TABLE public.auctions
ADD COLUMN IF NOT EXISTS max_bid BIGINT DEFAULT 0, -- in paise
ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.auction_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID REFERENCES public.auctions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auction_id, user_id)
);

ALTER TABLE public.auction_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own auction joins"
  ON public.auction_participants FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can join auctions"
  ON public.auction_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave auctions"
  ON public.auction_participants FOR DELETE
  USING (auth.uid() = user_id);
