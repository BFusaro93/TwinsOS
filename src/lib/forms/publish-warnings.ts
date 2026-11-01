// Things worth knowing before a form goes live. These never block publishing
// (a blank form or a notification-less form is a legitimate choice) — the
// publish confirm lists them so a mistake isn't discovered by the first real
// customer submission. Hard blockers (duplicate labels) live in duplicate-labels.ts.

const DISPLAY_ONLY = new Set(["header", "paragraph", "divider"]);

export interface PublishCheckField {
  fieldType: string;
  label: string;
  mappedField: string | null;
}

export interface PublishCheckForm {
  fields: PublishCheckField[];
  autoManageAccounts: boolean;
  settings: Record<string, unknown>;
}

export function formPublishWarnings(form: PublishCheckForm): string[] {
  const warnings: string[] = [];
  const inputs = form.fields.filter((f) => !DISPLAY_ONLY.has(f.fieldType));

  if (inputs.length === 0) {
    warnings.push("This form has no questions yet — visitors would see an empty form.");
  }

  const hasIdentity = inputs.some(
    (f) =>
      f.fieldType === "email" ||
      f.fieldType === "phone" ||
      (f.mappedField ?? "").endsWith(".email") ||
      (f.mappedField ?? "").endsWith(".phone")
  );
  if (form.autoManageAccounts && inputs.length > 0 && !hasIdentity) {
    warnings.push(
      "Account management is on, but no field collects an email or phone number — submissions can't be matched to or create client accounts."
    );
  }

  const notifications = (form.settings.emailNotifications ?? []) as { recipients?: string }[];
  if (notifications.some((n) => !n.recipients?.trim())) {
    warnings.push("An email notification has no recipients, so it will never send.");
  }

  const ticket = form.settings.ticket as { create?: boolean } | undefined;
  if (ticket?.create === false && !form.autoManageAccounts && notifications.length === 0) {
    warnings.push("Tickets are off, accounts aren't managed and no email notifications are set — nobody will be told about new submissions.");
  }

  return warnings;
}
