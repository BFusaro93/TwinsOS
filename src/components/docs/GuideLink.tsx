"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localizeGuideHref } from "@/lib/docs-guides";

/**
 * A cross-link from inside one guide to another. Guides are written with the
 * canonical "/settings/support/<slug>" href, but the same guide bodies render
 * in all three shells — so resolve the link against whichever shell the reader
 * is in, or a cross-link would bounce them out of Equipt/Landscapt and into the
 * Settings nav. Targets with no per-shell mount (e.g. the guide library) are
 * passed through unchanged.
 */
export function GuideLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <Link href={localizeGuideHref(href, pathname)} className={className}>
      {children}
    </Link>
  );
}
