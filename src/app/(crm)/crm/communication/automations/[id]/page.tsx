import { AutomationBuilder } from "@/components/crm/automations/AutomationBuilder";

export default function AutomationBuilderPage({ params }: { params: { id: string } }) {
  return <AutomationBuilder automationId={params.id} />;
}
