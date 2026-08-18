"use client";

import { useState } from "react";
import { User, MapPin, Phone, Plus, Loader2, Check, X, ChevronDown, CreditCard } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils/phone";
import { SavedPaymentMethodDialog } from "@/components/portal/SavedPaymentMethodDialog";
import { useRemovePortalPaymentMethod } from "@/lib/hooks/use-portal-saved-payment-method";

const CONTACT_TYPES = [
  "Owner",
  "Primary",
  "Spouse",
  "Property Manager",
  "District Manager",
  "Trustee/Board Member",
  "Employee",
  "Child",
  "Other",
];

const PHONE_TYPES = [
  { value: "cell", label: "Cell" },
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "fax", label: "Fax" },
  { value: "other", label: "Other" },
];

interface Client {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  saved_payment_method_type: string | null;
  saved_payment_method_summary: string | null;
}

interface Contact {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0 gap-4">
      <span className="text-sm text-slate-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-slate-800 text-right">{value ?? "—"}</span>
    </div>
  );
}

function PhoneEditor({ initial }: { initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/portal/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primary_phone: value.trim() || null }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setEditing(false); setTimeout(() => setSaved(false), 2000); }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between py-2.5 border-b border-slate-100 gap-4">
        <span className="text-sm text-slate-500 shrink-0 w-32">Phone</span>
        <div className="flex items-center gap-2">
          {saved && <Check className="h-3.5 w-3.5 text-green-500" />}
          <span className="text-sm text-slate-800">{value || "—"}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-brand-600 hover:underline shrink-0"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 gap-2">
      <span className="text-sm text-slate-500 shrink-0 w-32">Phone</span>
      <div className="flex items-center gap-1.5 flex-1">
        <input
          type="tel"
          value={value}
          onChange={(e) => setValue(formatPhoneNumber(e.target.value))}
          className="flex-1 h-7 rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          autoFocus
        />
        <button
          onClick={save}
          disabled={saving}
          className="h-7 px-2 rounded bg-brand-500 text-white text-xs flex items-center gap-1 hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        </button>
        <button onClick={() => { setEditing(false); setValue(initial ?? ""); }} className="h-7 w-7 rounded border border-slate-200 flex items-center justify-center hover:bg-slate-50">
          <X className="h-3 w-3 text-slate-400" />
        </button>
      </div>
    </div>
  );
}

function AddContactForm({ onAdded }: { onAdded: (c: Contact) => void }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneType, setPhoneType] = useState("cell");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) { setError("First name is required."); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/portal/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        phoneType: phone.trim() ? phoneType : undefined,
        role: role || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add contact."); return; }
    onAdded(data.contact);
    setOpen(false);
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setPhoneType("cell"); setRole("");
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline mt-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a contact
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-slate-800">New Contact</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">First name *</label>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Last name</label>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">Phone</label>
          <div className="flex items-center gap-1.5">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
              placeholder="(508) 123-4567"
              className="flex-1 h-8 rounded border border-slate-200 px-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <div className="relative shrink-0">
              <select
                value={phoneType}
                onChange={(e) => setPhoneType(e.target.value)}
                className="h-8 appearance-none rounded border border-slate-200 bg-white pl-2 pr-6 text-sm outline-none focus:ring-1 focus:ring-brand-500"
              >
                {PHONE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs text-slate-500">Contact Type</label>
          <div className="relative">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-8 appearance-none rounded border border-slate-200 bg-white px-2 pr-7 text-sm outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Select type…</option>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 h-8 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
        <button type="submit" disabled={saving} className="flex-1 h-8 rounded bg-brand-500 text-white text-xs font-medium hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-1">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save Contact
        </button>
      </div>
    </form>
  );
}

function PaymentMethodCard({
  initialSummary,
}: {
  initialSummary: string | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const removeMethod = useRemovePortalPaymentMethod();

  async function handleRemove() {
    setRemoving(true);
    try {
      await removeMethod.mutateAsync();
      setSummary(null);
    } catch {
      // Leave the current summary displayed — the request will show as failed via the button re-enabling.
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Payment Method</h2>
      </div>
      {summary ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-800">{summary}</span>
          <div className="flex gap-3">
            <button onClick={() => setDialogOpen(true)} className="text-xs text-brand-600 hover:underline">
              Update
            </button>
            <button onClick={handleRemove} disabled={removing} className="text-xs text-red-600 hover:underline disabled:opacity-50">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">No payment method on file.</span>
          <button onClick={() => setDialogOpen(true)} className="text-xs text-brand-600 hover:underline">
            Add
          </button>
        </div>
      )}
      <SavedPaymentMethodDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={(newSummary) => setSummary(newSummary)}
      />
    </div>
  );
}

export default function PortalAccountPage({
  client,
  email,
  contacts: initialContacts,
}: {
  client: Client | null;
  email: string;
  contacts: Contact[];
}) {
  const [contacts, setContacts] = useState(initialContacts);

  if (!client) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-slate-900">Account</h1>
        <p className="text-sm text-slate-400">Unable to load account information.</p>
      </div>
    );
  }

  const address = [client.billing_address, client.billing_city, client.billing_state, client.billing_zip]
    .filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-900">Account</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Contact info */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <User className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Contact Information</h2>
          </div>
          <Row label="Name" value={client.display_name} />
          <Row label="Login Email" value={email} />
          <Row label="Contact Email" value={client.primary_email} />
          <PhoneEditor initial={client.primary_phone} />
          <p className="text-xs text-slate-400 mt-3">
            To update your name or email, contact your service provider.
          </p>
        </div>

        {/* Billing address */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Billing Address</h2>
          </div>
          <p className="text-sm text-slate-700">{address || "No address on file."}</p>
        </div>

        <PaymentMethodCard initialSummary={client.saved_payment_method_summary} />
      </div>

      {/* Contacts */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Phone className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-700">Additional Contacts</h2>
        </div>

        {contacts.length === 0 ? (
          <p className="text-sm text-slate-400">No additional contacts on file.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {contacts.map((c) => (
              <li key={c.id} className="py-2.5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {c.first_name}{c.last_name ? ` ${c.last_name}` : ""}
                    {c.contact_type && <span className="ml-2 text-xs text-slate-400">· {c.contact_type}</span>}
                  </p>
                  <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <AddContactForm onAdded={(c) => setContacts((prev) => [...prev, c])} />
      </div>
    </div>
  );
}
