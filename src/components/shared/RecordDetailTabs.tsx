"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Tab {
  value: string;
  label: string;
  content: React.ReactNode;
}

interface RecordDetailTabsProps {
  tabs: Tab[];
  defaultValue?: string;
  className?: string;
}

export function RecordDetailTabs({
  tabs,
  defaultValue,
  className,
}: RecordDetailTabsProps) {
  return (
    <Tabs
      defaultValue={defaultValue ?? tabs[0]?.value}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <div className="border-b overflow-x-auto px-6">
        <TabsList className="h-10 min-w-max bg-transparent p-0">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-10 rounded-none border-b-2 border-transparent px-4 pb-0 pt-0 text-sm font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:text-brand-600 data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="mt-0 min-h-0 flex-1 overflow-auto"
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
