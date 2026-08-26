export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x="1" y="1" width="46" height="46" rx="11" fill="#005642" />
      <path d="M15,13 L15,32" stroke="#2aa9e0" strokeWidth="5.5" fill="none" strokeLinecap="round" />
      <path d="M15,32 L33,32" stroke="#60ab45" strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22,32 L33,20" stroke="#b7d433" strokeWidth="5.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
