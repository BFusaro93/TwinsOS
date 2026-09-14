const SNIPPET = `curl https://your-org.landscapt.com/api/v1/jobs \\
  -H "Authorization: Bearer lsk_live_••••••••••••"

{
  "data": [
    {
      "id": "job_7a3d19",
      "client": "Riverside HOA",
      "type": "recurring",
      "status": "scheduled",
      "scheduled_date": "2026-09-02",
      "crew": "Crew B"
    }
  ]
}`;

export function LandscaptApiMockup() {
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
