import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Receipt, FileCheck2, LifeBuoy, FileStack, Layers, KeyRound } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { ClientPortalMockup } from "@/components/marketing/mockups/ClientPortalMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Client Portal | Landscapt",
  description: "A branded, self-serve site where clients pay invoices, act on estimates, and submit tickets — entirely separate from staff login.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Receipt,
    title: "Pay Invoices Online",
    body: "Clients view every invoice and pay by card or bank transfer without calling in — the same Stripe-powered payments built into the rest of Landscapt.",
  },
  {
    icon: FileCheck2,
    title: "Accept or Request Changes to Estimates",
    body: "An estimate opens right in the portal for the client to accept or request changes to — no separate secure-link email required once they're logged in.",
  },
  {
    icon: LifeBuoy,
    title: "Submit & Track Tickets",
    body: "Clients open their own support tickets instead of calling or emailing — tickets carry priority, status, and automated past-due tracking on your side.",
  },
  {
    icon: FileStack,
    title: "Shared Documents",
    body: "Contracts, proposals, and other files you've shared with the client are available for them to reference anytime, without asking you to resend them.",
  },
  {
    icon: Layers,
    title: "Active Services at a Glance",
    body: "Clients can see what services and packages they're currently signed up for — no more \"remind me what I'm paying for\" calls.",
  },
  {
    icon: KeyRound,
    title: "Separate, Invite-Only Login",
    body: "The portal is a distinct login from your staff accounts, invited per client — nothing about your operations, other clients, or pricing is ever exposed.",
  },
];

export default function ClientPortalFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Client Portal"
        title="Fewer calls. Faster payments."
        subhead="A branded, self-serve site where clients pay invoices, act on estimates, and submit tickets — entirely separate from your staff login."
        mockupTab="Client Portal"
        Mockup={ClientPortalMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Every capability</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What the Client Portal actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
