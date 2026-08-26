import Link from "next/link";
import { CalendarClock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/BrandMark";
import { DEMO_URL } from "@/components/marketing/config";

const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/integrations", label: "Integrations" },
  { href: "/help", label: "Support" },
];

const PRODUCT_LINKS = [
  { href: "/features", label: "Overview", desc: "Every module, both products" },
  { href: "/features/landscapt", label: "Landscapt", desc: "CRM & field service" },
  { href: "/features/equipt", label: "Equipt", desc: "Asset management & maintenance" },
];

function ProductMenu() {
  return (
    <div className="group relative">
      <Link href="/features" className="flex items-center gap-1 hover:text-[#005642]">
        Product
        <ChevronDown className="h-3 w-3 transition-transform group-hover:rotate-180" />
      </Link>
      <div className="invisible absolute left-0 top-full z-20 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
        <div className="w-60 rounded-lg border border-[#e6e6e0] bg-white p-2 shadow-lg">
          {PRODUCT_LINKS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="block rounded-md px-3 py-2 hover:bg-slate-50"
            >
              <div className="text-[13.5px] font-semibold text-[#0a0a0a]">{p.label}</div>
              <div className="text-[11.5px] text-slate-400">{p.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MarketingNav() {
  return (
    <div className="flex items-center justify-between border-b border-[#eceae3] bg-[#fbfbf8] px-6 py-5 sm:px-12">
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark size={38} />
        <span className="font-[family-name:var(--font-heading)] text-2xl font-extrabold tracking-tight text-[#005642]">
          landscapt
        </span>
      </Link>
      <div className="hidden items-center gap-6 text-sm font-medium text-[#3a3a36] lg:flex">
        <ProductMenu />
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-[#005642]">
            {l.label}
          </Link>
        ))}
        <Link href="/login" className="text-[#005642] hover:underline">
          Log in
        </Link>
        <a
          href={DEMO_URL}
          className="flex items-center gap-1.5 rounded-full border border-[#005642] px-4 py-2 text-[13px] font-semibold text-[#005642] transition-colors hover:bg-[#005642] hover:text-white"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Book a demo
        </a>
        <Button asChild className="bg-[#60ab45] hover:bg-[#4a8a33]">
          <Link href="/signup">Start free trial</Link>
        </Button>
      </div>
      <div className="flex items-center gap-2 lg:hidden">
        <a
          href={DEMO_URL}
          className="flex items-center gap-1.5 rounded-full border border-[#005642] px-3 py-1.5 text-[12.5px] font-semibold text-[#005642]"
        >
          <CalendarClock className="h-3.5 w-3.5" />
          Demo
        </a>
        <Button asChild size="sm" className="bg-[#60ab45] hover:bg-[#4a8a33]">
          <Link href="/signup">Start trial</Link>
        </Button>
      </div>
    </div>
  );
}
