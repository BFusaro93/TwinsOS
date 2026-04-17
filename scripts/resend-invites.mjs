/**
 * One-off script to resend invite emails to users stuck in "invited" status.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> RESEND_API_KEY=<key> node scripts/resend-invites.mjs
 *
 * Get the keys from:
 *   - Service Role Key: Vercel dashboard → TwinsOS project → Settings → Environment Variables
 *                       (or Supabase dashboard → Project Settings → API)
 *   - Resend API Key:   Vercel dashboard → TwinsOS project → Settings → Environment Variables
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mhphatxiqxbscivffejl.supabase.co";
const SITE_URL = "https://twins-os.vercel.app";

// Strip literal \n sequences that `vercel env pull` embeds inside quoted values
function cleanKey(val) {
  return (val ?? "").replace(/\\n/g, "").trim();
}

const SERVICE_ROLE_KEY = cleanKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
const RESEND_API_KEY = cleanKey(process.env.RESEND_API_KEY);

if (!SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error("❌  Missing env vars. Run as:");
  console.error("   SUPABASE_SERVICE_ROLE_KEY=<key> RESEND_API_KEY=<key> node scripts/resend-invites.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Users to re-invite (from profiles table)
const USERS = [
  { name: "Pam Fusaro",     email: "pamfusaro@twinslawnservice.com",   role: "manager" },
  { name: "Mike Fusaro",    email: "mikefusaro@twinslawnservice.com",  role: "admin"   },
  { name: "Mike Fusaro Sr.", email: "mfusaro@twinslawnservice.com",    role: "manager" },
  { name: "Casey Kleinman", email: "caseykleinman@twinslawnservice.com", role: "manager" },
];

async function sendInvite({ name, email, role }) {
  console.log(`\n→ Processing ${name} <${email}>...`);

  // Try invite first; fall back to recovery if auth record already exists
  let linkData;
  let linkType = "invite";

  const firstTry = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name, role } },
  });

  if (firstTry.error) {
    const msg = firstTry.error.message ?? "";
    if (msg.toLowerCase().includes("already been registered") || msg.toLowerCase().includes("already registered")) {
      linkType = "recovery";
      const secondTry = await supabase.auth.admin.generateLink({ type: "recovery", email });
      if (secondTry.error || !secondTry.data) {
        console.error(`  ❌ generateLink (recovery) failed: ${secondTry.error?.message}`);
        return false;
      }
      linkData = secondTry.data;
    } else {
      console.error(`  ❌ generateLink (invite) failed: ${firstTry.error.message}`);
      return false;
    }
  } else {
    linkData = firstTry.data;
  }

  const hashedToken = linkData.properties?.hashed_token;
  const inviteUrl = hashedToken
    ? `${SITE_URL}/reset-password?token_hash=${hashedToken}&type=${linkType}`
    : linkData.properties?.action_link ?? "";

  if (!inviteUrl) {
    console.error(`  ❌ Could not build invite URL`);
    return false;
  }

  // Send via Resend
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Twins Lawn Service <noreply@twinslawnservice.com>",
      to: email,
      subject: "Your Equipt account invitation (new link)",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">You've been invited to Equipt</h2>
          <p style="margin:0 0 24px;color:#475569">Hi ${name}, here is a fresh link to set your password and activate your <strong>${role}</strong> account. Your previous link expired.</p>
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Set Your Password</a>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">This link expires in 24 hours. If you weren't expecting this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  ❌ Resend failed (${res.status}): ${body}`);
    return false;
  }

  console.log(`  ✅ Invite sent (type: ${linkType})`);
  return true;
}

let ok = 0, fail = 0;
for (const user of USERS) {
  const success = await sendInvite(user);
  success ? ok++ : fail++;
}

console.log(`\nDone: ${ok} sent, ${fail} failed.`);
