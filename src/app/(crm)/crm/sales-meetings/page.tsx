"use client";

import { Suspense } from "react";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";

import { PageHeader } from "@/components/shared/PageHeader";
import { SalesMeetingsCalendar } from "@/components/crm/sales-meetings/SalesMeetingsCalendar";

export default function SalesMeetingsPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  if (!permissionsLoading && !can("sales_meeting_list")) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No access"
        description="You don't have permission to view Sales Meetings."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Sales Meetings"
        description="See where sales reps are booked, book new appointments, and link meetings to estimates or tickets"
      />
      {/* The calendar reads the `?open=` deep link via useSearchParams, which
          needs a Suspense boundary above it or the production build fails. */}
      <Suspense>
        <SalesMeetingsCalendar />
      </Suspense>
    </div>
  );
}
