import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/components/marketing/config";

export const metadata: Metadata = buildMetadata({
  title: "Terms of Service | Landscapt & Equipt",
  description: "The terms governing use of the Landscapt & Equipt platform.",
  path: "/legal/terms",
});

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: September 1, 2026</p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern access to and use of the Landscapt and Equipt
          software platform (the &quot;Service&quot;), operated by Landscapt (&quot;Landscapt,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an account or otherwise using the
          Service, you agree to these Terms on behalf of yourself and, if applicable, the organization you
          represent (&quot;Customer,&quot; &quot;you&quot;).
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">1. The Service</h2>
        <p>
          Landscapt is a CRM / field service management product; Equipt is a computerized maintenance
          management (CMMS) product covering asset maintenance and purchasing. Both are provided under one
          account as a hosted, subscription software-as-a-service platform. We may add, change, or remove
          features from time to time.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">2. Accounts</h2>
        <p>
          You must provide accurate information when creating an account and keep your login credentials
          confidential. You are responsible for all activity that occurs under your organization&apos;s
          account, including actions taken by users you invite. Notify us promptly at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>{" "}
          of any unauthorized use.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">3. Subscriptions, Fees &amp; Billing</h2>
        <p>
          Paid plans are billed in advance on a recurring basis (monthly or annually, as selected) through
          our payment processor. Fees are non-refundable except where required by law or expressly stated
          otherwise. Subscriptions renew automatically until cancelled. You may cancel at any time from
          Settings; cancellation takes effect at the end of the current billing period. We may suspend or
          terminate access for accounts with a failed or overdue payment after reasonable notice.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">4. Your Data</h2>
        <p>
          As between you and us, you own all data, content, and materials you or your users submit to the
          Service (&quot;Customer Data&quot;), including information about your clients, employees, assets,
          and jobs. You grant us a limited license to host, process, and display Customer Data solely to
          provide, maintain, and support the Service. You are responsible for the accuracy of Customer Data
          and for having the necessary rights and consents to submit it, including consents from your own
          clients or employees where required by law.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Use the Service for any unlawful purpose or in violation of any applicable regulation;</li>
          <li>Attempt to gain unauthorized access to the Service, other accounts, or underlying infrastructure;</li>
          <li>Interfere with or disrupt the integrity or performance of the Service;</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of the Service, except as permitted by law;</li>
          <li>Use the Service to send unsolicited communications in violation of applicable law (e.g. TCPA, CAN-SPAM).</li>
        </ul>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">6. Third-Party Integrations</h2>
        <p>
          The Service integrates with third-party providers you may choose to connect, such as QuickBooks,
          Stripe, Twilio, Zapier, Google Maps, and Samsara. Your use of those providers is governed by their
          own terms and privacy policies. We are not responsible for the acts, omissions, or availability of
          third-party providers.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">7. Intellectual Property</h2>
        <p>
          The Service, including its software, design, and branding, is owned by Landscapt and its licensors
          and is protected by intellectual property laws. These Terms do not grant you any right to our
          trademarks, logos, or brand features except as necessary to use the Service as intended.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">8. Confidentiality</h2>
        <p>
          Each party will protect the other&apos;s non-public information disclosed in connection with the
          Service using at least the same degree of care it uses for its own confidential information, and
          will use it only to perform its obligations or exercise its rights under these Terms.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">9. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY
          KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR
          A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE
          UNINTERRUPTED, ERROR-FREE, OR SECURE.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">10. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LANDSCAPT WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
          SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL,
          ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING
          TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE FEES PAID BY YOU TO US IN THE TWELVE (12) MONTHS
          PRECEDING THE CLAIM.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">11. Indemnification</h2>
        <p>
          You will indemnify and hold Landscapt harmless from any claims, damages, or expenses (including
          reasonable attorneys&apos; fees) arising from your violation of these Terms, your Customer Data, or
          your violation of any law or third-party right.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">12. Term &amp; Termination</h2>
        <p>
          These Terms remain in effect while you use the Service. We may suspend or terminate access for
          material breach of these Terms, non-payment, or if required by law, with notice where reasonably
          practicable. Upon termination, your right to use the Service ends; provisions that by their nature
          should survive (ownership, disclaimers, limitation of liability, confidentiality) will survive.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">13. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the state in which Landscapt is organized, without regard
          to conflict-of-law principles, and any dispute will be resolved in the courts located in that
          state, unless otherwise required by applicable law.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">14. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time. If we make material changes, we will provide
          reasonable notice (such as an in-app notice or email) before the changes take effect. Continued use
          of the Service after changes take effect constitutes acceptance of the revised Terms.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">15. Contact</h2>
        <p>
          Questions about these Terms? Contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
