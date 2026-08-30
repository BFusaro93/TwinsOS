import Link from "next/link";
import { BrandMark } from "@/components/marketing/BrandMark";

const COLUMNS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: "Product",
    links: [
      { href: "/features", label: "Overview" },
      { href: "/features/landscapt", label: "Landscapt" },
      { href: "/features/equipt", label: "Equipt" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    label: "Landscapt features",
    links: [
      { href: "/features/landscapt/estimating", label: "Estimating" },
      { href: "/features/landscapt/scheduling", label: "Scheduling & Dispatch" },
      { href: "/features/landscapt/snow", label: "Snow" },
      { href: "/features/landscapt/invoicing", label: "Invoicing & Payments" },
      { href: "/features/landscapt/reporting", label: "Reporting & Dashboards" },
      { href: "/features/landscapt/automations", label: "Automations" },
      { href: "/features/landscapt/client-portal", label: "Client Portal" },
    ],
  },
  {
    label: "Get started",
    links: [
      { href: "/signup", label: "Start free trial" },
      { href: "/pricing", label: "Pricing" },
      { href: "/login", label: "Log in" },
      { href: "/contact", label: "Contact sales" },
    ],
  },
  {
    label: "Company",
    links: [
      { href: "/help", label: "Support" },
      { href: "/contact", label: "Contact" },
      { href: "/legal/privacy-policy", label: "Privacy Policy" },
      { href: "/legal/sms-terms", label: "SMS Terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <div className="border-t border-[#eceae3] bg-[#fbfbf8]">
      <div className="mx-auto max-w-[1160px] px-6 py-16 sm:px-12">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark size={26} />
              <span className="font-[family-name:var(--font-heading)] text-base font-bold text-[#005642]">
                landscapt
              </span>
            </Link>
            <p className="mt-3 max-w-[220px] text-[13px] leading-relaxed text-[#8a8a84]">
              One industry. One platform. Two systems. One login.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.label}>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">{col.label}</div>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-[13.5px] text-[#5a5a56] hover:text-[#005642]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[#eceae3] px-6 py-5 text-center text-[12.5px] text-[#8a8a84] sm:px-12">
        © {new Date().getFullYear()} Landscapt. All rights reserved.
      </div>
    </div>
  );
}
