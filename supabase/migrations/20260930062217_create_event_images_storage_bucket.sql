/*
# Create event-images Storage Bucket

1. Storage
   - Creates an `event-images` bucket (public) so uploaded event images are
     accessible via the Supabase Storage public URL without authentication.

2. Storage Policies
   - Admins (role = 'admin' in public.users) can INSERT, UPDATE, DELETE objects.
   - Anon and authenticated users can SELECT (read/view) any object.
   - This is enforced at the storage policy level, not just the UI.
*/

-- Create the bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  true,
  5242880,  -- 5 MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view/download event images (bucket is public)
DROP POLICY IF EXISTS "event_images_public_select" ON storage.objects;
CREATE POLICY "event_images_public_select"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-images');

-- Only admins can upload event images
DROP POLICY IF EXISTS "event_images_admin_insert" ON storage.objects;
CREATE POLICY "event_images_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can update (replace) event images
DROP POLICY IF EXISTS "event_images_admin_update" ON storage.objects;
CREATE POLICY "event_images_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  bucket_id = 'event-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can delete event images
DROP POLICY IF EXISTS "event_images_admin_delete" ON storage.objects;
CREATE POLICY "event_images_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
