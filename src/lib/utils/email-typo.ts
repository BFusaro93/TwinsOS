import { toast } from "sonner";

// Structural validity (isValidEmail) can't tell "jim@gmail.om" from a real
// address — .om is a real TLD. These maps catch the common keyboard slips and
// ask once; the user can still keep the address as typed by saving again.

const TLD_TYPOS: Record<string, string> = {
  om: "com", con: "com", cmo: "com", ocm: "com", vom: "com", xom: "com", coom: "com",
  comm: "com", cim: "com", cpm: "com", clm: "com", c0m: "com", cm: "com",
  nte: "net", ent: "net", met: "net", bet: "net",
  ogr: "org", rog: "org",
};

const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com",
  "gnail.com": "gmail.com", "gmail.co": "gmail.com", "gmaill.com": "gmail.com", "gmail.cm": "gmail.com",
  "yahooo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahho.com": "yahoo.com", "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotnail.com": "hotmail.com", "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com", "outloo.com": "outlook.com", "outlook.co": "outlook.com",
  "iclould.com": "icloud.com", "icoud.com": "icloud.com", "icloud.co": "icloud.com",
  "aol.con": "aol.com",
};

/** The corrected address if `email` looks like a common typo, otherwise null. */
export function suggestEmailFix(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  const fixedDomain = DOMAIN_TYPOS[domain];
  if (fixedDomain) return `${local}@${fixedDomain}`;
  const dot = domain.lastIndexOf(".");
  if (dot < 1) return null;
  const tld = domain.slice(dot + 1);
  const fixedTld = TLD_TYPOS[tld];
  return fixedTld ? `${local}@${domain.slice(0, dot)}.${fixedTld}` : null;
}

// Addresses we've already warned about this session — a second Save keeps them.
const warned = new Set<string>();

/** False (with a toast) the first time a likely-typo address is saved; true on
 *  the repeat save, or when the address looks fine. Empty values pass. */
export function confirmEmailNotTypo(...emails: Array<string | null | undefined>): boolean {
  for (const raw of emails) {
    const email = (raw ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (warned.has(key)) continue;
    const fix = suggestEmailFix(email);
    if (fix) {
      warned.add(key);
      toast.warning(`"${email}" looks like a typo. Did you mean ${fix}? Fix it, or save again to keep it as typed.`, { duration: 8000 });
      return false;
    }
  }
  return true;
}
