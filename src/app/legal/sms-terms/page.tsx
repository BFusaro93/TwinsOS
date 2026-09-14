import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "SMS Terms & Conditions | Twins Lawn Service",
  description: "Terms and conditions for the Twins Lawn Service text messaging program.",
  path: "/legal/sms-terms",
});

export default function SmsTermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">SMS Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: August 15, 2026</p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          Twins Lawn Service&apos;s text messaging program (the &quot;Program&quot;) allows clients who have
          opted in to receive text messages related to their lawn and landscaping service, including
          appointment reminders, job status updates, and account notifications.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Consent</h2>
        <p>
          By providing your mobile phone number and opting in (verbally, in writing, or through an online
          form), you consent to receive text messages from Twins Lawn Service related to your service
          account. Consent is not a condition of purchasing any goods or services.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Message Frequency</h2>
        <p>
          Message frequency varies depending on your scheduled services and account activity. You may
          receive messages such as appointment reminders, crew arrival notifications, or invoice alerts.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Message and Data Rates</h2>
        <p>Message and data rates may apply. Contact your wireless carrier for details on your plan.</p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">How to Opt Out</h2>
        <p>
          You can cancel the Program at any time. Reply <strong>STOP</strong> to any text message from us to
          opt out. After you send the message <strong>STOP</strong>, we will send you a message confirming
          that you have been unsubscribed. After this, you will no longer receive text messages from us. If
          you want to rejoin, contact your account representative and we will re-enroll your number.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Help</h2>
        <p>
          Reply <strong>HELP</strong> to any message for help, or contact us through your account
          representative or the contact information on your invoice or service agreement.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Carriers</h2>
        <p>
          Carriers are not liable for delayed or undelivered messages. Not all mobile devices or carriers may
          be supported.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Privacy</h2>
        <p>
          Your mobile phone number and text messaging opt-in data will not be shared with third parties for
          marketing or promotional purposes. See our{" "}
          <a href="/legal/privacy-policy" className="text-brand-600 underline">
            Privacy Policy
          </a>{" "}
          for more information on how we handle your data.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">Changes to This Program</h2>
        <p>
          We may modify or terminate the Program at any time. Continued use of the Program after changes are
          posted constitutes acceptance of those changes.
        </p>
      </section>
    </main>
  );
}
