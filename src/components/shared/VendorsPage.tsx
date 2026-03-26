"use client";

import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { PageHeader } from "./PageHeader";
import { FilterBar } from "./FilterBar";
import { VendorDetailSheet } from "./VendorDetailSheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getInitials, getAvatarColor, matchesIsActiveFilter } from "@/lib/utils";
import { useVendors } from "@/lib/hooks/use-vendors";
import { Skeleton } from "@/components/ui/skeleton";
import type { Vendor } from "@/types";
import { NewVendorDialog } from "./NewVendorDialog";

const STATUS_FILTER = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export function VendorsPage() {
  const { data: vendors, isLoading } = useVendors();
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newVendorOpen, setNewVendorOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});

  const filtered = (vendors ?? []).filter((v) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.contactName.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q);
    const statusFilter = filterValues.status;
    const matchStatus = matchesIsActiveFilter(v.isActive, statusFilter);
    return matchSearch && matchStatus;
  });

  function handleRowClick(vendor: Vendor) {
    setSelectedVendor(vendor);
    setSheetOpen(true);
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="Vendors"
        description="Manage your supplier and vendor contacts"
        action={
          <Button size="sm" onClick={() => setNewVendorOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Vendor
          </Button>
        }
      />

      {/* Stats */}
      <div className="flex gap-6 text-sm text-slate-500">
        <span>
          <span className="font-semibold text-slate-900">
            {(vendors ?? []).filter((v) => v.isActive).length}
          </span>{" "}
          active
        </span>
        <span>
          <span className="font-semibold text-slate-900">
            {(vendors ?? []).filter((v) => !v.isActive).length}
          </span>{" "}
          inactive
        </span>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[{ key: "status", placeholder: "All Statuses", options: STATUS_FILTER, multi: true }]}
        filterValues={filterValues}
        onFilterChange={(key, value) => setFilterValues((prev) => ({ ...prev, [key]: value }))}
        searchPlaceholder="Search vendors..."
      />

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12" />
              <TableHead>Vendor</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-500">No vendors found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              filtered.map((vendor) => (
                <TableRow
                  key={vendor.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleRowClick(vendor)}
                >
                  <TableCell>
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(vendor.name)}`}
                    >
                      {getInitials(vendor.name)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="text-slate-600">{vendor.contactName}</TableCell>
                  <TableCell className="text-slate-600">{vendor.email}</TableCell>
                  <TableCell className="text-slate-600">{vendor.phone}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        vendor.isActive
                          ? "border-green-200 bg-green-100 text-green-700"
                          : "border-slate-200 bg-slate-100 text-slate-500"
                      }
                    >
                      {vendor.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <VendorDetailSheet
        vendor={selectedVendor}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <NewVendorDialog open={newVendorOpen} onOpenChange={setNewVendorOpen} />
    </div>
  );
}
