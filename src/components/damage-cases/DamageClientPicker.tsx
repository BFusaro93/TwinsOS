"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { ClientCombobox } from "@/components/shared/ClientCombobox";
import { useClients } from "@/lib/hooks/use-clients";

/**
 * Search-and-select for the damage case's customer. Selecting fills the
 * free-text name (and address, when blank) — damage_cases still stores the
 * name as text, so a customer who isn't a client can be typed in directly.
 */
export function DamageClientPicker({
  onPick,
}: {
  onPick: (client: { name: string; address: string }) => void;
}) {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  return (
    <div className="space-y-1.5">
      <Label>Find Client <span className="text-xs text-muted-foreground">(optional — or type the name below)</span></Label>
      <ClientCombobox
        clients={clients}
        value={clientId}
        onValueChange={(id) => {
          setClientId(id);
          const c = clients.find((x) => x.id === id);
          if (!c) return;
          const address = [c.billingAddress, c.billingCity, c.billingState].filter(Boolean).join(", ");
          onPick({ name: c.displayName, address });
        }}
        noneLabel="Search clients…"
      />
    </div>
  );
}
