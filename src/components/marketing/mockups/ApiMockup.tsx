const SNIPPET = `curl https://your-org.landscapt.com/api/v1/work-orders \\
  -H "Authorization: Bearer lsk_live_••••••••••••"

{
  "data": [
    {
      "id": "wo_8f2c1a",
      "asset": "F-250 Service Truck — Unit 3",
      "status": "in_progress",
      "meter_reading": 41250,
      "parts": [{ "sku": "OIL-15W40", "qty": 6 }]
    }
  ]
}`;

export function ApiMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">REST API &amp; MCP</div>
        <span className="rounded border border-green-200 bg-green-100 px-1.5 py-0.5 text-[9px] font-medium text-green-800">
          Scoped key connected
        </span>
      </div>
      <pre className="overflow-x-auto rounded-md bg-[#0a0a0a] p-3 text-[10.5px] leading-relaxed text-[#d8f0dc]">
        <code>{SNIPPET}</code>
      </pre>
    </div>
  );
}
