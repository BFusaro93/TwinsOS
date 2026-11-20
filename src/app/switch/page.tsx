import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { heading } from "@/lib/fonts";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { SUPPORT_EMAIL } from "@/components/marketing/config";
import { getGuideDownload } from "@/lib/guide-downloads";

export const metadata: Metadata = buildMetadata({
  title: "Switching from Service Autopilot or Homeworks | Landscapt",
  description:
    "A step-by-step checklist for moving to Landscapt from Service Autopilot or Homeworks: what to export, what to send us, and what we handle.",
  path: "/switch",
});

const STEPS: { title: string; body: string }[] = [
  { title: "Prepare", body: "Pick a point person and a go-live date. Keep your old system read-only until we've confirmed your data." },
  { title: "Export", body: "Pull CSV exports of clients, contracts, invoices, payments, and your service list from the old system." },
  { title: "Send", body: "Share the files with us securely. Send what you have and we'll tell you what's missing." },
  { title: "We import", body: "We load clients, schedules, contracts, invoices, and payments, and reconcile balances to the penny." },
  { title: "Review", body: "Spot-check a handful of clients you know well and approve the data." },
  { title: "Go live", body: "Train your office and crews, run a test day, and switch on your chosen date." },
];

export default function SwitchPage() {
  const guide = getGuideDownload("switching-checklist");
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Switching over</div>
        <h1 className="mx-auto max-w-3xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Moving from Service Autopilot or Homeworks?
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          Here&apos;s exactly what to export and send us, and what we take care of, so your billing never skips a beat.
        </p>
        {guide && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#b7d433] text-[#005642] hover:bg-[#a5c02c]">
              <a href={guide.file} target="_blank" rel="noopener noreferrer">
                <FileDown className="mr-1.5 h-4 w-4" />
                Download the checklist (PDF)
              </a>
            </Button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1160px] px-6 py-16 sm:px-12">
        <Reveal>
          <h2 className="mb-8 text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[#005642]">
            How the move works
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-[#e6e6e0] bg-white p-5 shadow-sm">
              <div className="mb-1 text-sm font-bold text-[#60ab45]">Step {i + 1}</div>
              <div className="font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">{s.title}</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#5a5a56]">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-[14px] text-[#5a5a56]">
          The checklist covers every item in detail, including settings, team and crews, contracts and billing
          periods, saved cards, chemical and snow records, and what can&apos;t be brought over.
        </p>
      </div>

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="mb-4 font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[#005642]">
            Want help planning your move?
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">Tell us which system you&apos;re on and we&apos;ll walk you through it.</div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <Link href="/contact">Contact us</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Switching%20to%20Landscapt`}>Email {SUPPORT_EMAIL}</a>
            </Button>
          </div>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
