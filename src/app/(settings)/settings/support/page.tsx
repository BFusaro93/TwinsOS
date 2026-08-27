import Link from "next/link";
import { BookOpen } from "lucide-react";
import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { SupportPage } from "@/components/settings/SupportPage";

export default function MasterSettingsSupportPage() {
  return (
    <DocsFontScope className="flex flex-col gap-8 pb-12">
      <DocsHero
        kicker="Support"
        title="How can we help?"
        description="Browse guides, search the FAQ, or get in touch with our team."
        hideDownload
        action={
          <Link
            href="/settings/docs"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Advanced Guides
          </Link>
        }
      />
      <SupportPage docsHref="/settings/docs" />
    </DocsFontScope>
  );
}
