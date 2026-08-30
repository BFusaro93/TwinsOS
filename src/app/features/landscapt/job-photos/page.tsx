import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Camera, PenLine, Tag, Archive } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { JobPhotosMockup } from "@/components/marketing/mockups/JobPhotosMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Job Photos | Landscapt",
  description: "Before/during/after photo capture with on-image annotation, tagging, and an archive attached to every job.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Camera,
    title: "Before, During, and After",
    body: "Capture photos at every stage of a job right from the field — proof of work that doesn't rely on someone remembering to text it in.",
  },
  {
    icon: PenLine,
    title: "On-Image Annotation",
    body: "Mark up a photo directly — circle the damage, point to the drainage issue — instead of describing it in a separate note that gets disconnected from the image.",
  },
  {
    icon: Tag,
    title: "Tagged & Attached to the Job",
    body: "Photos tag automatically to the client and job they belong to, so there's never a mystery photo with no context months later.",
  },
  {
    icon: Archive,
    title: "A Real Archive",
    body: "Every photo lives in a searchable archive attached to the job — useful for a warranty dispute, a before/after in a proposal, or just proving the work got done.",
  },
];

export default function JobPhotosFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Job Photos"
        title="Proof of work, without the text message chain."
        subhead="Before/during/after photo capture with on-image annotation, tagging, and an archive attached to every job. A paid add-on, included free on Growth and Enterprise."
        mockupTab="Job Photos"
        Mockup={JobPhotosMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Job Photos actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
