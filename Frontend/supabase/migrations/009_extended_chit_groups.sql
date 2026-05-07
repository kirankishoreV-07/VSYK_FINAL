-- Add extended business and regulatory fields to the existing chit_groups table

ALTER TABLE public.chit_groups
ADD COLUMN IF NOT EXISTS group_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS agent_in_charge TEXT,
ADD COLUMN IF NOT EXISTS foreman_name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,

-- Regulatory & Dates
ADD COLUMN IF NOT EXISTS agr_number TEXT,
ADD COLUMN IF NOT EXISTS agr_date DATE,
ADD COLUMN IF NOT EXISTS pso_number TEXT,
ADD COLUMN IF NOT EXISTS pso_date DATE,
ADD COLUMN IF NOT EXISTS fd_number TEXT,
ADD COLUMN IF NOT EXISTS fd_date DATE,
ADD COLUMN IF NOT EXISTS cdra_number TEXT,
ADD COLUMN IF NOT EXISTS fd_closing_date DATE,
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS end_date DATE,
ADD COLUMN IF NOT EXISTS bank_name TEXT,

-- Financials
ADD COLUMN IF NOT EXISTS deposited_amount BIGINT DEFAULT 0, -- in paise
ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS no_of_installments INTEGER,
ADD COLUMN IF NOT EXISTS emi_amount BIGINT, -- in paise
ADD COLUMN IF NOT EXISTS agent_commission_rate NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS foreman_commission_amount BIGINT, -- in paise
ADD COLUMN IF NOT EXISTS frequency TEXT DEFAULT 'Monthly',

-- Auction & Terms
ADD COLUMN IF NOT EXISTS bidding_day TEXT,
ADD COLUMN IF NOT EXISTS bidding_time TEXT,
ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
