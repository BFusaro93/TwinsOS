"use client";

import { useState } from "react";
import { BrowserFrame } from "@/components/marketing/mockups/BrowserFrame";

export type ShowcasePanel = {
  key: string;
  tab: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  Mockup: React.ComponentType;
};

export function ShowcaseTabs({
  id,
  eyebrow,
  title,
  panels,
  defaultKey,
}: {
  id: string;
  eyebrow: string;
  title: string;
  panels: readonly ShowcasePanel[];
  defaultKey?: string;
}) {
  const [active, setActive] = useState<string>(defaultKey ?? panels[0].key);
  const panel = panels.find((p) => p.key === active) ?? panels[0];

  return (
    <div id={id} className="mx-auto max-w-[1160px] px-6 py-24 sm:px-12">
      <div className="mb-10 text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">{eyebrow}</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">{title}</h2>
      </div>

      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              active === p.key
                ? "border-[#005642] bg-[#005642] text-white"
                : "border-[#e6e6e0] bg-white text-[#5a5a56] hover:border-[#60ab45] hover:text-[#005642]"
            }`}
          >
            <p.icon className="h-4 w-4" />
            {p.tab}
          </button>
        ))}
      </div>

      <p className="mx-auto mb-8 max-w-[560px] text-center text-[14.5px] leading-relaxed text-[#5a5a56]">
        {panel.blurb}
      </p>

      <div key={panel.key} className="mx-auto max-w-[1040px] animate-in fade-in slide-in-from-bottom-2 duration-500">
        <BrowserFrame tabs={["Jobs", "Crews", "Assets", "Billing"]} activeTab="Jobs">
          <panel.Mockup />
        </BrowserFrame>
      </div>
    </div>
  );
}
