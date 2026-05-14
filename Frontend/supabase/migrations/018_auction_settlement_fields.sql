-- ============================================================
-- 018_auction_settlement_fields.sql
-- Add settlement fields to auctions for admin-managed monthly outcomes
-- ============================================================

ALTER TABLE public.auctions
ADD COLUMN IF NOT EXISTS winner_member_id UUID REFERENCES public.chit_members(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS installment_due BIGINT DEFAULT 0, -- in paise
ADD COLUMN IF NOT EXISTS dividend_amount BIGINT DEFAULT 0,  -- in paise
ADD COLUMN IF NOT EXISTS discount_amount BIGINT DEFAULT 0,  -- in paise
ADD COLUMN IF NOT EXISTS final_due_amount BIGINT DEFAULT 0, -- in paise
ADD COLUMN IF NOT EXISTS winner_prize_amount BIGINT DEFAULT 0; -- in paise

CREATE INDEX IF NOT EXISTS idx_auctions_winner_member_id ON public.auctions(winner_member_id);
