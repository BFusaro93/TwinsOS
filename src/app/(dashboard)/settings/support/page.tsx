import {
  LifeBuoy,
  Mail,
  BookOpen,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

// ── FAQ data ──────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "How do I create a purchase order from a requisition?",
    a: "Open the requisition from the Requisitions page and click 'Convert to PO' in the detail panel. The PO will be pre-filled with all line items, vendor, and cost information. You can adjust any field before saving.",
  },
  {
    q: "Why can't I approve my own requisition?",
    a: "Approval workflows require a different user to approve. If you submitted the requisition, you are listed as the requester and the system will route it to the next approver in the chain configured in Settings > Approval Flows.",
  },
  {
    q: "How do I record goods received against a purchase order?",
    a: "Navigate to Receiving and click '+ New Receipt'. Select the purchase order, then enter the quantities received for each line item. Parts with category 'Maintenance Part' will automatically update the Parts Inventory quantity on hand.",
  },
  {
    q: "How do I add a new asset or vehicle?",
    a: "Go to Assets (or Vehicles) in the Maintenance section and click '+ New Asset'. Fill in the make, model, serial number, and status. You can attach documents and link spare parts after saving.",
  },
  {
    q: "What happens when a part falls below the minimum stock level?",
    a: "A Low Stock alert will appear in the Notifications bell in the top bar. The part will also display a warning badge on the Parts page. Create a Requisition to reorder — the new line item will automatically link to the part.",
  },
  {
    q: "How do I set up a preventive maintenance schedule?",
    a: "Go to PM Schedules and click '+ New PM Schedule'. Select the asset, set the frequency (daily, weekly, monthly, etc.), and add any inspection instructions. The system will surface upcoming and overdue PMs in the Notifications panel.",
  },
  {
    q: "Can a work order automatically create a requisition for parts?",
    a: "Yes. Open a work order and use the 'Request Parts' action. This creates a linked requisition pre-filled with the parts needed, and stores the work order reference on the requisition so you can trace cost back to the job.",
  },
  {
    q: "How do I assign a line item cost to a project?",
    a: "When creating or editing a Requisition or PO, each line item has an optional Project field. Select the project from the dropdown. The cost will appear in the project's Materials tab and roll into the project total.",
  },
  {
    q: "How is data isolated between tenants?",
    a: "All records are scoped to your organization (org_id) at the database level using Row Level Security. No data is ever shared between organizations — queries that don't match your org_id return zero rows by design.",
  },
  {
    q: "How do I add or remove users from my organization?",
    a: "Go to Settings > Users. Admins can invite new users by email and assign them a role (Admin, Manager, Purchaser, Technician, or Viewer). Users receive an email invitation and set their own password on first login.",
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-slate-100 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium text-slate-800 hover:text-brand-600">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="pb-4 text-sm leading-relaxed text-slate-600">{a}</p>
    </details>
  );
}

function ContactCard({
  icon: Icon,
  label,
  value,
  href,
  description,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
        <Icon className="h-5 w-5 text-brand-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-brand-600">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </a>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      <PageHeader
        title="Support"
        description="Find answers, contact our team, or browse documentation."
      />

      {/* Contact cards */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Get in Touch
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ContactCard
            icon={Mail}
            label="Email Support"
            value="support@twinsOS.com"
            href="mailto:support@twinsOS.com"
            description="We typically respond within one business day."
          />
          <ContactCard
            icon={MessageSquare}
            label="Live Chat"
            value="Open chat"
            href="#"
            description="Available Mon – Fri, 9 am – 5 pm ET."
          />
          <ContactCard
            icon={BookOpen}
            label="Documentation"
            value="docs.twinsOS.com"
            href="https://docs.twinsOS.com"
            description="Step-by-step guides and API reference."
          />
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Frequently Asked Questions
        </h2>
        <div className="rounded-lg border border-slate-200 bg-white px-6 shadow-sm">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-5 py-4">
        <LifeBuoy className="h-5 w-5 shrink-0 text-brand-500" />
        <p className="text-sm text-brand-800">
          Can&rsquo;t find what you&rsquo;re looking for?{" "}
          <a href="mailto:support@twinsOS.com" className="font-semibold underline">
            Send us a message
          </a>{" "}
          and we&rsquo;ll get back to you as soon as possible.
        </p>
      </div>
    </div>
  );
}
