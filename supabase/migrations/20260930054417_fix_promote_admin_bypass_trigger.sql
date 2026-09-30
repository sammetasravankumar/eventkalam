/*
# Fix promote_to_admin to bypass trigger internally

The prevent_role_change trigger fires even inside the SECURITY DEFINER function.
Instead of relying on JWT detection in the trigger, the function now temporarily
disables the trigger, performs the update, and re-enables it. This is safe because
the function is only callable by the service_role.
*/

CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Temporarily disable the role-change guard so we can set admin role
  ALTER TABLE public.users DISABLE TRIGGER guard_user_role;
  UPDATE public.users SET role = 'admin' WHERE user_id = p_user_id;
  ALTER TABLE public.users ENABLE TRIGGER guard_user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_admin(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(uuid) TO service_role;
