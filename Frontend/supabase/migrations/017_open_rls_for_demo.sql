-- 017_open_rls_for_demo.sql
-- Open up RLS for payment_schedules and chit_member_transactions for the demo app

-- Payment Schedules
DROP POLICY IF EXISTS "Users can view their own payment schedules" ON public.payment_schedules;
DROP POLICY IF EXISTS "Users can update their own payment schedules" ON public.payment_schedules;

CREATE POLICY "Allow public all access to payment_schedules for demo"
  ON public.payment_schedules FOR ALL
  USING (true)
  WITH CHECK (true);

-- Chit Member Transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.chit_member_transactions;
DROP POLICY IF EXISTS "Admin can insert member transactions" ON public.chit_member_transactions;
DROP POLICY IF EXISTS "Admin can view all member transactions" ON public.chit_member_transactions;
DROP POLICY IF EXISTS "Admin can update member transactions" ON public.chit_member_transactions;
DROP POLICY IF EXISTS "Admin can delete member transactions" ON public.chit_member_transactions;

CREATE POLICY "Allow public all access to chit_member_transactions for demo"
  ON public.chit_member_transactions FOR ALL
  USING (true)
  WITH CHECK (true);
