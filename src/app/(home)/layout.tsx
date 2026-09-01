import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { FeedbackButton } from "@/components/shared/FeedbackButton";
import { AskAIButton } from "@/components/shared/AskAIButton";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <SettingsLoader />
      {children}
      <AskAIButton />
      <FeedbackButton />
    </div>
  );
}
