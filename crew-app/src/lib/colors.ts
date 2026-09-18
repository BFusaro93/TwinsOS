/**
 * Matches the web crew pages' actual Tailwind palette (src/app/(crm)/crm/
 * crew/page.tsx and .../stops/[visitId]/page.tsx) — kept in sync by hand,
 * same as the login screen's brand colors, since this app has no shared
 * Tailwind config with the web app.
 */
export const C = {
  bg: '#f8fafc',
  card: '#ffffff',
  border: '#e2e8f0',
  headerBorder: '#f1f5f9',
  text: '#1e293b',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  green: '#16a34a',
  greenBg: '#f0fdf4',
  greenBorder: '#bbf7d0',
  greenText: '#166534',
  amberBg: '#fffbeb',
  amberBorder: '#fde68a',
  amberText: '#92400e',
  amberTextStrong: '#b45309',
  blue: '#2563eb',
  blueBg: '#eff6ff',
  blueBorder: '#bfdbfe',
  blueText: '#1d4ed8',
  red: '#dc2626',
  redBg: '#fef2f2',
  redBorder: '#fecaca',
  redText: '#b91c1c',
} as const;
