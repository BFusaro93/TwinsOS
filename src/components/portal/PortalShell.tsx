"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Home,
  CreditCard,
  CalendarDays,
  FileText,
  User,
  LogOut,
  Menu,
  X,
  Phone,
  Mail,
  Ticket,
  FolderOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Branding {
  companyName: string;
  logoUrl: string | null;
  accentColor: string;
  supportEmail: string | null;
  supportPhone: string | null;
  allowTickets?: boolean;
  allowEstimates?: boolean;
  allowDocuments?: boolean;
}

interface PortalShellProps {
  branding: Branding;
  clientName: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: "Home",      href: "/portal",           icon: Home,        always: true },
  { label: "Billing",   href: "/portal/billing",   icon: CreditCard,  always: true },
  { label: "Services",  href: "/portal/services",  icon: CalendarDays, always: true },
  { label: "Estimates", href: "/portal/estimates", icon: FileText,    key: "allowEstimates" },
  { label: "Tickets",   href: "/portal/tickets",   icon: Ticket,      key: "allowTickets" },
  { label: "Documents", href: "/portal/documents", icon: FolderOpen,  key: "allowDocuments" },
  { label: "Account",   href: "/portal/account",   icon: User,        always: true },
] as const;

export default function PortalShell({ branding, clientName, children }: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  function isActive(href: string) {
    if (href === "/portal") return pathname === "/portal";
    return pathname.startsWith(href);
  }

  const navItems = NAV_ITEMS.filter((item) => {
    if ("always" in item && item.always) return true;
    if ("key" in item && item.key === "allowEstimates") return branding.allowEstimates !== false;
    if ("key" in item && item.key === "allowTickets") return branding.allowTickets !== false;
    if ("key" in item && item.key === "allowDocuments") return branding.allowDocuments !== false;
    return true;
  });

  const initials = clientName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Nav */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30">
        <div className="h-1 bg-gradient-to-r from-brand-700 via-brand-500 to-brand-300" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
          {/* Brand */}
          <a href="/portal" className="flex items-center gap-3 shrink-0 min-w-0">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.companyName} className="h-9 max-w-[140px] object-contain" />
            ) : (
              <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: branding.accentColor }}>
                {branding.companyName.charAt(0)}
              </div>
            )}
            <div className="hidden sm:flex flex-col leading-tight min-w-0">
              <span className="font-semibold text-slate-900 text-sm truncate">{branding.companyName}</span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Client Portal</span>
            </div>
          </a>

          {/* Desktop nav tabs — lg, not md: seven tabs + account don't fit a tablet */}
          <nav className="hidden lg:flex items-center gap-0.5 rounded-xl bg-slate-100/70 p-1">
            {navItems.map(({ label, href, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive(href)
                    ? "bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive(href) ? "text-brand-600" : "text-slate-400"}`} />
                {label}
              </a>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {branding.supportPhone && (
              <a
                href={`tel:${branding.supportPhone}`}
                title="Call us"
                className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <Phone className="h-4 w-4 text-brand-600" />
                <span className="hidden xl:inline">{branding.supportPhone}</span>
              </a>
            )}

            <div className="hidden lg:flex items-center gap-2 border-l border-slate-200 pl-3">
              <a
                href="/portal/account"
                title="Account"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 ring-2 ring-white hover:ring-brand-200 transition"
              >
                {initials}
              </a>
              <button
                onClick={handleSignOut}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-1">
            {navItems.map(({ label, href, icon: Icon }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive(href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive(href) ? "text-brand-600" : "text-slate-400"}`} />
                {label}
              </a>
            ))}
            <div className="my-1 border-t border-slate-100" />
            {branding.supportPhone && (
              <a href={`tel:${branding.supportPhone}`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500">
                <Phone className="h-4 w-4" />
                {branding.supportPhone}
              </a>
            )}
            {branding.supportEmail && (
              <a href={`mailto:${branding.supportEmail}`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500">
                <Mail className="h-4 w-4" />
                {branding.supportEmail}
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {branding.companyName}</span>
          <div className="flex items-center gap-3">
            {branding.supportEmail && (
              <a href={`mailto:${branding.supportEmail}`} className="hover:text-slate-600">{branding.supportEmail}</a>
            )}
            {branding.supportPhone && (
              <a href={`tel:${branding.supportPhone}`} className="whitespace-nowrap hover:text-slate-600">{branding.supportPhone}</a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
