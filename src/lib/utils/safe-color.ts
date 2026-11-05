/**
 * A stored colour that is interpolated into an HTML `style` attribute must be a
 * plain hex value: template/brand colours are org-editable text, and a value
 * like `#fff"><a href=...>` would otherwise inject markup into client email.
 */
export function safeHexColor(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) ? v : fallback;
}
