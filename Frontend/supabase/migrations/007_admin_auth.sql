-- ============================================================
-- VSYK Chits — Migration 007: Admin Authentication
-- ============================================================
-- Creates an admin_users table to store specific username
-- and password credentials for the admin portal.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default admin credentials
INSERT INTO public.admin_users (username, password) 
VALUES ('vsyk2026', 'vsyk@2026')
ON CONFLICT (username) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access for authentication checks
-- Since this is for a demo, we allow anyone to read this table to verify credentials
-- In a real production app, this would be handled server-side securely.
CREATE POLICY "Allow public read access to verify admin credentials"
  ON public.admin_users
  FOR SELECT
  USING (true);
