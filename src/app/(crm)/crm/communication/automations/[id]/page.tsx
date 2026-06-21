import { AutomationBuilder } from "@/components/crm/automations/AutomationBuilder";

export default async function AutomationBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AutomationBuilder automationId={id} />;
}
