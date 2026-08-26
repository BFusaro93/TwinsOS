import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/BrandMark";
import { DEMO_URL } from "@/components/marketing/config";

const LINKS = [
  { href: "/features", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/integrations", label: "Integrations" },
];

export function MarketingNav() {
  return (
    <div className="flex items-center justify-between border-b border-[#eceae3] bg-[#fbfbf8] px-6 py-5 sm:px-12">
      <Link href="/" className="flex items-center gap-2.5">
        <BrandMark />
        <span className="font-[family-name:var(--font-heading)] text-xl font-extrabold tracking-tight text-[#005642]">
          landscapt
        </span>
      </Link>
      <div className="hidden items-center gap-9 text-sm font-medium text-[#3a3a36] md:flex">
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
      <div className="flex items-center gap-2 md:hidden">
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
