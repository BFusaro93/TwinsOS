export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}
