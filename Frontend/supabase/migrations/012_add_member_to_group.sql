-- ============================================================
-- 012_add_member_to_group.sql
-- Allows admin to add existing customers as chit group members
-- ============================================================

-- 1. RLS fix: Admin must be able to INSERT into chit_members
--    (002_chit_groups.sql only allowed users to join for themselves)

DROP POLICY IF EXISTS "Admin can insert chit members" ON public.chit_members;
CREATE POLICY "Admin can insert chit members"
  ON public.chit_members FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can view all chit members" ON public.chit_members;
CREATE POLICY "Admin can view all chit members"
  ON public.chit_members FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admin can update chit members" ON public.chit_members;
CREATE POLICY "Admin can update chit members"
  ON public.chit_members FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin can delete chit members" ON public.chit_members;
CREATE POLICY "Admin can delete chit members"
  ON public.chit_members FOR DELETE
  USING (true);

-- 2. Add ticket_number to chit_members for sequential member numbering within a group
ALTER TABLE public.chit_members
ADD COLUMN IF NOT EXISTS ticket_number INTEGER,
ADD COLUMN IF NOT EXISTS customer_id   UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- Auto-generate ticket number per group on insert
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(ticket_number), 0) + 1
  INTO NEW.ticket_number
  FROM public.chit_members
  WHERE chit_group_id = NEW.chit_group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_ticket ON public.chit_members;
CREATE TRIGGER trg_assign_ticket
BEFORE INSERT ON public.chit_members
FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();
