import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/components/marketing/config";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy | Landscapt & Equipt",
  description: "How Landscapt & Equipt collects, uses, and protects information on the software platform.",
  path: "/legal/privacy",
});

export default function PlatformPrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: September 1, 2026</p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          This Privacy Policy explains how Landscapt (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
          handles information in connection with the Landscapt and Equipt software platform (the
          &quot;Service&quot;) and this website. It applies to visitors of this site and to organizations and
          users who create an account (&quot;Customer,&quot; &quot;you&quot;). It does not apply to the
          separate SMS/text-messaging privacy notices posted by individual businesses that use the Service to
          communicate with their own clients — that use of your data is governed by that business&apos;s own
          privacy policy.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">1. Two Kinds of Data</h2>
        <p>
          <strong>Account data</strong> is information about you and your organization that we collect
          directly — name, work email, company name, billing details, and support communications.
        </p>
        <p>
          <strong>Customer Data</strong> is the information your organization enters into the Service to run
          your business — for example your clients&apos; names and contact details, job and property
          information, employee records, assets, and financial records. For Customer Data, your organization
          is the data controller and we act as a data processor, handling it only as instructed by you and as
          described in our{" "}
          <a href="/legal/dpa" className="text-brand-600 underline">
            Data Processing Addendum
          </a>
          .
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">2. Information We Collect</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Account and billing information you provide when you sign up or manage your subscription;</li>
          <li>Customer Data you or your users submit while using the Service;</li>
          <li>Usage data such as log files, device/browser information, and in-app activity, used to operate and improve the Service;</li>
          <li>Communications you send us, such as support requests.</li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">3. How We Use Information</h2>
        <p>We use information to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Provide, maintain, and secure the Service;</li>
          <li>Process payments and manage subscriptions;</li>
          <li>Respond to support requests and communicate about the Service;</li>
          <li>Monitor for fraud, abuse, and security incidents;</li>
          <li>Improve and develop new features, using aggregated or de-identified data where practical.</li>
        </ul>
        <p>We do not sell personal information.</p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">4. Sub-Processors &amp; Third-Party Providers</h2>
        <p>
          We use trusted infrastructure and service providers to operate the platform, including Supabase
          (database, authentication, and file storage), Vercel (application hosting), Stripe (payment
          processing), and Twilio (transactional SMS). If you connect optional integrations — QuickBooks,
          Zapier, Google Maps, or Samsara — those providers process data on your instruction and under their
          own terms. A current sub-processor list is available on request at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">5. Data Security</h2>
        <p>
          Customer Data is stored in a database with row-level security scoped to your organization, and
          access to production systems is restricted to personnel who need it to operate the Service. No
          method of transmission or storage is completely secure, and we cannot guarantee absolute security.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">6. Data Retention &amp; Deletion</h2>
        <p>
          We retain account and Customer Data for as long as your account is active, and for a reasonable
          period afterward to comply with legal obligations, resolve disputes, and enforce our agreements. You
          may request deletion of your organization&apos;s data by contacting us; some information may be
          retained where required by law.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">7. Your Rights</h2>
        <p>
          Depending on your location, you may have rights to access, correct, or delete personal information
          we hold about you, or to object to certain processing. If you are an end customer of a business that
          uses the Service (not a Landscapt account holder yourself), please direct requests about your data
          to that business directly, as they control how your information is used. Account holders can reach
          us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">8. Children&apos;s Privacy</h2>
        <p>
          The Service is intended for business use and is not directed to children. We do not knowingly
          collect personal information from children under 13.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">9. International Transfers</h2>
        <p>
          We and our service providers may process data in the United States and other countries. Where
          required, we rely on appropriate safeguards for cross-border transfers of personal information.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">10. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes will be communicated via the
          Service or by email before they take effect.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">11. Contact</h2>
        <p>
          Questions about this policy? Contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
