-- ============================================================
-- FIX: EventKalam signup trigger + SECURITY DEFINER search_path
-- ============================================================
-- Root cause of "Database error saving new user":
-- 1. The on_auth_user_created trigger was not properly created on auth.users
-- 2. SECURITY DEFINER functions lack SET search_path, causing runtime failures
-- This migration fixes both issues without touching existing data.
-- ============================================================

-- Drop broken/missing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate handle_new_user with proper search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (user_id, name, email, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'user'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate the trigger properly
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fix prevent_role_change with proper search_path
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin AND NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'You are not authorized to change user roles.';
  END IF;
  RETURN NEW;
END;
$$;

-- Fix is_admin with proper search_path
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

-- Fix register_for_event with proper search_path
CREATE OR REPLACE FUNCTION public.register_for_event(
  p_event_id uuid,
  p_seats integer DEFAULT 1,
  p_phone text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_user users%ROWTYPE;
  v_existing jsonb;
  v_total_amount numeric;
  v_registration jsonb;
  v_reg_id uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to register.');
  END IF;

  SELECT * INTO v_user FROM public.users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found.');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found.');
  END IF;

  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not open for registration.');
  END IF;

  SELECT elem INTO v_existing
  FROM jsonb_array_elements(v_event.registrations) AS elem
  WHERE elem->>'user_id' = auth.uid()::text
    AND elem->>'registration_status' = 'registered';

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this event.');
  END IF;

  IF p_seats < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must register for at least one seat.');
  END IF;

  IF v_event.registered_count + p_seats > v_event.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough seats available.');
  END IF;

  v_total_amount := v_event.price * p_seats;

  v_registration := jsonb_build_object(
    'registration_id', v_reg_id,
    'user_id', auth.uid()::text,
    'user_name', v_user.name,
    'user_email', v_user.email,
    'phone', COALESCE(p_phone, v_user.phone),
    'seats', p_seats,
    'total_amount', v_total_amount,
    'registration_date', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'registration_status', 'registered'
  );

  UPDATE public.events
  SET
    registrations = v_event.registrations || jsonb_build_array(v_registration),
    registered_count = v_event.registered_count + p_seats,
    updated_at = now()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_reg_id::text,
    'event_id', p_event_id::text,
    'seats', p_seats,
    'total_amount', v_total_amount,
    'message', 'Registration confirmed.'
  );
END;
$$;

-- Fix cancel_registration with proper search_path
CREATE OR REPLACE FUNCTION public.cancel_registration(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_reg jsonb;
  v_seats integer;
  v_new_regs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in.');
  END IF;

  SELECT * INTO v_event FROM public.events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found.');
  END IF;

  SELECT elem INTO v_reg
  FROM jsonb_array_elements(v_event.registrations) AS elem
  WHERE elem->>'user_id' = auth.uid()::text
    AND elem->>'registration_status' = 'registered';

  IF v_reg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active registration found.');
  END IF;

  v_seats := (v_reg->>'seats')::integer;

  v_new_regs := (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'registration_id' = v_reg->>'registration_id'
        THEN jsonb_set(elem, '{registration_status}', '"cancelled"')
        ELSE elem
      END
    )
    FROM jsonb_array_elements(v_event.registrations) AS elem
  );

  UPDATE public.events
  SET
    registrations = COALESCE(v_new_regs, '[]'::jsonb),
    registered_count = GREATEST(v_event.registered_count - v_seats, 0),
    updated_at = now()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'message', 'Registration cancelled.');
END;
$$;

-- Add updated_at column to users table if missing
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Re-grant necessary table privileges (ensure anon can read published events)
GRANT SELECT ON public.events TO anon;
GRANT SELECT ON public.events TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- Ensure EXECUTE on functions is available to authenticated
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_event(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_registration(uuid) TO authenticated;
