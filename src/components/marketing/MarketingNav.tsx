import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/marketing/BrandMark";

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
        <Button asChild className="bg-[#60ab45] hover:bg-[#4a8a33]">
          <Link href="/signup">Start free trial</Link>
        </Button>
      </div>
      <Button asChild size="sm" className="bg-[#60ab45] hover:bg-[#4a8a33] md:hidden">
        <Link href="/signup">Start trial</Link>
      </Button>
    </div>
  );
}
