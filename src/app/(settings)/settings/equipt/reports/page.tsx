import { redirect } from "next/navigation";

// Equipt's operational reports (POs, work orders, parts, products) aren't
// settings — they now live in the Equipt shell at /equipt/reports, so the
// nav item stops dropping the reader into the Settings sidebar. This route
// stays behind purely to keep older links and bookmarks working.
export default function EquiptReportsSettingsRedirect() {
  redirect("/equipt/reports");
}
