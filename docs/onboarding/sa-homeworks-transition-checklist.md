# Switching to Landscapt: Transition Checklist
### For companies moving from Service Autopilot or Homeworks

Work top to bottom. Items marked **YOU** are things we need from you. Items marked **US** are things we do once we have your files. Don't worry if you can't get everything. Send what you have and we'll tell you what's missing.

**Rule of thumb:** Export to **CSV** wherever the old system lets you. If an export isn't available, a PDF or screenshot of the report is still useful to us.

---

## 0. Before you start (about 15 min)

- [ ] **YOU:** Keep your old system **active and read-only** until we confirm your data looks right. Don't cancel it yet. Most systems lock you out of exports after cancellation.
- [ ] **YOU:** Pick one **point person** at your company for questions during the transition.
- [ ] **YOU:** Pick a **go-live date**. Ideally the start of a billing cycle or a slow week, not mid-route-run.
- [ ] **YOU:** Make sure you have an **admin login** to your old system so you can run the exports below.
- [ ] **YOU:** Tell us which system you're coming from (Service Autopilot or Homeworks) and roughly how many clients, employees, and crews you have.

---

## 1. Company info and settings

- [ ] **YOU:** Company name, logo (PNG or SVG), address, phone, email, website
- [ ] **YOU:** Your **time zone** and typical **service season** (start and end dates)
- [ ] **YOU:** Your **invoice settings**: invoice number format (and the **next invoice number** so numbering continues), payment terms (Net 15, Net 30), late-fee rules, and any standard invoice footer or notes
- [ ] **YOU:** **Sales tax** rates and which services are taxable
- [ ] **YOU:** Your **client account number format** (and the next number to use, so new clients don't collide with existing ones)

---

## 2. Your team

- [ ] **YOU:** **Employee list** (CSV): first name, last name, email, phone, date hired, resource or employee code, hourly rate
- [ ] **YOU:** Which employees are **office/admin vs. field crew**, and who should be an admin, manager, or crew member
- [ ] **YOU:** **Crew list**: crew names, who is on each crew, who the crew lead is, and each crew's usual days and truck or equipment
- [ ] **YOU:** Each employee's **burdened labor rate** (wages plus taxes and benefits), if you want accurate job costing. If you don't know it, your payroll provider can help.
- [ ] **US:** Create logins and permission roles for your office staff and crews

---

## 3. Clients and properties

- [ ] **YOU:** **Full client export** (CSV). Please include:
  - Client name (first and last, and company name for commercial)
  - Account number
  - Residential or commercial
  - Status (active, inactive, lead, cancelled)
  - Primary phone and email, billing email
  - Billing address and service address
  - Client-since date
  - Tags or categories
  - Notes for crews (gate codes, dogs, access instructions)
  - Parent account, for property managers with multiple sites
- [ ] **YOU:** **Leads** list (separate CSV) if you track leads in the old system
- [ ] **YOU:** Mark which clients are **do-not-email** or **do-not-text**, and any **bounced emails** you already know about
- [ ] **YOU:** **Property measurements** (turf sq ft, bed sq ft, and so on) if you have them. A spreadsheet with address plus measurements is fine.
- [ ] **US:** Import clients, link parent and sub-accounts, and flag duplicates for you to review

> Tip: Don't worry about cleaning the file first. Send it as-is and we'll tell you what needs fixing. If a cell holds several email addresses, we import the first and flag the row.

---

## 4. Services and pricing

- [ ] **YOU:** **Service list** (CSV): service name, code, category, unit (visit, sq ft, hour, each), default rate
- [ ] **YOU:** **Production rates** (sq ft per man-hour) for each service, if you estimate by production rate
- [ ] **YOU:** **Package and program definitions**, such as 7-step fertilizer, gold maintenance, or snow seasonal. Include what's in each package, the number of visits, and the monthly price.
- [ ] **YOU:** Your **current price list**, including any bulk or tiered pricing
- [ ] **US:** Set up your service catalog, packages, and pricing

---

## 5. Recurring work and contracts

- [ ] **YOU:** **Recurring job and schedule export** showing, for each client or property: services, frequency (weekly, bi-weekly, every 4 weeks, monthly), day of week, season start and end, price, and the assigned crew
- [ ] **YOU:** **Route order**: the usual stop order for each crew and weekday
- [ ] **YOU:** **Contracts export**: client, contract name or title, start and end dates, monthly amount, billing frequency, billing day, and status (active or expired)
- [ ] **YOU:** For each active contract, **the last period you billed**. This is the most important item here, so we don't double-bill or skip a month.
- [ ] **YOU:** Signed contract PDFs, if you want them attached to client records
- [ ] **YOU:** **One-time and waiting-list jobs** that are scheduled or pending, with the date range for each
- [ ] **US:** Build schedules and jobs, assign crews, and rebuild route order for review
- [ ] **US:** Set contracts to active only once you confirm the billing period, so nothing bills early

---

## 6. Money: invoices, payments, and balances

- [ ] **YOU:** **Open invoices (A/R aging)** as of your cutover date, per client
- [ ] **YOU:** **Invoice history** (CSV). Ideally the current year plus last year: invoice number, client, date, due date, service, amount, discount, tax, status
- [ ] **YOU:** **Payment history** (CSV): client, amount, date, method, check or reference number, and which invoice it applied to
- [ ] **YOU:** **Unapplied credits and prepayments**: money clients have paid that hasn't been applied to an invoice
- [ ] **YOU:** **Client statements** for any accounts you plan to dispute or reconcile
- [ ] **YOU:** **Cutover date**: the last day invoices are created in the old system. After that date, new invoices come from Landscapt.
- [ ] **US:** Import invoices and payments (re-running a file will never double-bill), then reconcile balances against your A/R report. The totals should match to the penny.

> Pick one clean cutover date and don't invoice in both systems after it. That's the single biggest source of confusion we see.

---

## 7. Credit cards and online payments

- [ ] **YOU:** Tell us which processor holds your saved cards (**Stripe, Authorize.net, or another**).
- [ ] **YOU:** **Stripe:** connect your Stripe account to Landscapt (we'll walk you through it). Saved cards stay in Stripe, and we match them to clients by email.
- [ ] **YOU:** **Any other processor:** ask the processor about a **token or card-on-file migration**. Card numbers can't be exported in a spreadsheet, and we never handle them. Clients may need to re-enter a card on a new link we send.
- [ ] **YOU:** List which clients are on **autopay**.
- [ ] **US:** Match saved payment methods to clients and turn autopay back on where it was on

---

## 8. Estimates and sales pipeline

- [ ] **YOU:** **Open estimates** (CSV): client, description, date, amount, stage, salesperson, probability
- [ ] **YOU:** Your **estimate templates** and standard terms wording (PDF or Word)
- [ ] **YOU:** **Overhead, margin, and labor burden** targets, if you use budget-based estimating
- [ ] **US:** Import open estimates and build your estimate templates

---

## 9. Equipment, vehicles, and maintenance (Equipt)

*Skip this section if you're not using Equipt.*

- [ ] **YOU:** **Equipment and vehicle list**: name or asset tag, make, model, year, serial or VIN, license plate, location, status
- [ ] **YOU:** **Maintenance schedules** (oil changes, blade sharpening, inspections): what, which asset, how often
- [ ] **YOU:** **Open and recent work orders** and repair history
- [ ] **YOU:** **Parts and supplies list**: part number, description, unit cost, quantity on hand, minimum stock, vendor, location
- [ ] **YOU:** **Vendor list**: name, contact, phone, email, address, and what they supply
- [ ] **YOU:** Open **purchase orders**, if any are still outstanding

---

## 10. Chemical and compliance records

*Skip this section if you don't apply chemicals.*

- [ ] **YOU:** **Application history**: date, client or property, product, EPA registration number, amount applied, applicator, and license number
- [ ] **YOU:** **Chemical product list**: product names, EPA numbers, units, and cost
- [ ] **YOU:** **Applicator license** details and expiration dates
- [ ] **YOU:** Any **state-required reports** you must produce, so we can confirm we cover them

---

## 11. Snow operations

*Skip this section if you don't plow or salt.*

- [ ] **YOU:** **Snow client and site list**: sites, trigger depth (for example 2"), per-push or seasonal pricing, and any "no email" preferences
- [ ] **YOU:** **Snow contracts** (seasonal versus per-event) and the billing method
- [ ] **YOU:** **Plow routes** and crew or truck assignments
- [ ] **YOU:** **Prior storm history**, if you need it for reporting or disputes

---

## 12. Documents, photos, and history

- [ ] **YOU:** **Client notes and activity history**, if your system can export it (calls, emails, notes). Some can't, and that's fine.
- [ ] **YOU:** **Photos and attachments** you want kept (before and after photos, damage documentation). Send them as a folder or zip, organized by client if possible.
- [ ] **YOU:** **Insurance certificates, W-9s, and signed documents** you want on file
- [ ] **YOU:** Any **custom forms or checklists** your crews use (safety inspections, pre-trip checks)
- [ ] **YOU:** **Past reports** you rely on. Send a screenshot or PDF of each so we can show you where the same numbers live in Landscapt.

---

## 13. Communication and automations

- [ ] **YOU:** Copies of your current **email and text templates**: appointment reminders, invoice emails, service-complete notices, review requests
- [ ] **YOU:** A list of the **automations you rely on** (for example "job completed, send a follow-up in 24 hours")
- [ ] **YOU:** Your **opt-out and do-not-contact list**
- [ ] **US:** Rebuild templates and automations. Imports never trigger automations, so no one will get a surprise email during the move.

---

## 14. Accounting and payroll connections

- [ ] **YOU:** Which **accounting system** you use (QuickBooks Online, Xero, other) and an admin who can authorize the connection
- [ ] **YOU:** Which **payroll provider** you use (Gusto, ADP, other) and how you export hours today
- [ ] **YOU:** Your **chart of accounts** or income category mapping, if you want invoices to sync to specific accounts
- [ ] **US:** Connect accounting and set up the payroll and timesheet export

---

## 15. Review, training, and go-live

- [ ] **US:** Send you a **data review**: client count, active contract count, and A/R total, each compared against your old system
- [ ] **YOU:** **Spot-check 10 to 15 clients** you know well: address, schedule, price, balance
- [ ] **YOU:** **Approve the review** (or send corrections)
- [ ] **YOU:** Schedule **office staff training** and **crew app training** (crews log in by crew, so tell us how you want to hand out logins)
- [ ] **YOU:** Have crews install the app and run **one test day** before go-live
- [ ] **US:** Final import of anything that changed since your first export (new clients, new invoices, payments received)
- [ ] **YOU + US:** **Go live** on your chosen date
- [ ] **YOU:** Keep your old system read-only for **at least 60 days**, until your first full billing cycle and first month-end close in Landscapt both check out
- [ ] **YOU:** Cancel the old system only after we both confirm everything reconciles

---

## Quick reference: how to find your exports

**Service Autopilot:** Exporting can be switched off by default, so ask your account admin to make sure it's turned on for your login. Then look for an export option on the list and report screens (Clients, Invoices, Payments, Contracts and Schedules). Service Autopilot's support team can also run a full export for you. If you can't find a report, send us a screenshot of the screen and we'll point you to it.

**Homeworks:** Check **Reports** and the list views for **Customers, Jobs, Invoices, and Payments** for an export option. Homeworks doesn't publish steps for exporting your data, so the most reliable route is to ask Homeworks support for a **full data export** as CSV files and tell them it's for a migration. Allow a few business days.

> Menu names change between versions. If something doesn't match what you see, don't guess. Send us what you can find and we'll fill in the gaps.

---

## What we can't bring over (set expectations early)

- **Credit card numbers.** These stay with your processor. See section 7.
- **Some history** (detailed activity logs, old crew GPS trails, anything your old system won't export). We'll tell you in the first review what came across and what didn't.
- **Custom reports and dashboards.** We rebuild these in Landscapt's Report Center using the samples you send in section 12.

---

*Questions? Contact your Landscapt onboarding specialist. Send files securely through the link we give you, not by plain email, since they contain client contact information.*
