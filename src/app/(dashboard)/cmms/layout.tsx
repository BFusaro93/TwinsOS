import type { Metadata } from "next";
import { CMMSGate } from "./CMMSGate";

export const metadata: Metadata = {
  title: "Equipt",
};

export default function CMMSLayout({ children }: { children: React.ReactNode }) {
  return <CMMSGate>{children}</CMMSGate>;
}
