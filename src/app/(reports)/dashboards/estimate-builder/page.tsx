"use client";

export default function EstimateBuilderPage() {
  return (
    <div className="flex h-full flex-col">
      <iframe
        src="https://estimate-builder.pages.dev"
        className="flex-1 w-full border-0"
        allow="clipboard-write"
        title="Estimate Builder"
      />
    </div>
  );
}
