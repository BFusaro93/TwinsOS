// What a client-timeline entry calls a job: its type plus what it actually
// is — the package, or its services — so "Job cancelled" says which job.
// e.g. "Package · 5-Step Fert Package", "One time · Lawn Mowing, Edging".

const MAX_SERVICES = 3;

export function jobActivityLabel(job: {
  jobType: string | null | undefined;
  packageName?: string | null;
  serviceNames?: (string | null | undefined)[];
}): string {
  const type = (job.jobType ?? "job").replace(/_/g, " ");
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

  let what: string | null = job.packageName?.trim() || null;
  if (!what) {
    const names = [...new Set((job.serviceNames ?? []).map((n) => n?.trim()).filter((n): n is string => !!n))];
    if (names.length) {
      what = names.slice(0, MAX_SERVICES).join(", ");
      if (names.length > MAX_SERVICES) what += ` +${names.length - MAX_SERVICES} more`;
    }
  }
  return what ? `${typeLabel} · ${what}` : typeLabel;
}
