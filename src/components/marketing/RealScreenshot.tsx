import fs from "fs";
import path from "path";
import { Reveal } from "@/components/marketing/Reveal";
import { BrowserFrame } from "@/components/marketing/mockups/BrowserFrame";

export function RealScreenshot({
  src,
  alt,
  tab,
  accent = "#60ab45",
}: {
  src: string;
  alt: string;
  tab: string;
  accent?: string;
}) {
  const exists = fs.existsSync(path.join(process.cwd(), "public", src));
  if (!exists) return null;

  return (
    <Reveal className="mx-auto max-w-[1160px] px-6 pb-20 sm:px-12">
      <div className="mb-8 text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>
          See it in action
        </div>
        <h2 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[#005642] sm:text-4xl">
          A real screen, not a mockup.
        </h2>
      </div>
      <BrowserFrame tabs={[tab]} activeTab={tab}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block w-full" />
      </BrowserFrame>
    </Reveal>
  );
}
