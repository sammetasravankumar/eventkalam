
-- ============================================================
-- FIX 1: Infinite recursion in admin_select_all_users policy
-- The old policy queried the users table from within a users
-- SELECT policy, causing infinite recursion and silent failures.
-- Replace it with is_admin() SECURITY DEFINER function which
-- bypasses RLS and breaks the cycle.
-- ============================================================
DROP POLICY IF EXISTS "admin_select_all_users" ON public.users;
CREATE POLICY "admin_select_all_users" ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ============================================================
-- FIX 2: Revoke anon EXECUTE from trigger/internal functions
-- These were inadvertently callable via the REST API.
-- Trigger functions don't need to be callable by any role directly.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM authenticated;

-- Also revoke cancel_registration from anon (already done but re-confirm)
REVOKE EXECUTE ON FUNCTION public.cancel_registration(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

-- ============================================================
-- FIX 3: Ensure is_admin() has proper search_path (already set,
-- but reaffirm so it can safely bypass RLS on users table)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Re-grant only to authenticated
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
