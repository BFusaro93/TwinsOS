import Link from "next/link";
import { BrandMark } from "@/components/marketing/BrandMark";

export function MarketingFooter() {
  return (
    <div className="flex flex-col items-center justify-between gap-4 border-t border-[#eceae3] px-6 py-10 text-[13px] text-[#8a8a84] sm:flex-row sm:px-12">
      <div className="flex items-center gap-2">
        <BrandMark size={22} />
        <span className="font-[family-name:var(--font-heading)] font-bold text-[#005642]">landscapt</span>
      </div>
      <div className="flex flex-wrap justify-center gap-7">
        <Link href="/features" className="hover:text-[#005642]">Product</Link>
        <Link href="/pricing" className="hover:text-[#005642]">Pricing</Link>
        <Link href="/integrations" className="hover:text-[#005642]">Integrations</Link>
        <Link href="/help" className="hover:text-[#005642]">Support</Link>
        <Link href="/legal/privacy-policy" className="hover:text-[#005642]">Privacy</Link>
        <Link href="/login" className="hover:text-[#005642]">Log in</Link>
      </div>
      <div>© {new Date().getFullYear()} Landscapt</div>
    </div>
  );
}
