import { FileDown } from "lucide-react";
import { GUIDE_DOWNLOADS } from "@/lib/guide-downloads";
import { Reveal } from "@/components/marketing/Reveal";

/** Grid of downloadable PDF one-sheeters, shown on the public support page. */
export function GuideDownloads() {
  return (
    <div className="mx-auto max-w-[1160px] px-6 py-16 sm:px-12">
      <Reveal>
        <div className="mb-3 text-center text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
          Downloads
        </div>
        <h2 className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[#005642]">
          Feature guides you can save or share.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-[#5a5a56]">
          Short PDF overviews of how each part of the platform works.
        </p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDE_DOWNLOADS.map((g) => (
          <a
            key={g.slug}
            href={g.file}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col rounded-xl border border-[#e6e6e0] bg-white p-5 shadow-sm transition hover:border-[#60ab45] hover:shadow-md"
          >
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">{g.product}</div>
            <div className="font-[family-name:var(--font-heading)] text-lg font-bold text-[#005642]">{g.title}</div>
            <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[#5a5a56]">{g.description}</p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#005642] group-hover:underline">
              <FileDown className="h-4 w-4" />
              Download PDF
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
