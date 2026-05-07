-- ============================================================
-- VSYK Chits — Migration 008: Customers
-- ============================================================
-- Creates a dedicated customers table for the Admin CRM.
-- Customers can be created by Admins before the user actually
-- logs into the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT UNIQUE NOT NULL, -- Auto-generated like VS-9921
  customer_type TEXT NOT NULL CHECK (customer_type IN ('Individual', 'Company')),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  age INTEGER,
  gender TEXT,
  gstin_number TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  aadhar_number TEXT,
  pan_number TEXT,
  notes TEXT,
  kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to generate customer_id
CREATE OR REPLACE FUNCTION public.generate_customer_id()
RETURNS TRIGGER AS $$
DECLARE
  next_val INTEGER;
  new_id TEXT;
BEGIN
  -- Get count to generate a simple sequential ID for demo purposes
  -- In production, a sequence should be used.
  SELECT COUNT(*) INTO next_val FROM public.customers;
  new_id := 'VS-' || lpad((next_val + 1000)::text, 4, '0');
  
  -- Ensure uniqueness
  WHILE EXISTS (SELECT 1 FROM public.customers WHERE customer_id = new_id) LOOP
    next_val := next_val + 1;
    new_id := 'VS-' || lpad((next_val + 1000)::text, 4, '0');
  END LOOP;

  NEW.customer_id := new_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_customer_id
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  WHEN (NEW.customer_id IS NULL)
  EXECUTE FUNCTION public.generate_customer_id();

-- Enable Row Level Security
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Policy: For demo purposes, we'll allow all operations so the admin frontend can work seamlessly
CREATE POLICY "Allow public all access to customers for demo"
  ON public.customers
  FOR ALL
  USING (true)
  WITH CHECK (true);
