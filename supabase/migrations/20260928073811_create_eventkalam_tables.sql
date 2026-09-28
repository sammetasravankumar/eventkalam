/*
# EventKalam: Create users and events tables with auth, RLS, and RPC functions

## Overview
Creates the two core tables for the EventKalam event platform:
1. `users` — stores profile info linked to Supabase Auth accounts, with a role column (user/admin)
2. `events` — stores event details with a JSONB `registrations` array holding all registration records

## Table 1: users
- `user_id` (uuid, PK, references auth.users on delete cascade) — the Supabase Auth user
- `name` (text) — full name
- `email` (text, unique) — email address
- `phone` (text) — phone number
- `role` (text, default 'user', check user|admin) — authorization role
- `created_at` (timestamptz, default now())

## Table 2: events
- `event_id` (uuid, PK, default gen_random_uuid())
- `title` (text, not null)
- `description` (text)
- `category` (text)
- `date` (date)
- `time` (text) — human-readable time range e.g. "10:00 AM - 1:00 PM"
- `venue` (text)
- `city` (text)
- `capacity` (int, default 0)
- `registered_count` (int, default 0) — total seats booked
- `price` (numeric, default 0)
- `image_url` (text)
- `status` (text, default 'draft', check draft|published|cancelled|completed)
- `registrations` (jsonb, default '[]') — array of registration objects
- `created_by` (uuid, references auth.users, nullable) — admin who created the event
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Registration object shape (inside events.registrations JSONB array)
Each element: { registration_id, user_id, user_name, user_email, phone, seats, total_amount, registration_date, registration_status }

## Security (RLS)
### users table
- Users can SELECT and UPDATE only their own row (cannot change role)
- Admins can SELECT all users
- INSERT only via trigger on auth signup (no direct client inserts)
- Role column protected by trigger: only admins can change role

### events table
- Everyone (anon + authenticated) can SELECT published events
- Only admins can INSERT, UPDATE, DELETE events
- Only admins can SELECT draft/cancelled/completed events

## Functions
- `is_admin()` — SECURITY DEFINER, returns true if auth.uid() has role 'admin'
- `register_for_event(p_event_id, p_seats, p_phone)` — SECURITY DEFINER, atomic registration with seat checking and duplicate prevention
- `cancel_registration(p_event_id)` — SECURITY DEFINER, removes a user's registration and decrements count
- `prevent_role_change()` — trigger function that blocks non-admin role updates

## Triggers
- `on_auth_user_created` — creates a users row with role 'user' when a new auth user signs up
- `guard_user_role` — prevents non-admins from changing the role column

## Seed data
- 6 sample published events with realistic content and images
*/

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text UNIQUE NOT NULL,
  phone text DEFAULT '',
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
DROP POLICY IF EXISTS "select_own_profile" ON users;
CREATE POLICY "select_own_profile" ON users
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all users
DROP POLICY IF EXISTS "admin_select_all_users" ON users;
CREATE POLICY "admin_select_all_users" ON users
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- Users can update their own row (name, phone only — role protected by trigger)
DROP POLICY IF EXISTS "update_own_profile" ON users;
CREATE POLICY "update_own_profile" ON users
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TABLE: events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  category text DEFAULT '',
  date date,
  time text DEFAULT '',
  venue text DEFAULT '',
  city text DEFAULT '',
  capacity integer NOT NULL DEFAULT 0,
  registered_count integer NOT NULL DEFAULT 0 CHECK (registered_count >= 0),
  price numeric NOT NULL DEFAULT 0,
  image_url text DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  registrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Everyone can read published events
