export default function CrewChecklistPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Morning Crew Checklist</h1>
        <p className="text-sm text-muted-foreground">Complete before heading out each morning</p>
      </div>
      <div className="flex-1 min-h-0">
        <iframe
          src="https://forms.office.com/r/2iYh3Q2XSW"
          title="Morning Crew Checklist"
          className="w-full h-full border-0"
          allowFullScreen
        />
      </div>
    </div>
  );
}
