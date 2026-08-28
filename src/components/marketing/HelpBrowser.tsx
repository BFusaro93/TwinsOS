"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, ArrowRight } from "lucide-react";
import { DOC_SECTIONS, FAQ_CATEGORIES } from "@/lib/docs-content";
import { groupedDocGuides, DOC_GUIDE_GROUP_ICONS } from "@/lib/docs-guides";

const JUMP_LINKS = [
  ...DOC_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
  { id: "guides", label: "Guide library" },
  { id: "faq", label: "FAQ" },
];

function matches(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function HelpBrowser() {
  const [query, setQuery] = useState("");
  const q = query.trim();

  const filteredSections = useMemo(() => {
    if (!q) return DOC_SECTIONS;
    return DOC_SECTIONS.map((section) => ({
      ...section,
      articles: section.articles.filter(
        (a) => matches(a.title, q) || matches(a.summary, q) || a.steps.some((s) => matches(s.step, q) || matches(s.detail, q))
      ),
    })).filter((section) => section.articles.length > 0);
  }, [q]);

  const filteredFaqs = useMemo(() => {
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((cat) => ({
      label: cat.label,
      items: cat.items.filter((item) => matches(item.q, q) || matches(item.a, q)),
    })).filter((cat) => cat.items.length > 0);
  }, [q]);

  const filteredGuideGroups = useMemo(() => {
    const groups = groupedDocGuides();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, guides: g.guides.filter((guide) => matches(guide.title, q) || matches(guide.description, q)) }))
      .filter((g) => g.guides.length > 0);
  }, [q]);

  const noResults = Boolean(q) && filteredSections.length === 0 && filteredFaqs.length === 0 && filteredGuideGroups.length === 0;

  return (
    <div className="mx-auto max-w-[1160px] px-6 py-16 sm:px-12">
      <div className="relative mb-10">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides and answers — e.g. &quot;approval chain&quot;, &quot;snow invoicing&quot;, &quot;low stock&quot;"
          className="w-full rounded-full border border-[#e6e6e0] bg-white py-3 pl-11 pr-4 text-[14.5px] text-[#0a0a0a] shadow-sm outline-none focus:border-[#60ab45] focus:ring-2 focus:ring-[#60ab45]/20"
        />
      </div>

      <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-12">
        {/* On-this-page nav — sticky on desktop, horizontal scroller on mobile */}
        <nav className="flex shrink-0 gap-1.5 overflow-x-auto pb-2 lg:sticky lg:top-24 lg:w-48 lg:flex-col lg:overflow-visible lg:pb-0">
          {JUMP_LINKS.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              className="whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium text-[#5a5a56] transition-colors hover:bg-[#eef4e2] hover:text-[#005642] lg:whitespace-normal"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {noResults && (
            <p className="text-center text-[14.5px] text-slate-500">
              No guides or answers match &ldquo;{q}&rdquo;. Try a different term, or{" "}
              <a href="/contact" className="font-semibold text-[#60ab45] hover:underline">
                contact us
              </a>
              .
            </p>
          )}

          <div className="flex flex-col gap-14">
            {filteredSections.map((section) => (
              <div key={section.id} id={section.id} className="scroll-mt-24">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#eef4e2]">
                    <section.icon className="h-3.5 w-3.5 text-[#60ab45]" />
                  </div>
                  <span className="font-[family-name:var(--font-heading)] text-[15px] font-bold text-[#0a0a0a]">
                    {section.label}
                  </span>
                </div>
                <div className="flex flex-col divide-y divide-[#eceae3] rounded-md border border-[#e6e6e0] bg-white">
                  {section.articles.map((article) => (
                    <details key={article.id} className="group px-5 py-3.5">
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                        <div>
                          <div className="text-[14px] font-semibold text-[#0a0a0a]">{article.title}</div>
                          <div className="mt-0.5 text-[12.5px] text-slate-500">{article.summary}</div>
                        </div>
                        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                      </summary>
                      <ol className="mt-3 flex flex-col gap-3 border-t border-[#eceae3] pt-3">
                        {article.steps.map((s, i) => (
                          <li key={i} className="text-[13px] leading-relaxed">
                            <span className="font-semibold text-[#3a3a36]">{s.step}</span>
                            <span className="text-[#5a5a56]"> — {s.detail}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  ))}
                </div>
              </div>
            ))}

            {filteredGuideGroups.length > 0 && (
              <div id="guides" className="scroll-mt-24">
                <div className="mb-1 font-[family-name:var(--font-heading)] text-xl font-extrabold text-[#005642]">
                  Guide library
                </div>
                <p className="mb-6 text-[13.5px] text-slate-500">
                  Longer, step-by-step deep dives — the same ones built into the product. Sign in (or start a
                  free trial) to read the full guide.
                </p>
                <div className="flex flex-col gap-8">
                  {filteredGuideGroups.map((group) => {
                    const GroupIcon = DOC_GUIDE_GROUP_ICONS[group.kicker];
                    return (
                      <div key={group.kicker}>
                        <div className="mb-3 flex items-center gap-2">
                          {GroupIcon && <GroupIcon className="h-3.5 w-3.5 text-[#2aa9e0]" />}
                          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            {group.kicker}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {group.guides.map((guide) => (
                            <a
                              key={guide.slug}
                              href={`/settings/support/${guide.slug}`}
                              className="group flex items-start gap-3 rounded-md border border-[#e6e6e0] bg-white p-4 transition-shadow hover:shadow-md"
                            >
                              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
                                <guide.icon className="h-4 w-4 text-[#60ab45]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#0a0a0a]">
                                  <span className="truncate">{guide.title}</span>
                                  <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#60ab45]" />
                                </div>
                                <div className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
                                  {guide.description}
                                </div>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {filteredFaqs.length > 0 && (
              <div id="faq" className="scroll-mt-24">
                <div className="mb-6 font-[family-name:var(--font-heading)] text-xl font-extrabold text-[#005642]">
                  Frequently asked
                </div>
                <div className="flex flex-col gap-8">
                  {filteredFaqs.map((cat) => (
                    <div key={cat.label}>
                      <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-400">
                        {cat.label}
                      </div>
                      <div className="flex flex-col divide-y divide-[#eceae3] rounded-md border border-[#e6e6e0] bg-white">
                        {cat.items.map((item) => (
                          <details key={item.q} className="group px-6 py-4">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold text-[#0a0a0a]">
                              {item.q}
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                            </summary>
                            <p className="mt-3 text-[13.5px] leading-relaxed text-[#5a5a56]">{item.a}</p>
                          </details>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
