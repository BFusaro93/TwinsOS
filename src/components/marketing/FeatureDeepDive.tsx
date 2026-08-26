import { Reveal } from "@/components/marketing/Reveal";

export type DeepDiveItem = {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  body: string;
};

export function FeatureDeepDive({ items, accent }: { items: DeepDiveItem[]; accent: string }) {
  return (
    <div className="mx-auto max-w-[820px] px-6 pt-4 pb-24 sm:px-12">
      <div className="flex flex-col divide-y divide-[#eceae3]">
        {items.map((f, i) => (
          <Reveal key={f.title} delayMs={Math.min(i, 4) * 60} className="flex gap-5 py-8 first:pt-0">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md"
              style={{ backgroundColor: `${accent}1a` }}
            >
              <f.icon className="h-5 w-5" style={{ color: accent }} />
            </div>
            <div>
              <div className="font-[family-name:var(--font-heading)] mb-1.5 text-lg font-bold text-[#0a0a0a]">
                {f.title}
              </div>
              <div className="text-[14.5px] leading-relaxed text-[#5a5a56]">{f.body}</div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
