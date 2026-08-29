"use client";

import { PageHeader } from "@/components/shared/PageHeader";
import { SalesMeetingsCalendar } from "@/components/crm/sales-meetings/SalesMeetingsCalendar";

export default function SalesMeetingsPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Sales Meetings"
        description="See where sales reps are booked, book new appointments, and link meetings to estimates or tickets"
      />
      <SalesMeetingsCalendar />
    </div>
  );
}
