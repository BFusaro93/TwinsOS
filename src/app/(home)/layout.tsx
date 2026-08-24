import { SettingsLoader } from "@/components/shared/SettingsLoader";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <SettingsLoader />
      {children}
    </div>
  );
}
