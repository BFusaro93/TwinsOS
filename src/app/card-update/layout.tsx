import type { Metadata } from "next";
import type { ReactNode } from "react";

// A private, one-time link: never indexed, never followed, never referred onward.
export const metadata: Metadata = {
  title: "Update your card",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CardUpdateLayout({ children }: { children: ReactNode }) {
  return children;
}
