# Zapier Integration — User Guide

Equipt + Landscapt connects to Zapier so you can automate work between
this platform and 9,000+ other apps — Slack, Google Sheets, QuickBooks,
Twilio, email, and anything else Zapier supports. This guide explains what's
available, how to connect, and exactly what each trigger and action does.

## Connecting

1. Go to **Master Account Settings → Integrations**. (Not Equipt Settings or
   Landscapt Settings — the Zapier connection is account-wide and works
   whether or not your plan includes Equipt.)
2. Click **Generate Key**. Copy the key shown — it's only displayed once.
3. In Zapier, when connecting the Equipt/Landscapt app, paste that key into
   the API Key field.
4. Clicking **Regenerate** at any time invalidates the old key immediately —
   any Zaps still using it will need to be reconnected with the new one.

The key is tied to your organization, not to an individual user — anything a
Zap does happens as your org, scoped only to your org's data.

## How triggers work

Every trigger below supports two delivery methods, and you don't have to
choose — Zapier handles this automatically:

- **Instant (REST Hook)** — when you turn on a Zap, Zapier registers a
  webhook URL with us. The moment the event happens, we POST
  the event data straight to that URL. This is how *most* triggers work.
- **Polling (fallback)** — Zapier also periodically calls our API directly
  to check for new matching records. This is what powers the "Test" step
  when you're setting up a Zap, and it's the *only* delivery method for a
  few triggers noted below, where there's no natural "moment it happened" to
  hook into.

---

## Landscapt / CRM triggers

These fire on customer and job lifecycle events.

| Trigger | Fires when… |
|---|---|
| **New Client** | A client record is created. |
| **New Lead** | A client is created with status "lead" (before they've converted). |
| **Lead Converted to Client** | A lead's status changes to "active." |
| **Client Cancelled** | A client's status changes to "cancelled." |
| **New Estimate** | An estimate is created. |
| **Estimate Won** | An estimate's stage changes to "won." |
| **Estimate Lost** | An estimate's stage changes to "lost." |
| **New Job** | A job (recurring, one-time, snow, project, etc.) is created. |
| **New Ticket** | A support/service ticket is created. |
| **Ticket Closed** | A ticket's status changes to "closed." |
| **New Invoice** | An invoice is created. |
| **Invoice Paid** | An invoice's status changes to "paid." |
| **Contract Signed** | A contract's `signed_at` timestamp is set. |
| **New Damage Case** | A damage case is logged. |
| **Visit Dispatched** | A scheduled job visit is dispatched to a crew. |

All of these are instant (REST Hook) — they piggyback on the same internal
event dispatch that already runs the "automations" (sequences) feature in
Landscapt, so a Zap fires at the same moment an internal automation would.

---

## Equipt triggers

These fire on asset, maintenance, and procurement events. Equipt has no
single internal "event happened" dispatcher the way Landscapt does — most of
these mutations write straight to the database from the browser — so most of
this list is **polling-only**, and two get instant delivery because they
happen to already round-trip through a server route for an unrelated reason
(Equipt's own internal automations feature).

| Trigger | Fires when… | Delivery |
|---|---|---|
| **New Asset** | An asset (vehicle, equipment) is added. | Polling |
| **New Work Order** | A work order is created. | Polling |
| **Work Order Completed** | A work order's status changes to "done." | **Instant** |
| **New Requisition** | A purchase requisition is created. | Polling |
| **New Purchase Order** | A PO is created. | Polling |
| **PO Approved** | A PO's status changes to "approved." | **Instant** |
| **PM Schedule Due** | A preventive-maintenance schedule's next-due date has passed (and it's still active). | Polling |
| **Part Low Stock** | A part's quantity on hand drops to or below its minimum stock level. | Polling |
| **New Vendor** | A vendor is added. | Polling |
| **Meter Threshold** | A tracked meter (odometer, engine hours, etc.) crosses a value you choose. | Polling |

Polling-only just means the Zap checks in every few minutes instead of firing
the instant the event happens — for most of these use cases (low stock, PM
due, new vendor) that's not a meaningful difference. If instant delivery for
more of these matters to you, let us know which ones — most just need a
small addition on our end to fire at the point the event happens.

### Meter Threshold — how it works

Unlike the other Equipt triggers, this one is *parameterized* — you tell
Zapier what to watch for when you set up the Zap, rather than it always
meaning one fixed thing:

- **Which meter** — pick a specific meter (e.g. "Truck #4 — Odometer"), or
  leave it blank to check every meter in your org.
- **Threshold** — the number to compare against (e.g. `50000`).
- **Direction** — "at least" (≥, the default) or "at most" (≤).

Example: "Truck #4's odometer reaches 50,000 miles" → meter = Truck #4
Odometer, threshold = 50000, direction = at least. Zapier checks this every
poll; the moment the meter's current value crosses that line, the Zap fires.

This is separate from the meter-threshold automations you might already have
configured inside Equipt itself (Settings → Approval Flows / Automations) —
those run their own actions (create a work order, send a notification) and
aren't affected by anything you set up in Zapier.

---

## Actions (things a Zap can create in Equipt + Landscapt)

| Action | Creates | Required fields | Optional fields |
|---|---|---|---|
| **Create Client** | A new client (Landscapt) | Display Name | First/Last Name, Email, Phone, Account Type (residential/commercial), Source, Service Address/City/State/Zip |
| **Create Ticket** | A support ticket, attached to a client | Client, Subject | Body, Priority (low/normal/high/urgent), Category, Type, Due Date |
| **Add Note to Client** | An entry on a client's activity timeline | Client, Note text | Subject |
| **Create Work Order** | An Equipt work order | Title | Asset, Description, Priority, Type, Due Date |
| **Create Requisition** | An Equipt purchase requisition (starts as a draft) | Title | Vendor, linked Work Order, Notes |

A "Create Job" action for Landscapt jobs also exists (job type, client,
scheduled date) if you need to schedule work directly from a Zap.

Every action validates that any client/vendor/work-order/asset ID you pass in
actually belongs to your org before creating anything — a Zap can't
accidentally write into another company's account.

---

## Questions this doesn't answer yet

- **Custom fields** — actions only accept the fields listed above; if you
  need to set something else (a custom field, a specific GL code, etc.) when
  a Zap creates a record, ask and we can add it.
- **Update actions** — right now Zaps can only *create* new records, not
  update existing ones (e.g. "update ticket status from a Zap"). Let us know
  if that's something you need.
- **More instant triggers** — see the note under the Equipt table above; a few
  more of those could become instant with a small change if it matters for
  your workflow.
