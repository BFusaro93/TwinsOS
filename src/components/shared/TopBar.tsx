"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, Search, UserCog } from "lucide-react";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { cn } from "@/lib/utils";
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
import { useUsers } from "@/lib/hooks/use-users";
import { useSyncCurrentUser } from "@/lib/hooks/use-current-user";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  technician: "Technician",
  purchaser: "Purchaser",
  viewer: "Viewer",
  requestor: "Requestor",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 border-purple-200",
  manager: "bg-blue-100 text-blue-700 border-blue-200",
  technician: "bg-green-100 text-green-700 border-green-200",
  purchaser: "bg-amber-100 text-amber-700 border-amber-200",
  viewer: "bg-slate-100 text-slate-600 border-slate-200",
  requestor: "bg-slate-100 text-slate-600 border-slate-200",
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
  };

  return segments.map((seg) => labels[seg] ?? seg);
}

export function TopBar() {
  const { toggleSidebar, setSidebarOpen } = useUIStore();
  const { currentUser, setCurrentUser } = useCurrentUserStore();
  const { data: orgUsers = [] } = useUsers();
  const breadcrumbs = useBreadcrumbs();
  const [searchOpen, setSearchOpen] = useState(false);

  // Sync the currentUser store with the live Supabase session on mount
  useSyncCurrentUser();

  return (
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
      <nav className="hidden items-center gap-1 text-sm text-slate-500 sm:flex">
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

      {/* Notifications */}
      <NotificationsBell />

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

          {/* Switch user for demo/prototype */}
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

          <DropdownMenuSeparator />
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-600">Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
