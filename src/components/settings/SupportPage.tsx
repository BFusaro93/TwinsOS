"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  LifeBuoy,
  Mail,
  BookOpen,
  ChevronDown,
  ArrowRight,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  DOC_SECTIONS,
  FAQ_CATEGORIES,
  type DocSection,
  type DocArticle,
  type FAQCategory,
} from "@/lib/docs-content";
import { DocsEyebrow } from "@/components/docs/DocsBrand";

// Guide/GuideSection are aliases of the shared docs-content types — kept so this
// file's internal naming didn't need to change everywhere below.
type Guide = DocArticle;
type GuideSection = DocSection;

// ── Sub-components ────────────────────────────────────────────────────────────

function GuideCard({ guide }: { guide: Guide }) {
  const Icon = guide.icon;
  return (
    <details className="group rounded-lg border border-[#e6e6e0] bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-4 hover:bg-[#fbfbf8] rounded-lg">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
          <Icon className="h-4 w-4 text-[#60ab45]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">{guide.title}</p>
          <p className="text-xs text-[#5a5a56] mt-0.5">{guide.summary}</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 mt-1 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-[#eceae3] px-4 pb-4 pt-3">
        <ol className="flex flex-col gap-3">
          {guide.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e2f6d8] text-[10px] font-bold text-[#396927]">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-[#0a0a0a]">{s.step}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[#5a5a56]">{s.detail}</p>
                {s.href && (
                  <Link
                    href={s.href}
                    className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-[#60ab45] hover:text-[#4a8a33]"
                  >
                    {s.linkLabel ?? "Learn more"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border-b border-[#eceae3] last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium text-[#0a0a0a] hover:text-[#60ab45]">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="pb-4 text-sm leading-relaxed text-[#5a5a56]">{a}</p>
    </details>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SupportPage({ docsHref = "/docs" }: { docsHref?: string } = {}) {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>("all");

  const query = search.trim().toLowerCase();

  // Filter guides and FAQs by search query
  const filteredSections = useMemo<GuideSection[]>(() => {
    if (!query) return DOC_SECTIONS;
    return DOC_SECTIONS.map((section) => ({
      ...section,
      articles: section.articles.filter(
        (g) =>
          g.title.toLowerCase().includes(query) ||
          g.summary.toLowerCase().includes(query) ||
          g.steps.some(
            (s) =>
              s.step.toLowerCase().includes(query) ||
              s.detail.toLowerCase().includes(query)
          )
      ),
    })).filter((s) => s.articles.length > 0);
  }, [query]);

  const filteredFAQs = useMemo<FAQCategory[]>(() => {
    if (!query) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (f) =>
          f.q.toLowerCase().includes(query) ||
          f.a.toLowerCase().includes(query)
      ),
    })).filter((c) => c.items.length > 0);
  }, [query]);

  const sectionTabs = [
    { id: "all", label: "All" },
    ...DOC_SECTIONS.map((s) => ({ id: s.id, label: s.label })),
    { id: "faq", label: "FAQ" },
  ];

  const visibleSections =
    activeSection === "all" || query
      ? filteredSections
      : filteredSections.filter((s) => s.id === activeSection);

  const showFAQ = activeSection === "all" || activeSection === "faq";

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search guides and FAQs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Section tabs — hidden when searching */}
      {!query && (
        <div className="flex flex-wrap gap-2">
          {sectionTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                activeSection === tab.id
                  ? "bg-[#60ab45] text-white"
                  : "bg-[#eef4e2] text-[#3a5a1a] hover:bg-[#e2f0d0]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Guide sections */}
      {visibleSections.length > 0 && (activeSection !== "faq" || query) && (
        <div className="flex flex-col gap-8">
          {visibleSections.map((section) => {
            const SectionIcon = section.icon;
            return (
              <section key={section.id}>
                <div className="mb-3 flex items-center gap-2">
                  <SectionIcon className="h-4 w-4 text-[#60ab45]" />
                  <DocsEyebrow>{section.label}</DocsEyebrow>
                </div>
                <div className="flex flex-col gap-3">
                  {section.articles.map((guide) => (
                    <GuideCard key={guide.id} guide={guide} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* FAQ section */}
      {showFAQ && filteredFAQs.length > 0 && (
        <div className="flex flex-col gap-6">
          <DocsEyebrow>Frequently Asked Questions</DocsEyebrow>
          {filteredFAQs.map((cat) => (
            <div key={cat.label}>
              <p className="mb-1 text-xs font-semibold text-[#5a5a56] uppercase tracking-wide px-1">
                {cat.label}
              </p>
              <div className="rounded-lg border border-[#e6e6e0] bg-white px-6 shadow-sm">
                {cat.items.map((faq) => (
                  <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {query && filteredSections.length === 0 && filteredFAQs.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Search className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No results for &ldquo;{search}&rdquo;</p>
          <p className="text-xs text-slate-400">Try a different term or browse by section above.</p>
        </div>
      )}

      {/* Contact cards */}
      {(activeSection === "all" || activeSection === "faq") && !query && (
        <section>
          <DocsEyebrow>Get in Touch</DocsEyebrow>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <a
              href="mailto:support@twinsOS.com"
              className="flex items-start gap-4 rounded-lg border border-[#e6e6e0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef4e2]">
                <Mail className="h-5 w-5 text-[#60ab45]" />
              </div>
              <div>
                <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">Email Support</p>
                <p className="mt-0.5 text-sm font-medium text-[#60ab45]">support@twinsOS.com</p>
                <p className="mt-1 text-xs text-[#5a5a56]">We typically respond within one business day.</p>
              </div>
            </a>
            <a
              href={docsHref}
              className="flex items-start gap-4 rounded-lg border border-[#e6e6e0] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef4e2]">
                <BookOpen className="h-5 w-5 text-[#60ab45]" />
              </div>
              <div>
                <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">Documentation</p>
                <p className="mt-0.5 text-sm font-medium text-[#60ab45]">Browse all guides</p>
                <p className="mt-1 text-xs text-[#5a5a56]">Step-by-step guides for every part of the platform.</p>
              </div>
            </a>
          </div>
        </section>
      )}

      {/* Footer callout */}
      <div className="flex items-center gap-3 rounded-lg border border-[#d8e8c4] bg-[#eef4e2] px-5 py-4">
        <LifeBuoy className="h-5 w-5 shrink-0 text-[#60ab45]" />
        <p className="text-sm text-[#3a5a1a]">
          Can&rsquo;t find what you&rsquo;re looking for?{" "}
          <a href="mailto:support@twinsOS.com" className="font-semibold underline">
            Send us a message
          </a>{" "}
          and we&rsquo;ll get back to you as soon as possible.
        </p>
      </div>
    </div>
  );
}
