/** Names the sub-account a portal row belongs to when a parent client's login
 * sees it (see getPortalAccounts). Renders nothing for the login's own rows. */
export function SubAccountLabel({ name }: { name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-block max-w-full truncate align-middle rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      {name}
    </span>
  );
}
