import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Mail, CalendarClock, LifeBuoy, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { DEMO_URL, SALES_EMAIL, SUPPORT_EMAIL } from "@/components/marketing/config";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Contact | Landscapt & Equipt",
  description: "Talk to sales, book a demo, or get support for Landscapt & Equipt.",
};

const CHANNELS = [
  {
    icon: CalendarClock,
    title: "Book a demo",
    body: "See Landscapt and Equipt walked through on your own use case — 30 minutes, no pressure.",
    cta: "Schedule a time",
    href: DEMO_URL,
  },
  {
    icon: Mail,
    title: "Talk to sales",
    body: "Questions about plans, add-ons, or whether this fits a multi-location operation.",
    cta: `Email ${SALES_EMAIL}`,
    href: `mailto:${SALES_EMAIL}?subject=Sales%20question`,
  },
  {
    icon: LifeBuoy,
    title: "Existing customer support",
    body: "Already on Landscapt or Equipt? Sign in for the in-app Support Center, or reach us directly.",
    cta: `Email ${SUPPORT_EMAIL}`,
    href: `mailto:${SUPPORT_EMAIL}?subject=Support%20request`,
  },
  {
    icon: Building2,
    title: "Enterprise & multi-location",
    body: "Custom seat counts, custom onboarding, or a dedicated account manager for larger operations.",
    cta: `Email ${SALES_EMAIL}`,
    href: `mailto:${SALES_EMAIL}?subject=Enterprise%20inquiry`,
  },
];

export default function ContactPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Contact</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Talk to a real person.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          Whether you're sizing up the platform or already running on it, here's the fastest way to reach us.
        </p>
      </div>

      <div className="mx-auto max-w-[1160px] px-6 py-20 sm:px-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {CHANNELS.map((c, i) => (
            <Reveal
              key={c.title}
              delayMs={i * 60}
              className="rounded-md border border-[#e6e6e0] bg-white p-7 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-[#eef4e2]">
                <c.icon className="h-5 w-5 text-[#60ab45]" />
              </div>
              <div className="font-[family-name:var(--font-heading)] mb-2 text-lg font-bold text-[#0a0a0a]">
                {c.title}
              </div>
              <div className="mb-5 text-[14px] leading-relaxed text-[#5a5a56]">{c.body}</div>
              <Button asChild variant="outline">
                <a href={c.href}>{c.cta}</a>
              </Button>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 rounded-lg border border-[#e6e6e0] bg-white p-8 text-center">
          <div className="font-[family-name:var(--font-heading)] mb-2 text-xl font-bold text-[#005642]">
            Have a question first?
          </div>
          <p className="mx-auto mb-6 max-w-md text-[14px] text-[#5a5a56]">
            Check the pricing breakdown, the full feature list, or the support center before reaching out — you
            might find the answer faster there.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/pricing">View pricing</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/features">Browse features</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/help">Visit support center</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
