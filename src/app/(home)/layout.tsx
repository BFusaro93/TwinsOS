import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { FeedbackButton } from "@/components/shared/FeedbackButton";
import { AskAIButton } from "@/components/shared/AskAIButton";
import { SupportChatWidget } from "@/components/shared/SupportChatWidget";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-background">
      <SettingsLoader />
      {children}
      <AskAIButton />
      <FeedbackButton />
      <SupportChatWidget />
    </div>
  );
}
