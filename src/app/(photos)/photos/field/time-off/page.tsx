export default function TimeOffRequestPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Time Off Request</h1>
        <p className="text-sm text-muted-foreground">Submit a request for time away from work</p>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          src="https://forms.office.com/r/zpNj8KFqem"
          title="Time Off Request"
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  );
}
