# Supabase Deployment Checklist

Steps required after the first `supabase db push` to a new environment (staging or production). These are one-time ops commands — none of them belong in migration files because they contain secrets or are environment-specific.

---

## 1. Apply all migrations

```bash
npx supabase db push
```

---

## 2. Deploy the Edge Function

```bash
npx supabase functions deploy send-approval-email
```

The function lives at `supabase/functions/send-approval-email/index.ts`. It expects three environment secrets (set in step 3).

---

## 3. Set Edge Function secrets

```bash
npx supabase secrets set \
  RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxx" \
  FROM_EMAIL="noreply@yourdomain.com" \
  SUPABASE_URL="https://<PROJECT_REF>.supabase.co"
```

Get your `RESEND_API_KEY` from [resend.com](https://resend.com). `FROM_EMAIL` must be a verified sender domain in Resend.

---

## 4. Configure Postgres settings for the approval email trigger

The `fn_notify_approval_email` trigger reads two Postgres settings at runtime. Connect to the database (Supabase SQL editor or `psql`) and run:

```sql
ALTER DATABASE postgres
  SET app.edge_function_base_url = 'https://<PROJECT_REF>.supabase.co/functions/v1';

ALTER DATABASE postgres
  SET app.service_role_key = '<SERVICE_ROLE_KEY>';
```

Replace `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` with your project's values from the Supabase dashboard → Settings → API.

> **Never commit these values to source control.** The trigger silently skips the HTTP call when either setting is absent, so local dev without a Resend account works safely.

---

## 5. Regenerate TypeScript types after any schema change

```bash
npx supabase gen types --local > src/types/supabase.ts
# or for remote:
npx supabase gen types --project-id <PROJECT_REF> > src/types/supabase.ts
```

Commit the updated `src/types/supabase.ts`.

---

## 6. Verify RLS is enabled on all tables

Every table has RLS enabled in the initial migration. If you add a new table via the Supabase dashboard rather than a migration file, run:

```sql
ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
```

and add the appropriate policies before any application code queries it.

---

## Environment summary

| Setting | Where to set |
|---|---|
| `RESEND_API_KEY` | `supabase secrets set` |
| `FROM_EMAIL` | `supabase secrets set` |
| `SUPABASE_URL` | `supabase secrets set` |
| `app.edge_function_base_url` | `ALTER DATABASE` (SQL) |
| `app.service_role_key` | `ALTER DATABASE` (SQL) |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env vars |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env vars |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env vars (server-side only) |
