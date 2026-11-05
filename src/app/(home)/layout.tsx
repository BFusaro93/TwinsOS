import { DisplaySizeApplier } from "@/components/shared/DisplaySizeApplier";
import { SettingsLoader } from "@/components/shared/SettingsLoader";
import { FeedbackButton } from "@/components/shared/FeedbackButton";
import { AskAIButton } from "@/components/shared/AskAIButton";
import { SupportChatWidget } from "@/components/shared/SupportChatWidget";
import { TrialLockGate } from "@/components/shared/TrialLockGate";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-background">
      <SettingsLoader />
      <DisplaySizeApplier />
      <TrialLockGate>{children}</TrialLockGate>
      <AskAIButton />
      <FeedbackButton />
      <SupportChatWidget />
    </div>
  );
}
