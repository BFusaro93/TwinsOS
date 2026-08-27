import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Mail, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { DOC_SECTIONS, FAQ_CATEGORIES } from "@/lib/docs-content";
import { SUPPORT_EMAIL } from "@/components/marketing/config";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Support | Landscapt & Equipt",
  description: "Browse help guides and answers pulled straight from the in-app documentation for Landscapt & Equipt.",
};

// A representative, customer-facing slice of the real in-app FAQ — the full
// ~25-item set (src/lib/docs-content.ts) skews toward deep operational edge
// cases meant for existing users, not a first-touch marketing page.
const FEATURED_QUESTIONS = [
  "How is data isolated — can other companies see our data?",
  "What's the difference between a Work Order and a Maintenance Request?",
  "How do I set up a preventive maintenance schedule?",
  "Can I partially receive a purchase order?",
  "How does the Dispatch Board calculate hours if a crew doesn't clock in?",
  "How is snow invoicing different from a regular invoice?",
  "How do I connect Zapier?",
  "How do I add or remove users from my organization?",
];

const featuredFaqCategories = FAQ_CATEGORIES.map((c) => ({
  label: c.label,
  items: c.items.filter((item) => FEATURED_QUESTIONS.includes(item.q)),
})).filter((c) => c.items.length > 0);

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
          The same guides and answers built into the product — browse by topic, or reach a real person.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-[#b7d433] text-[#005642] hover:bg-[#a5c02c]">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=Support%20request`}>
              <Mail className="mr-1.5 h-4 w-4" />
              Email support
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-[1.5px] border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <Link href="/login">Sign in for full docs</Link>
          </Button>
        </div>
      </div>

      {/* BROWSE BY TOPIC */}
      <div className="mx-auto max-w-[1160px] px-6 py-20 sm:px-12">
        <Reveal className="mb-12 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Browse by topic</div>
          <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
            Guides for every module.
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {DOC_SECTIONS.map((section, i) => (
            <Reveal key={section.id} delayMs={i * 50}>
              <Link
                href="/login?redirectTo=%2Fdocs"
                className="group flex h-full flex-col rounded-md border border-[#e6e6e0] bg-white p-6 transition-shadow hover:shadow-lg"
              >
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#eef4e2]">
                    <section.icon className="h-4 w-4 text-[#60ab45]" />
                  </div>
                  <span className="font-[family-name:var(--font-heading)] text-[15px] font-bold text-[#0a0a0a]">
                    {section.label}
                  </span>
                </div>
                <ul className="mb-4 flex flex-1 flex-col gap-2.5">
                  {section.articles.map((article) => (
                    <li key={article.id} className="text-[13px] leading-snug text-[#5a5a56]">
                      <span className="font-medium text-[#3a3a36]">{article.title}</span>
                      {" — "}
                      {article.summary}
                    </li>
                  ))}
                </ul>
                <span className="text-[12.5px] font-semibold text-[#60ab45] group-hover:underline">
                  Sign in to view full guide →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <Reveal>
        <div className="mx-auto max-w-[820px] px-6 pb-20 sm:px-12">
          <div className="mb-10 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              Frequently asked
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              Straight from the source.
            </h2>
          </div>
          <div className="flex flex-col gap-8">
            {featuredFaqCategories.map((cat) => (
              <div key={cat.label}>
                <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  {cat.label}
                </div>
                <div className="flex flex-col divide-y divide-[#eceae3] rounded-md border border-[#e6e6e0] bg-white">
                  {cat.items.map((item) => (
                    <details key={item.q} className="group px-6 py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold text-[#0a0a0a]">
                        {item.q}
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <p className="mt-3 text-[13.5px] leading-relaxed text-[#5a5a56]">{item.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            Didn't find it here?
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">
            The full interactive docs live inside the app once you&apos;re signed in.
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <Link href="/contact">Contact us</Link>
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
