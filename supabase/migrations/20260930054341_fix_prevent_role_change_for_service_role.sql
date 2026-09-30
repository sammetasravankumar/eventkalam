/*
# Allow service_role to bypass prevent_role_change trigger

The prevent_role_change trigger blocks non-admins from changing the role column.
However, it also blocks the service_role (used by edge functions) because
auth.uid() returns the service role's UUID, which isn't in the users table as admin.

This migration updates the trigger function to also allow changes when the caller
is the service_role (checked via auth.jwt() ->> 'role').
*/

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_is_service_role boolean;
BEGIN
  v_is_service_role := coalesce(auth.jwt() ->> 'role', '') = 'service_role';

  IF v_is_service_role THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin AND NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'You are not authorized to change user roles.';
  END IF;

  RETURN NEW;
END;
$$;
