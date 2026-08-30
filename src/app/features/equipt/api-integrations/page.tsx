import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Code2, Truck, Zap, ShieldCheck } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { ApiMockup } from "@/components/marketing/mockups/ApiMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "API & Integrations | Equipt",
  description: "Connect Samsara for automatic vehicle odometer and GPS sync, Zapier for thousands of apps, or build your own integration against the REST API.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Code2,
    title: "REST API & MCP",
    body: "A scoped API key doubles as an MCP connection for AI agents, with the same permission scopes either way — build your own integration or connect an agent directly.",
  },
  {
    icon: Truck,
    title: "Samsara Integration",
    body: "Connect Samsara for automatic vehicle odometer and GPS sync, so meter-based PM schedules stay current without a manual reading.",
  },
  {
    icon: Zap,
    title: "Zapier — 6,000+ Apps",
    body: "Connect Zapier for thousands of apps — no add-on required, included on every plan.",
  },
  {
    icon: ShieldCheck,
    title: "Scoped, Revocable Keys",
    body: "Every key is scoped to exactly the resources it needs and can be revoked instantly — no all-or-nothing access to your data.",
  },
];

export default function ApiIntegrationsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — API & Integrations"
        title="Your data, wherever you need it."
        subhead="A REST API and MCP server, plus Samsara and Zapier connections — build your own integration or connect an AI agent directly."
        mockupTab="API"
        Mockup={ApiMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What API &amp; Integrations actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
