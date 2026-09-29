-- Promote the first user to admin role
-- The prevent_role_change trigger blocks normal updates, so we disable it temporarily
ALTER TABLE public.users DISABLE TRIGGER guard_user_role;

UPDATE public.users SET role = 'admin' WHERE email = 'robokalamsravan78@gmail.com';

ALTER TABLE public.users ENABLE TRIGGER guard_user_role;
