"use client";

import { useState } from "react";
import { Search, Plus, UserRound } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ClientsList() {
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Clients"
        description="Manage residential and commercial client accounts"
        action={
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Client
          </Button>
        }
      />

      <div className="flex items-center gap-2 bg-[#4a4a4a] px-4 py-2 rounded-md">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="h-7 w-56 pl-8 text-sm bg-[#2a2a2a] border-[#5a5a5a] text-white placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <UserRound className="h-6 w-6 text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700">No clients yet</p>
          <p className="text-xs text-slate-500">Add your first client to get started</p>
        </div>
        <Button size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New Client
        </Button>
      </div>
    </div>
  );
}
