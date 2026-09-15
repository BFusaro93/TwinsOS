-- Beta feedback widget: lets any authenticated user submit a quick bug/idea
-- report from a floating button or Settings. No review UI yet — admins read
-- submissions straight from the Supabase Table Editor.

CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT my_org_id() REFERENCES organizations(id),
  created_by uuid REFERENCES profiles(id),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('bug', 'idea', 'other')),
  message text NOT NULL,
  page_url text,
  user_agent text,
  screenshot_path text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Single org-scoped policy for all commands, same pattern as every other
-- table in this codebase (e.g. crm_automations). A second, INSERT-only
-- policy that also checked created_by = auth.uid() was tried first, but
-- Postgres OR's multiple permissive policies together — since this policy
-- alone already satisfies INSERT via org_id, the extra check never actually
-- constrained anything. created_by is set by the app for attribution only.
CREATE POLICY "org isolation" ON feedback
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));

-- Screenshot storage. Path convention: {org_id}/{timestamp}-{random}.{ext},
-- consistent with the other org-scoped buckets (client-files, thumbnails).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "org_members_upload_feedback_screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "org_members_read_feedback_screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-screenshots'
  AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())
);
