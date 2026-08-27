import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { HelpBrowser } from "@/components/marketing/HelpBrowser";
import { SUPPORT_EMAIL } from "@/components/marketing/config";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Support | Landscapt & Equipt",
  description: "Search real how-to guides and answers pulled straight from the in-app documentation for Landscapt & Equipt.",
};

export default function SupportPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Support</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          How can we help?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          Search the same step-by-step guides and answers built into the product, or reach a real person.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-[#b7d433] text-[#005642] hover:bg-[#a5c02c]">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20request`}>
              <Mail className="mr-1.5 h-4 w-4" />
              Email support
            </a>
          </Button>
        </div>
      </div>

      <HelpBrowser />

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            Didn&apos;t find it here?
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">
            Tell us what you&apos;re stuck on and we&apos;ll get back to you directly.
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <a href="/contact">Contact us</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={`mailto:${SUPPORT_EMAIL}`}>Email {SUPPORT_EMAIL}</a>
            </Button>
          </div>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
