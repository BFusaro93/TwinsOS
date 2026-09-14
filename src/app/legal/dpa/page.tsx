import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SUPPORT_EMAIL } from "@/components/marketing/config";

export const metadata: Metadata = buildMetadata({
  title: "Data Processing Addendum | Landscapt & Equipt",
  description: "The Data Processing Addendum governing Landscapt & Equipt's handling of Customer Data as a processor.",
  path: "/legal/dpa",
});

export default function DataProcessingAddendumPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-bold text-slate-900">Data Processing Addendum</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: September 1, 2026</p>

      <section className="mt-8 space-y-4 leading-relaxed">
        <p>
          This Data Processing Addendum (&quot;DPA&quot;) forms part of the{" "}
          <a href="/legal/terms" className="text-brand-600 underline">
            Terms of Service
          </a>{" "}
          between Landscapt (&quot;Processor,&quot; &quot;we&quot;) and the organization using the Landscapt
          and Equipt platform (&quot;Customer,&quot; &quot;Controller&quot;). It describes how we process
          personal data on Customer&apos;s behalf. If you need a countersigned copy for your own compliance
          records, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">1. Roles</h2>
        <p>
          For personal data that Customer submits to the Service about its own clients, employees, or job
          sites (&quot;Customer Personal Data&quot;), Customer is the controller and Landscapt is the
          processor. Landscapt processes Customer Personal Data only to provide, maintain, and support the
          Service, and only on Customer&apos;s documented instructions, including those given through
          ordinary use of the Service&apos;s features.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">2. Nature and Purpose of Processing</h2>
        <p>
          Landscapt processes Customer Personal Data to host, store, back up, and make it available to
          Customer&apos;s authorized users within the Service, and to provide related support, in each case for
          the duration Customer maintains an active account.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">3. Categories of Data Subjects &amp; Data</h2>
        <p>
          Data subjects may include Customer&apos;s clients, employees, contractors, and job-site contacts.
          Data typically includes names, addresses, phone numbers, email addresses, service and job history,
          and — where Customer chooses to enter it — payment or billing details processed through Customer&apos;s
          connected payment provider.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">4. Confidentiality</h2>
        <p>
          Landscapt ensures that personnel authorized to process Customer Personal Data are subject to
          appropriate confidentiality obligations.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">5. Security Measures</h2>
        <p>
          Landscapt maintains technical and organizational measures appropriate to the risk, including
          encryption of data in transit, database-level access controls scoped to each organization (row-level
          security), restricted administrative access, and routine backups.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">6. Sub-Processors</h2>
        <p>
          Customer authorizes Landscapt to engage the following sub-processors to provide the Service:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Supabase</strong> — database, authentication, and file storage;</li>
          <li><strong>Vercel</strong> — application hosting;</li>
          <li><strong>Stripe</strong> — payment processing;</li>
          <li><strong>Twilio</strong> — transactional SMS delivery;</li>
          <li>
            Optional integrations Customer enables — QuickBooks, Zapier, Google Maps, or Samsara — which
            process data under Customer&apos;s own instruction and account with those providers.
          </li>
        </ul>
        <p>
          Landscapt will impose data protection obligations on sub-processors consistent with this DPA and
          remains responsible for their performance. We will notify Customer of any intended change to this
          list where required by law, giving Customer the opportunity to object on reasonable data protection
          grounds.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">7. Data Subject Requests</h2>
        <p>
          Where Landscapt receives a request from a data subject relating to Customer Personal Data, we will
          promptly forward it to Customer and provide reasonable assistance to help Customer respond, since
          Customer controls that data and its relationship with the data subject.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">8. Security Incidents</h2>
        <p>
          Landscapt will notify Customer without undue delay after becoming aware of a confirmed breach of
          security leading to accidental or unlawful destruction, loss, alteration, or unauthorized disclosure
          of Customer Personal Data, and will provide information reasonably available to help Customer meet
          its own notification obligations.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">9. Return &amp; Deletion of Data</h2>
        <p>
          Upon termination of the Service, Landscapt will, at Customer&apos;s choice, delete or make available
          for export Customer Personal Data, except where retention is required by law, within a reasonable
          period.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">10. Audits</h2>
        <p>
          Landscapt will make available information reasonably necessary to demonstrate compliance with this
          DPA and will allow for audits, including inspections, conducted by Customer or an auditor mandated
          by Customer, subject to reasonable notice and confidentiality safeguards.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">11. International Transfers</h2>
        <p>
          Where Customer Personal Data is transferred outside the jurisdiction in which it was collected,
          Landscapt will rely on appropriate safeguards recognized under applicable data protection law.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">12. Term</h2>
        <p>
          This DPA remains in effect for as long as Landscapt processes Customer Personal Data on
          Customer&apos;s behalf under the Terms of Service.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">13. Contact</h2>
        <p>
          Questions about this DPA, or need a signed copy? Contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-brand-600 underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </main>
  );
}
