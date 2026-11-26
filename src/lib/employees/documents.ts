/** Kinds of document kept on an employee's Files tab (attachments.document_type). */
export const EMPLOYEE_DOCUMENT_TYPES = [
  { value: "drivers_license", label: "Driver's License" },
  { value: "dot_medical_card", label: "DOT Medical Card" },
  { value: "hoisting_license", label: "Hoisting License" },
  { value: "i9", label: "I-9" },
  { value: "other", label: "Other" },
] as const;

export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENT_TYPES)[number]["value"];

export function employeeDocumentLabel(value: string | null | undefined): string {
  return EMPLOYEE_DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? "Other";
}
