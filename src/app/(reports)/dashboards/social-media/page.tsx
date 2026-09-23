import { SocialMediaDashboard } from "@/components/operations/SocialMediaDashboard";

/** Social media tracker — weekly per-platform numbers entered by hand (built
 *  to replace Twins' Social Media Metrics Tracker spreadsheet). Available to
 *  every org; crew logins are blocked in (reports)/layout.tsx. */
export default function SocialMediaPage() {
  return <SocialMediaDashboard />;
}
