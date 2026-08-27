"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  LifeBuoy,
  Mail,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Search,
  Menu,
  X,
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

// ── Sidebar ──────────────────────────────────────────────────────────────────
// Ported from the former DocsPage.tsx sidebar, but instead of swapping the
// whole main pane to a single article, selecting an item here scrolls the
// (single, continuously-scrolling) main pane to that article's card and
// expands it — the "keep the shrink/expand" behavior the sidebar navigates.

function Sidebar({
  search,
  onSearchChange,
  onSelectArticle,
  onSelectFaq,
  onClose,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onSelectArticle: (sectionId: string, articleId: string) => void;
  onSelectFaq: () => void;
  onClose?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DOC_SECTIONS;
    return DOC_SECTIONS.map((s) => ({
      ...s,
      articles: s.articles.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.steps.some((st) => st.step.toLowerCase().includes(q) || st.detail.toLowerCase().includes(q))
      ),
    })).filter((s) => s.articles.length > 0);
  }, [search]);

  const faqMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return FAQ_CATEGORIES.some((c) => c.items.some((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)));
  }, [search]);

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isSectionOpen(section: DocSection) {
    if (search.trim()) return true;
    return collapsed[section.id] !== true;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search guides…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {filteredSections.map((section) => {
          const SectionIcon = section.icon;
          const open = isSectionOpen(section);
          return (
            <div key={section.id} className="mb-1">
              <button
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <SectionIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">{section.label}</span>
                <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
              </button>
              {open && (
                <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
                  {section.articles.map((article) => {
                    const ArticleIcon = article.icon;
                    return (
                      <button
                        key={article.id}
                        onClick={() => {
                          onSelectArticle(section.id, article.id);
                          onClose?.();
                        }}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 w-full"
                      >
                        <ArticleIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{article.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {faqMatches && (
          <button
            onClick={() => {
              onSelectFaq();
              onClose?.();
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span>FAQ</span>
          </button>
        )}
      </nav>
    </div>
  );
}

// ── Expandable guide card ────────────────────────────────────────────────────
// Collapsed: compact summary row (as before). Expanded: the more readable
// Docs-style layout — numbered steps connected by a line, matching the
// article view that used to live only in DocsPage.

function GuideCard({
  guide,
  isOpen,
  onToggle,
  cardRef,
}: {
  guide: DocArticle;
  isOpen: boolean;
  onToggle: () => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  const Icon = guide.icon;
  return (
    <div ref={cardRef} className="scroll-mt-4 rounded-lg border border-[#e6e6e0] bg-white shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full cursor-pointer list-none items-start gap-3 rounded-lg p-4 text-left hover:bg-[#fbfbf8]"
      >
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
          <Icon className="h-4 w-4 text-[#60ab45]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">{guide.title}</p>
          <p className="text-xs text-[#5a5a56] mt-0.5">{guide.summary}</p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-slate-400 mt-1 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>
      {isOpen && (
        <div className="border-t border-[#eceae3] px-4 pb-6 pt-5 sm:px-6">
          <ol className="flex flex-col gap-6">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#60ab45] text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {i < guide.steps.length - 1 && <div className="mt-2 w-px flex-1 bg-slate-200" />}
                </div>
                <div className="flex-1 pb-1">
                  <p className="text-sm font-semibold text-[#0a0a0a]">{s.step}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[#5a5a56]">{s.detail}</p>
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
      )}
    </div>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const faqRef = useRef<HTMLDivElement | null>(null);

  const query = search.trim().toLowerCase();

  const filteredSections = useMemo<DocSection[]>(() => {
    if (!query) return DOC_SECTIONS;
    return DOC_SECTIONS.map((section) => ({
      ...section,
      articles: section.articles.filter(
        (g) =>
          g.title.toLowerCase().includes(query) ||
          g.summary.toLowerCase().includes(query) ||
          g.steps.some((s) => s.step.toLowerCase().includes(query) || s.detail.toLowerCase().includes(query))
      ),
    })).filter((s) => s.articles.length > 0);
  }, [query]);

  const filteredFAQs = useMemo<FAQCategory[]>(() => {
    if (!query) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter((f) => f.q.toLowerCase().includes(query) || f.a.toLowerCase().includes(query)),
    })).filter((c) => c.items.length > 0);
  }, [query]);

  function cardKey(sectionId: string, articleId: string) {
    return `${sectionId}:${articleId}`;
  }

  function toggleCard(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function scrollToArticle(sectionId: string, articleId: string) {
    const key = cardKey(sectionId, articleId);
    setExpanded((prev) => new Set(prev).add(key));
    requestAnimationFrame(() => {
      cardRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function scrollToFaq() {
    requestAnimationFrame(() => {
      faqRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const noResults = query && filteredSections.length === 0 && filteredFAQs.length === 0;

  return (
    <div className="flex h-[75vh] max-h-[900px] min-h-[560px] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white shadow-sm">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-100 lg:flex lg:flex-col">
        <Sidebar
          search={search}
          onSearchChange={setSearch}
          onSelectArticle={scrollToArticle}
          onSelectFaq={scrollToFaq}
        />
      </aside>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative z-10 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Support</span>
              <button onClick={() => setMobileNavOpen(false)}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <Sidebar
              search={search}
              onSearchChange={setSearch}
              onSelectArticle={scrollToArticle}
              onSelectFaq={scrollToFaq}
              onClose={() => setMobileNavOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Content area */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-800"
          >
            <Menu className="h-4 w-4" />
            <span>Menu</span>
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          <span className="text-sm text-slate-500 truncate">Support</span>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
          <div className="mx-auto flex max-w-3xl flex-col gap-10 pb-4">
            {noResults ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Search className="h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No results for &ldquo;{search}&rdquo;</p>
                <p className="text-xs text-slate-400">Try a different term or browse the sidebar.</p>
              </div>
            ) : (
              <>
                {filteredSections.map((section) => (
                  <section key={section.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <section.icon className="h-4 w-4 text-[#60ab45]" />
                      <DocsEyebrow>{section.label}</DocsEyebrow>
                    </div>
                    <div className="flex flex-col gap-3">
                      {section.articles.map((guide) => {
                        const key = cardKey(section.id, guide.id);
                        return (
                          <GuideCard
                            key={guide.id}
                            guide={guide}
                            isOpen={expanded.has(key)}
                            onToggle={() => toggleCard(key)}
                            cardRef={(el) => {
                              cardRefs.current[key] = el;
                            }}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}

                {filteredFAQs.length > 0 && (
                  <section ref={faqRef} className="scroll-mt-4">
                    <DocsEyebrow>Frequently Asked Questions</DocsEyebrow>
                    <div className="mt-4 flex flex-col gap-6">
                      {filteredFAQs.map((cat) => (
                        <div key={cat.label}>
                          <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-[#5a5a56]">
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
                  </section>
                )}

                {!query && (
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
                          <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">Advanced Guides</p>
                          <p className="mt-0.5 text-sm font-medium text-[#60ab45]">Browse Docs</p>
                          <p className="mt-1 text-xs text-[#5a5a56]">In-depth, step-by-step guides for every part of the platform.</p>
                        </div>
                      </a>
                    </div>
                  </section>
                )}

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
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
