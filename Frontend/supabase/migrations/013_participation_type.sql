-- ============================================================
-- 013_participation_type.sql
-- Add participation_type to chit_members: 'full' or 'half'
-- Half participation = member contributes 50% EMI, gets 50% of chit value
-- ============================================================

ALTER TABLE public.chit_members
ADD COLUMN IF NOT EXISTS participation_type TEXT NOT NULL DEFAULT 'full'
  CHECK (participation_type IN ('full', 'half'));

-- participation_share: numeric multiplier (1.0 = full, 0.5 = half)
ALTER TABLE public.chit_members
ADD COLUMN IF NOT EXISTS participation_share NUMERIC(3,2) NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN public.chit_members.participation_type IS
  'full = 1 full share; half = half share (50% EMI, 50% chit value)';

COMMENT ON COLUMN public.chit_members.participation_share IS
  '1.0 for full, 0.5 for half participation';
