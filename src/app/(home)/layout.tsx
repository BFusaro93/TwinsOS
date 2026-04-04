export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-slate-50">{children}</div>;
}
