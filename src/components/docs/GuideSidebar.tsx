"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { groupedDocGuides, DOC_GUIDE_GROUP_ICONS } from "@/lib/docs-guides";

/**
 * Persistent sidebar for the advanced-guides area (Docs landing pages +
 * every individual guide page under settings/support/(guides)) — lists all
 * guides grouped by category, highlights the guide matching the current
 * route, and supports a lightweight text filter. Styled to match the
 * collapsible, icon-led sidebar on the Support page.
 */
export function GuideSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const q = search.trim().toLowerCase();
  const groups = groupedDocGuides();
  const filtered = q
    ? groups
        .map((g) => ({
          ...g,
          guides: g.guides.filter(
            (guide) =>
              guide.title.toLowerCase().includes(q) || guide.description.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.guides.length > 0)
    : groups;

  function toggleGroup(kicker: string) {
    setCollapsed((prev) => ({ ...prev, [kicker]: !prev[kicker] }));
  }

  function isGroupOpen(kicker: string) {
    if (q) return true;
    return collapsed[kicker] !== true;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search guides…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {filtered.map((group) => {
          const GroupIcon = DOC_GUIDE_GROUP_ICONS[group.kicker];
          const open = isGroupOpen(group.kicker);
          return (
            <div key={group.kicker} className="mb-1">
              <button
                onClick={() => toggleGroup(group.kicker)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-100 transition-colors"
              >
                {GroupIcon && <GroupIcon className="h-3.5 w-3.5 shrink-0" />}
                <span className="flex-1 text-left">{group.kicker}</span>
                <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
              </button>
              {open && (
                <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-slate-100 pl-3">
                  {group.guides.map((guide) => {
                    const GuideIcon = guide.icon;
                    const href = `/settings/support/${guide.slug}`;
                    const active = pathname === href;
                    return (
                      <Link
                        key={guide.slug}
                        href={href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                          active
                            ? "bg-[#eef4e2] text-[#396927] font-medium"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                        )}
                      >
                        <GuideIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate">{guide.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-sm text-slate-400">No guides match &ldquo;{search}&rdquo;.</p>
        )}
      </nav>
    </div>
  );
}
