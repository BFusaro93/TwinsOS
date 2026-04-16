/**
 * POST /api/auth/reset-password
 *
 * Generates a password-reset link via Supabase Admin (no email sent by
 * Supabase) and delivers it through Resend's HTTP API, bypassing
 * Supabase's email rate limits entirely.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://twins-os.vercel.app";
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (linkErr || !linkData) {
    console.error("generateLink error:", linkErr);
    // Return success regardless — don't expose whether an email exists
    return NextResponse.json({ success: true });
  }

  const hashedToken = linkData.properties?.hashed_token;
  const resetUrl = hashedToken
    ? `${siteUrl}/reset-password?token_hash=${hashedToken}&type=recovery`
    : linkData.properties?.action_link ?? "";

  const resend = new Resend(process.env.RESEND_API_KEY!);
  await resend.emails.send({
    from: "Twins Lawn Service <noreply@twinslawnservice.com>",
    to: email,
    subject: "Reset your Equipt password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Reset your password</h2>
        <p style="margin:0 0 24px;color:#475569">Click the button below to set a new password for your Equipt account.</p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Reset Password</a>
        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });

  // Always return success — don't reveal whether the email exists
  return NextResponse.json({ success: true });
}
