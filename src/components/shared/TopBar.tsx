"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, PanelLeftClose, Plus, Search, UserCog } from "lucide-react";
import { useUIStore, useCurrentUserStore, useQuickAddStore } from "@/stores";
import type { QuickAddType } from "@/stores/quick-add-store";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GlobalSearchDialog } from "@/components/shared/GlobalSearchDialog";
import { NotificationsBell } from "@/components/shared/NotificationsBell";
import { EditProfileDialog } from "@/components/shared/EditProfileDialog";
import { HelpMenu } from "@/components/shared/HelpMenu";
import { ImpersonationBanner } from "@/components/shared/ImpersonationBanner";
import { SupportChatWidget } from "@/components/shared/SupportChatWidget";
import { useUsers } from "@/lib/hooks/use-users";
import { useSyncCurrentUser } from "@/lib/hooks/use-current-user";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  technician: "Technician",
  purchaser: "Purchaser",
  viewer: "Viewer",
  requestor: "Requestor",
  crew: "Crew",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  manager: "bg-blue-100 text-blue-700 border-blue-200",
  technician: "bg-green-100 text-green-700 border-green-200",
  purchaser: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
  requestor: "bg-slate-100 text-slate-600 border-slate-200",
  crew: "bg-orange-100 text-orange-700 border-orange-200",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function useBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    po: "Purchasing",
    orders: "Purchase Orders",
    requisitions: "Requisitions",
    receiving: "Receiving",
    products: "Products",
    projects: "Projects",
    cmms: "Maintenance",
    "work-orders": "Work Orders",
    requests: "Requests",
    "pm-schedules": "PM Schedules",
    vehicles: "Vehicles",
    assets: "Assets",
    parts: "Parts Inventory",
    meters: "Meters",
    automations: "Automations",
    vendors: "Vendors",
    settings: "Settings",
    users: "Users & Roles",
    notifications: "Notifications",
    "approval-flows": "Approval Flows",
    reports: "Reports",
    support: "Support",
    photos: "Photo Docs",
    jobs: "Job Photos",
    dashboards: "Dashboards",
    home: "Home",
  };

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  return segments.map((seg) => {
    if (UUID_RE.test(seg)) return "Job Details";
    return labels[seg] ?? seg;
  });
}

const CRM_QUICK_ADD: { label: string; quickAdd: QuickAddType }[] = [
  { label: "Client",   quickAdd: "client" },
  { label: "Estimate", quickAdd: "estimate" },
  { label: "Ticket",   quickAdd: "ticket" },
  { label: "Invoice",  quickAdd: "invoice" },
  { label: "Payment",  quickAdd: "payment" },
];

const EQUIPT_QUICK_ADD: { label: string; quickAdd: QuickAddType }[] = [
  { label: "Requisition",    quickAdd: "requisition" },
  { label: "Purchase Order", quickAdd: "purchase_order" },
  { label: "Work Order",     quickAdd: "work_order" },
  { label: "Vendor",         quickAdd: "vendor" },
];

const CREW_QUICK_ADD: { label: string; quickAdd: QuickAddType }[] = [
  { label: "Requisition", quickAdd: "requisition" },
  { label: "Work Order",  quickAdd: "work_order" },
];

function QuickAddMenu() {
  const pathname = usePathname();
  const { currentUser } = useCurrentUserStore();
  const { open: openQuickAdd } = useQuickAddStore();
  const isCRM = pathname.startsWith("/crm");

  const items = currentUser.role === "crew"
    ? CREW_QUICK_ADD
    : isCRM
      ? CRM_QUICK_ADD
      : EQUIPT_QUICK_ADD;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          className="h-8 w-8 shrink-0 rounded-full bg-brand-500 text-white hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Plus className="h-3 w-3" /> Quick Add
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => (
          <DropdownMenuItem key={item.label} onSelect={() => openQuickAdd(item.quickAdd!)}>
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TopBar() {
  const { toggleSidebar, setSidebarOpen } = useUIStore();
  const { currentUser, setCurrentUser } = useCurrentUserStore();
  const { data: orgUsers = [] } = useUsers();
  const breadcrumbs = useBreadcrumbs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();

  // Sync the currentUser store with the live Supabase session on mount
  useSyncCurrentUser();

  return (
    <>
    <EditProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    <ImpersonationBanner />
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-white px-4">
      {/* Mobile hamburger — opens sidebar drawer */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setSidebarOpen(true)}
        className="shrink-0 text-slate-500 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>
      {/* Desktop collapse toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="hidden shrink-0 text-slate-500 md:inline-flex"
      >
        <PanelLeftClose className="h-5 w-5" />
      </Button>

      {/* Breadcrumbs */}
      <nav className="hidden items-center gap-1 text-sm text-slate-500 sm:flex lowercase">
        {breadcrumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300">/</span>}
            <span
              className={cn(
                i === breadcrumbs.length - 1
                  ? "font-medium text-slate-800"
                  : "text-slate-500"
              )}
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {/* Search */}
      <div className="relative ml-auto hidden max-w-xs flex-1 sm:block">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="Search… (⌘K)"
          readOnly
          onClick={() => setSearchOpen(true)}
          className="h-8 cursor-pointer bg-slate-50 pl-8 text-sm"
        />
      </div>

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Quick Add */}
      <QuickAddMenu />

      <HelpMenu />

      {/* Notifications — hidden for crew users (they only need photo access, not CMMS/PO alerts) */}
      {currentUser.role !== "crew" && <NotificationsBell />}

      {/* User avatar + switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-brand-500 text-xs text-white">
                {initials(currentUser.name)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              <p className="font-medium">{currentUser.name}</p>
              <Badge
                variant="outline"
                className={cn("w-fit text-[10px]", ROLE_COLORS[currentUser.role])}
              >
                {ROLE_LABELS[currentUser.role]}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* Switch user — admin only */}
          {currentUser.role === "admin" && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserCog className="mr-2 h-4 w-4 text-slate-400" />
                <span>Switch User</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-slate-400">
                  Simulate a different role
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={currentUser.id}
                  onValueChange={(id) => {
                    const user = orgUsers.find((u) => u.id === id);
                    if (user) setCurrentUser(user);
                  }}
                >
                  {orgUsers.map((u) => (
                    <DropdownMenuRadioItem key={u.id} value={u.id}>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{u.name}</span>
                        <span className="text-xs text-slate-400 capitalize">{u.role}</span>
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>Profile</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600"
            onSelect={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              router.push("/login");
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
    <SupportChatWidget />
    </>
  );
}
