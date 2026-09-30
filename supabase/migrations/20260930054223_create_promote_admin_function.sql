/*
# Create promote_to_admin function

1. New Functions
- `promote_to_admin(p_user_id uuid)` — SECURITY DEFINER function that sets a user's role to 'admin'.
  This bypasses the prevent_role_change trigger because SECURITY DEFINER functions run with the
  function owner's privileges, not the caller's.
2. Security
- The function is callable only by the service role (via edge functions), not by regular users.
- It uses SET search_path = public for security.
*/

CREATE OR REPLACE FUNCTION public.promote_to_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET role = 'admin' WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_admin(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_to_admin(uuid) TO service_role;
