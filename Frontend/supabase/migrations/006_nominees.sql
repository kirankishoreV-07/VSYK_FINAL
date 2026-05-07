-- ============================================================
-- VSYK Chits — Migration 006: Nominees & Foreclosures
-- ============================================================

-- nominees: Manage legal heirs and beneficiaries for members
CREATE TABLE IF NOT EXISTS public.nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  date_of_birth DATE,
  allocation_percentage INTEGER DEFAULT 100 CHECK (allocation_percentage > 0 AND allocation_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- foreclosure_requests: Manage early exit requests
CREATE TABLE IF NOT EXISTS public.foreclosure_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  chit_member_id UUID REFERENCES public.chit_members(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  processing_fee_percentage NUMERIC(5,2) DEFAULT 2.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Configuration
ALTER TABLE public.nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foreclosure_requests ENABLE ROW LEVEL SECURITY;

-- Nominees: Users can view, insert, update, delete their own nominees
CREATE POLICY "Users can manage own nominees"
  ON public.nominees
  USING (auth.uid() = user_id);

-- Foreclosure Requests: Users can view and create their own requests
CREATE POLICY "Users can view own foreclosure requests"
  ON public.foreclosure_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own foreclosure requests"
  ON public.foreclosure_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_nominees_updated_at
BEFORE UPDATE ON public.nominees
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER trigger_update_foreclosures_updated_at
BEFORE UPDATE ON public.foreclosure_requests
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
