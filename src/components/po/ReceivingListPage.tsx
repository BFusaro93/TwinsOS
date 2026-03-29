"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceivingListPanel } from "./ReceivingListPanel";
import { ReceivingDetailPanel } from "./ReceivingDetailPanel";
import { useGoodsReceipts } from "@/lib/hooks/use-goods-receipts";
import { usePOStore } from "@/stores";
import { Skeleton } from "@/components/ui/skeleton";

export function ReceivingListPage() {
  const { data: receipts, isLoading } = useGoodsReceipts();
  const { selectedReceiptId, setSelectedReceiptId } = usePOStore();
  const [search, setSearch] = useState("");

  const filtered = (receipts ?? []).filter((r) => {
    const q = search.toLowerCase();
    return (
      !q ||
      r.receiptNumber.toLowerCase().includes(q) ||
      r.vendorName.toLowerCase().includes(q) ||
      r.poNumber.toLowerCase().includes(q)
    );
  });

  const selectedReceipt =
    filtered.find((r) => r.id === selectedReceiptId) ?? null;

  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[]}
          filterValues={{}}
          onFilterChange={() => {}}
          searchPlaceholder="Search receipts..."
        />
      </div>
      <ReceivingListPanel
        receipts={filtered}
        selectedId={selectedReceiptId}
        onSelect={setSelectedReceiptId}
      />
    </>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Receiving"
        description="Goods receipts and delivery records"
      />

      <MasterDetailLayout
        listPanel={listPanel}
        detailPanel={
          selectedReceipt ? <ReceivingDetailPanel receipt={selectedReceipt} /> : null
        }
        emptyState={
          <EmptyState
            icon={PackageCheck}
            title="Select a receipt"
            description="Choose a goods receipt to view delivery details and line items."
          />
        }
        hasSelection={!!selectedReceipt}
        onBack={() => setSelectedReceiptId(null)}
      />
    </div>
  );
}
