-- Fix remaining security advisor warnings

-- 1. Add search_path to update_updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2. Revoke EXECUTE from anon for SECURITY DEFINER functions
-- These should only be callable by authenticated users
REVOKE EXECUTE ON FUNCTION public.cancel_registration(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.register_for_event(uuid, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
