"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOC_SECTIONS, FAQ_CATEGORIES } from "@/lib/docs-content";
import type { DocArticle, DocSection } from "@/lib/docs-content";

// ── Flat article list for prev/next navigation ────────────────────────────────

interface FlatArticle {
  sectionId: string;
  sectionLabel: string;
  article: DocArticle;
}

const FLAT_ARTICLES: FlatArticle[] = DOC_SECTIONS.flatMap((s) =>
  s.articles.map((a) => ({ sectionId: s.id, sectionLabel: s.label, article: a }))
);

const FAQ_ENTRY = { sectionId: "faq", sectionLabel: "FAQ", article: null };

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  activeSection,
  activeArticle,
  onSelect,
  search,
  onSearchChange,
  onClose,
}: {
  activeSection: string;
  activeArticle: string;
  onSelect: (sectionId: string, articleId: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
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
          a.steps.some(
            (st) =>
              st.step.toLowerCase().includes(q) ||
              st.detail.toLowerCase().includes(q)
          )
      ),
    })).filter((s) => s.articles.length > 0);
  }, [search]);

  const faqMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return FAQ_CATEGORIES.some((c) =>
      c.items.some(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      )
    );
  }, [search]);

  function toggleSection(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isSectionOpen(section: DocSection) {
    if (search.trim()) return true;
    if (collapsed[section.id] === true) return false;
    return true;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="p-4 border-b border-slate-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search docs…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* Nav */}
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
                <ChevronDown
                  className={cn(
                    "h-3 w-3 shrink-0 transition-transform",
                    open ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
              {open && (
                <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
                  {section.articles.map((article) => {
                    const ArticleIcon = article.icon;
                    const isActive =
                      activeSection === section.id &&
                      activeArticle === article.id;
                    return (
                      <button
                        key={article.id}
                        onClick={() => {
                          onSelect(section.id, article.id);
                          onClose?.();
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors w-full",
                          isActive
                            ? "bg-brand-50 text-brand-700 font-medium"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                        )}
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

        {/* FAQ entry */}
        {faqMatches && (
          <button
            onClick={() => {
              onSelect("faq", "faq");
              onClose?.();
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors mt-1",
              activeSection === "faq"
                ? "bg-brand-50 text-brand-700 font-medium"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span>FAQ</span>
          </button>
        )}
      </nav>
    </div>
  );
}

// ── Article view ──────────────────────────────────────────────────────────────

function ArticleView({
  article,
  sectionLabel,
  prev,
  next,
  onNavigate,
}: {
  article: DocArticle;
  sectionLabel: string;
  prev: FlatArticle | null;
  next: FlatArticle | null;
  onNavigate: (sectionId: string, articleId: string) => void;
}) {
  const ArticleIcon = article.icon;
  return (
    <article className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {sectionLabel}
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <ArticleIcon className="h-5 w-5 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{article.title}</h1>
        </div>
        <p className="text-slate-500">{article.summary}</p>
        <div className="mt-1 h-px bg-slate-100" />
      </div>

      {/* Steps */}
      <ol className="flex flex-col gap-6">
        {article.steps.map((step, i) => (
          <li key={i} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              {i < article.steps.length - 1 && (
                <div className="mt-2 w-px flex-1 bg-slate-200" />
              )}
            </div>
            <div className="pb-6 flex-1">
              <p className="text-base font-semibold text-slate-800">{step.step}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Prev / Next */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-6">
        <div>
          {prev && (
            <button
              onClick={() => onNavigate(prev.sectionId, prev.article.id)}
              className="group flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              <div className="text-left">
                <p className="text-xs text-slate-400">Previous</p>
                <p className="font-medium">{prev.article.title}</p>
              </div>
            </button>
          )}
        </div>
        <div>
          {next && (
            <button
              onClick={() => onNavigate(next.sectionId, next.article.id)}
              className="group flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 transition-colors"
            >
              <div className="text-right">
                <p className="text-xs text-slate-400">Next</p>
                <p className="font-medium">{next.article.title}</p>
              </div>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ── FAQ view ──────────────────────────────────────────────────────────────────

function FAQView({ searchQuery }: { searchQuery: string }) {
  const q = searchQuery.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)
      ),
    })).filter((c) => c.items.length > 0);
  }, [q]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reference</p>
        <h1 className="text-2xl font-bold text-slate-900">Frequently Asked Questions</h1>
        <p className="text-slate-500">Quick answers to the most common questions.</p>
        <div className="mt-1 h-px bg-slate-100" />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">No matching questions found.</p>
      ) : (
        filtered.map((cat) => (
          <div key={cat.label}>
            <p className="mb-3 text-sm font-semibold text-slate-700">{cat.label}</p>
            <div className="rounded-lg border border-slate-200 bg-white px-6 shadow-sm">
              {cat.items.map((faq, i) => (
                <details
                  key={i}
                  className="group border-b border-slate-100 last:border-0"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium text-slate-800 hover:text-brand-600">
                    {faq.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <p className="pb-4 text-sm leading-relaxed text-slate-600">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [activeArticle, setActiveArticle] = useState("platform-overview");
  const [search, setSearch] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  function handleSelect(sectionId: string, articleId: string) {
    setActiveSection(sectionId);
    setActiveArticle(articleId);
    setSearch("");
  }

  // Resolve current article
  const currentEntry =
    activeSection === "faq"
      ? null
      : FLAT_ARTICLES.find(
          (f) => f.sectionId === activeSection && f.article.id === activeArticle
        ) ?? FLAT_ARTICLES[0];

  const currentIndex = currentEntry
    ? FLAT_ARTICLES.indexOf(currentEntry)
    : -1;

  const prevArticle = currentIndex > 0 ? FLAT_ARTICLES[currentIndex - 1] : null;
  const nextArticle =
    currentEntry && currentIndex < FLAT_ARTICLES.length - 1
      ? FLAT_ARTICLES[currentIndex + 1]
      : null;

  const currentSectionLabel =
    DOC_SECTIONS.find((s) => s.id === activeSection)?.label ?? "FAQ";

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-100 lg:flex lg:flex-col">
        <Sidebar
          activeSection={activeSection}
          activeArticle={activeArticle}
          onSelect={handleSelect}
          search={search}
          onSearchChange={setSearch}
        />
      </aside>

      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative z-10 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-700">Documentation</span>
              <button onClick={() => setMobileNavOpen(false)}>
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <Sidebar
              activeSection={activeSection}
              activeArticle={activeArticle}
              onSelect={handleSelect}
              search={search}
              onSearchChange={setSearch}
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
          <span className="text-sm text-slate-500 truncate">
            {activeSection === "faq" ? "FAQ" : currentEntry?.article.title}
          </span>
        </div>

        {/* Scrollable article */}
        <div className="flex-1 overflow-y-auto px-8 py-8 max-w-3xl w-full mx-auto">
          {activeSection === "faq" ? (
            <FAQView searchQuery={search} />
          ) : currentEntry ? (
            <ArticleView
              article={currentEntry.article}
              sectionLabel={currentSectionLabel}
              prev={prevArticle}
              next={nextArticle}
              onNavigate={handleSelect}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
