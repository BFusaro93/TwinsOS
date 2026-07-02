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

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 shrink-0">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.companyName} className="h-8 max-w-[120px] object-contain" />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: branding.accentColor }}>
                {branding.companyName.charAt(0)}
              </div>
            )}
            <span className="font-semibold text-slate-900 text-sm hidden sm:block">{branding.companyName}</span>
          </div>

          {/* Desktop nav tabs */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS
              .filter((item) => {
                if ("always" in item && item.always) return true;
                if ("key" in item && item.key === "allowEstimates") return branding.allowEstimates !== false;
                if ("key" in item && item.key === "allowTickets") return branding.allowTickets !== false;
                return true;
              })
              .map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    isActive(href)
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Support contacts */}
            {branding.supportPhone && (
              <a href={`tel:${branding.supportPhone}`} className="hidden sm:flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <Phone className="h-3.5 w-3.5" />
                {branding.supportPhone}
              </a>
            )}

            <button
              onClick={handleSignOut}
              className="hidden md:flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-md hover:bg-slate-50 transition"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-1">
            {NAV_ITEMS
              .filter((item) => {
                if ("always" in item && item.always) return true;
                if ("key" in item && item.key === "allowEstimates") return branding.allowEstimates !== false;
                if ("key" in item && item.key === "allowTickets") return branding.allowTickets !== false;
                return true;
              })
              .map(({ label, href, icon: Icon }) => (
                <a
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition ${
                    isActive(href)
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </a>
              ))}
            {branding.supportEmail && (
              <a href={`mailto:${branding.supportEmail}`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                <Mail className="h-4 w-4" />
                {branding.supportEmail}
              </a>
            )}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between text-xs text-slate-400">
          <span>© {new Date().getFullYear()} {branding.companyName}</span>
          <div className="flex items-center gap-3">
            {branding.supportEmail && (
              <a href={`mailto:${branding.supportEmail}`} className="hover:text-slate-600">{branding.supportEmail}</a>
            )}
            {branding.supportPhone && (
              <a href={`tel:${branding.supportPhone}`} className="hover:text-slate-600">{branding.supportPhone}</a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
