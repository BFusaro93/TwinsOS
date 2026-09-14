import { GuideRoutePage, guideStaticParams } from "@/components/docs/GuideRoutePage";

export function generateStaticParams() {
  return guideStaticParams();
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GuideRoutePage slug={slug} />;
}
