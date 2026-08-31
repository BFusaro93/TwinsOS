import fs from "fs";
import path from "path";
import { Reveal } from "@/components/marketing/Reveal";

function WindowFrame({
  src,
  alt,
  wrapperClassName,
  imgClassName,
}: {
  src: string;
  alt: string;
  wrapperClassName?: string;
  imgClassName?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-[0_30px_70px_-25px_rgba(0,0,0,0.35)] ${wrapperClassName ?? ""}`}
    >
      <div className="flex items-center gap-1.5 bg-[#f4f3ee] px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e6605a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e6b95a]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#5ec26a]" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={imgClassName ?? "block w-full"} />
    </div>
  );
}

export function RealScreenshotStack({
  images,
  accent = "#60ab45",
}: {
  images: { src: string; alt: string }[];
  accent?: string;
}) {
  const existing = images.filter((img) => fs.existsSync(path.join(process.cwd(), "public", img.src)));
  if (existing.length === 0) return null;

  return (
    <Reveal className="mx-auto max-w-[1160px] px-6 pb-24 pt-4 sm:px-12">
      <div className="mb-12 text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em]" style={{ color: accent }}>
          See it in action
        </div>
        <h2 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold text-[#005642] sm:text-4xl">
          Real screens, not mockups.
        </h2>
      </div>
      <div className="relative mx-auto max-w-[820px] pb-16 pt-4 pl-6 pr-10 sm:pl-0 sm:pr-16">
        {existing[0] && (
          <WindowFrame src={existing[0].src} alt={existing[0].alt} wrapperClassName="relative z-0" />
        )}
        {existing[1] && (
          <WindowFrame
            src={existing[1].src}
            alt={existing[1].alt}
            wrapperClassName="absolute -bottom-10 -right-4 z-10 sm:-right-14"
            imgClassName="block h-[190px] w-auto object-contain sm:h-[240px]"
          />
        )}
      </div>
    </Reveal>
  );
}
