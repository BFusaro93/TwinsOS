"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown } from "lucide-react";
import { DOC_SECTIONS, FAQ_CATEGORIES } from "@/lib/docs-content";

// A representative, customer-facing slice of the real in-app FAQ — the full
// ~25-item set skews toward deep operational edge cases meant for existing
// users mid-workflow, not a first-touch marketing/support page.
const FEATURED_QUESTIONS = [
  "How is data isolated — can other companies see our data?",
  "What's the difference between a Work Order and a Maintenance Request?",
  "How do I set up a preventive maintenance schedule?",
  "Can I partially receive a purchase order?",
  "How does the Dispatch Board calculate hours if a crew doesn't clock in?",
  "How is snow invoicing different from a regular invoice?",
  "How do I connect Zapier?",
  "How do I add or remove users from my organization?",
];

const faqCategories = FAQ_CATEGORIES.map((c) => ({
  label: c.label,
  items: c.items.filter((item) => FEATURED_QUESTIONS.includes(item.q)),
})).filter((c) => c.items.length > 0);

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
    if (!q) return faqCategories;
    return faqCategories
      .map((cat) => ({
        label: cat.label,
        items: cat.items.filter((item) => matches(item.q, q) || matches(item.a, q)),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [q]);

  const noResults = q && filteredSections.length === 0 && filteredFaqs.length === 0;

  return (
    <div className="mx-auto max-w-[900px] px-6 py-16 sm:px-12">
      <div className="relative mb-14">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides and answers — e.g. &quot;approval chain&quot;, &quot;snow invoicing&quot;, &quot;low stock&quot;"
          className="w-full rounded-full border border-[#e6e6e0] bg-white py-3 pl-11 pr-4 text-[14.5px] text-[#0a0a0a] shadow-sm outline-none focus:border-[#60ab45] focus:ring-2 focus:ring-[#60ab45]/20"
        />
      </div>

      {noResults && (
        <p className="text-center text-[14.5px] text-slate-500">
          No guides or answers match &ldquo;{q}&rdquo;. Try a different term, or{" "}
          <a href="/contact" className="font-semibold text-[#60ab45] hover:underline">
            contact us
          </a>
          .
        </p>
      )}

      {filteredSections.length > 0 && (
        <div className="mb-14">
          <h2 className="font-[family-name:var(--font-heading)] mb-6 text-xl font-extrabold text-[#005642]">
            Guides
          </h2>
          <div className="flex flex-col gap-8">
            {filteredSections.map((section) => (
              <div key={section.id}>
                <div className="mb-3 flex items-center gap-2.5">
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
          </div>
        </div>
      )}

      {filteredFaqs.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-heading)] mb-6 text-xl font-extrabold text-[#005642]">
            Frequently asked
          </h2>
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
  );
}