DROP POLICY IF EXISTS "public_read_published_events" ON events;
CREATE POLICY "public_read_published_events" ON events
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- Admins can read all events
DROP POLICY IF EXISTS "admin_read_all_events" ON events;
CREATE POLICY "admin_read_all_events" ON events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- Only admins can insert events
DROP POLICY IF EXISTS "admin_insert_events" ON events;
CREATE POLICY "admin_insert_events" ON events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- Only admins can update events
DROP POLICY IF EXISTS "admin_update_events" ON events;
CREATE POLICY "admin_update_events" ON events
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- Only admins can delete events
DROP POLICY IF EXISTS "admin_delete_events" ON events;
CREATE POLICY "admin_delete_events" ON events
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.user_id = auth.uid() AND u.role = 'admin'));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- FUNCTION: is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- FUNCTION: register_for_event(p_event_id, p_seats, p_phone)
-- Atomic registration with seat checking and duplicate prevention
-- ============================================================
CREATE OR REPLACE FUNCTION register_for_event(
  p_event_id uuid,
  p_seats integer DEFAULT 1,
  p_phone text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_user users%ROWTYPE;
  v_existing jsonb;
  v_total_amount numeric;
  v_registration jsonb;
  v_reg_id uuid := gen_random_uuid();
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be signed in to register.');
  END IF;

  -- Load user
  SELECT * INTO v_user FROM users WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found.');
  END IF;

  -- Lock the event row
  SELECT * INTO v_event FROM events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found.');
  END IF;

  -- Event must be published
  IF v_event.status <> 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This event is not open for registration.');
  END IF;

  -- Check for duplicate registration
  SELECT elem FROM jsonb_array_elements(v_event.registrations) AS elem
  WHERE elem->>'user_id' = auth.uid()::text
    AND elem->>'registration_status' = 'registered'
  INTO v_existing;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already registered for this event.');
  END IF;

  -- Validate seats
  IF p_seats < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must register for at least one seat.');
  END IF;

  IF v_event.registered_count + p_seats > v_event.capacity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not enough seats available.');
  END IF;

  -- Calculate total
  v_total_amount := v_event.price * p_seats;

  -- Build registration object
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

  -- Update event: add registration and increment count
  UPDATE events
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

-- ============================================================
-- FUNCTION: cancel_registration(p_event_id)
-- Removes the user's active registration and decrements count
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_registration(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT * INTO v_event FROM events WHERE event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Event not found.');
  END IF;

  -- Find the user's active registration
  SELECT elem INTO v_reg
  FROM jsonb_array_elements(v_event.registrations) AS elem
  WHERE elem->>'user_id' = auth.uid()::text
    AND elem->>'registration_status' = 'registered';

  IF v_reg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active registration found.');
  END IF;

  v_seats := (v_reg->>'seats')::integer;

  -- Mark registration as cancelled (keep the record, change status)
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

  UPDATE events
  SET
    registrations = COALESCE(v_new_regs, '[]'::jsonb),
    registered_count = GREATEST(v_event.registered_count - v_seats, 0),
    updated_at = now()
  WHERE event_id = p_event_id;

  RETURN jsonb_build_object('success', true, 'message', 'Registration cancelled.');
END;
$$;

-- ============================================================
-- TRIGGER: Create profile on auth signup (role always 'user')
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO users (user_id, name, email, phone, role)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: Prevent non-admins from changing role
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM users WHERE user_id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin AND NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'You are not authorized to change user roles.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_role ON users;
CREATE TRIGGER guard_user_role
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_role_change();

-- ============================================================
-- TRIGGER: Update updated_at on events
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS events_updated_at ON events;
CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DATA: 6 published events
-- ============================================================
INSERT INTO events (title, description, category, date, time, venue, city, capacity, registered_count, price, image_url, status, registrations)
VALUES
  (
    'Spark Robotics Workshop',
    'Build, code and create your first smart invention in a hands-on lab. No prior experience needed — just bring your curiosity.',
    'Workshop',
    '2026-07-12',
    '10:30 AM - 12:30 PM',
    'Roboshoppy',
    'Warangal',
    40, 22, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_10.40.16_AM_(1).jpeg',
    'published',
    '[]'
  ),
  (
    'AI for All: Future Skills Lab',
    'A practical introduction to the tools shaping the next generation of work. Explore AI fundamentals with live demos.',
    'Seminar',
    '2026-07-18',
    '10:00 AM - 1:00 PM',
    'EventKalam Studio',
    'Warangal',
    120, 48, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_11.29.33_AM.jpeg',
    'published',
    '[]'
  ),
  (
    'Campus Makers Meetup',
    'Meet curious builders, share your ideas and find your next collaborator. Open to all students and recent graduates.',
    'Community',
    '2026-07-26',
    '4:00 PM - 6:30 PM',
    'Kakatiya University',
    'Warangal',
    60, 49, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_10.45.09_AM.jpeg',
    'published',
    '[]'
  ),
  (
    'Design Your Direction',
    'A focused session on portfolios, confidence and finding meaningful work. Perfect for final-year students and recent graduates.',
    'Career',
    '2026-08-03',
    '2:00 PM - 4:00 PM',
    'Online session',
    'Online',
    150, 56, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_11.29.33_AM.jpeg',
    'published',
    '[]'
  ),
  (
    'Graduate Connect 2026',
    'A warm, useful afternoon for recent graduates and growing teams. Network, learn and discover your next opportunity.',
    'Networking',
    '2026-08-14',
    '11:00 AM - 3:00 PM',
    'Warangal Convention Hall',
    'Warangal',
    100, 72, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_10.45.09_AM.jpeg',
    'published',
    '[]'
  ),
  (
    'The Culture Collective',
    'Music, movement and stories from the people who make our campus vibrant. Celebrate creativity and community.',
    'Cultural',
    '2026-08-22',
    '5:30 PM - 8:00 PM',
    'Kakatiya Open Grounds',
    'Warangal',
    200, 60, 0,
    '/assets/images/events/WhatsApp_Image_2026-09-28_at_10.40.16_AM_(1).jpeg',
    'published',
    '[]'
  )
ON CONFLICT DO NOTHING;
