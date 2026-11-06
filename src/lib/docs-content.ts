import {
  Rocket,
  FileText,
  ClipboardList,
  PackageCheck,
  Boxes,
  FolderKanban,
  ClipboardCheck,
  MessageSquare,
  CalendarClock,
  Truck,
  Container,
  Gauge,
  Users,
  Bell,
  GitMerge,
  ShoppingCart,
  Wrench,
  Settings2,
  Building2,
  Calculator,
  CalendarDays,
  Snowflake,
  Receipt,
  Zap,
  CreditCard,
  Plug,
  KeyRound,
  AlertTriangle,
  HeartPulse,
  Ticket,
  Globe,
  Camera,
  BarChart3,
  Upload,
  ListChecks,
  Satellite,
  Handshake,
  DollarSign,
  ShieldCheck,
  Percent,
} from "lucide-react";
import type { ElementType } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocStep {
  step: string;
  detail: string;
  /** Optional in-app link rendered under the detail text (e.g. to a full reference page). */
  href?: string;
  linkLabel?: string;
}

export interface DocArticle {
  id: string;
  title: string;
  summary: string;
  icon: ElementType;
  steps: DocStep[];
}

export interface DocSection {
  id: string;
  label: string;
  icon: ElementType;
  articles: DocArticle[];
}

export interface FAQItem {
  q: string;
  a: string;
}

export interface FAQCategory {
  label: string;
  items: FAQItem[];
}

// ── Guide / article content ───────────────────────────────────────────────────

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: Rocket,
    articles: [
      {
        id: "platform-overview",
        title: "Platform Overview",
        summary: "Understand the three core modules and how they work together.",
        icon: Rocket,
        steps: [
          {
            step: "Purchasing (PO) Module",
            detail:
              "Handles the full procurement lifecycle: Purchase Requisitions → Approval → Purchase Orders → Vendor management → Receiving → Parts inventory update. Every line item references a catalog entry from the Products section.",
          },
          {
            step: "Equipt (CMMS) Module",
            detail:
              "Handles asset and maintenance lifecycle: Asset registry → Preventive Maintenance schedules → Work Orders → Parts inventory → Labor tracking → Maintenance history. Vehicles are a specialized asset type with service-interval reminders.",
          },
          {
            step: "Field Service (CRM) Module",
            detail:
              "Handles the full customer and field service lifecycle: Clients (with commercial parent/child hierarchies) → Properties → Estimates (built with a production-rate budget engine) → Jobs → Dispatch Board → Invoices → Contracts. Job types include recurring, one-time, waiting list, package, snow, and project work.",
          },
          {
            step: "How the modules connect",
            detail:
              "All three modules share Vendors (one table used by PO, CMMS, and CRM) and Parts inventory (replenished via PO → Receiving → Parts stock). A Work Order or a CRM Job can each spawn a Purchase Requisition when materials are needed, and CRM invoices link back to PO purchase orders for job cost reconciliation.",
          },
          {
            step: "Home shortcuts",
            detail:
              "Admins can add their own tiles to the Home page under Master Account Settings > Integrations > Home Page Shortcuts (each opens in a new tab): a name, optional subtitle, icon and the web address to open (for example your fleet or supplier login). A bare address like example.com is saved as https://example.com; only http and https links are accepted, and anything else (such as mailto: or a script address) is refused with a message when you save.",
          },
          {
            step: "Recommended setup order",
            detail:
              "1) Go to Settings > Users and invite your team. 2) Configure Approval Flows for Requisitions and POs. 3) Add your vendors. 4) Build the Products catalog. 5) Add your assets and vehicles. 6) Add spare parts and link them to assets. 7) Create PM Schedules. 8) Set up Automations for meter-based maintenance. 9) In CRM, add your clients and their properties. 10) Configure Services and Production Rates so Estimates can use the budget engine. 11) Build out Packages and Contracts for recurring billing.",
          },
        ],
      },
      {
        id: "user-roles",
        title: "User Roles & Permissions",
        summary: "Know which role to assign to each team member.",
        icon: Users,
        steps: [
          {
            step: "Admin",
            detail:
              "Full access to all modules, settings, users, and approval flows. Can view and edit anything. Typically the operations manager or system owner.",
          },
          {
            step: "Manager",
            detail:
              "Can approve requisitions and POs, create and close work orders, manage assets and parts. Cannot change org-level settings or manage users.",
          },
          {
            step: "Purchaser",
            detail:
              "Focused on the PO module — can create and manage requisitions, purchase orders, receiving, vendors, and products. Read-only on CMMS.",
          },
          {
            step: "Staff",
            detail:
              "Standard Equipt access — can create and update work orders, record meter readings, view PM schedules and parts, and start requisitions and POs. Cannot approve requisitions or modify settings.",
          },
          {
            step: "Requestor",
            detail:
              "Can submit maintenance requests only. Cannot create work orders directly. Useful for field staff or other departments who need to flag issues.",
          },
          {
            step: "Viewer",
            detail:
              "Read-only access across both modules. Cannot create, edit, or approve anything. Useful for executives or auditors who need visibility.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full role-permission matrix, why CRM access runs on a completely separate 100+-toggle permission system rather than these roles, and how Crew and Client Portal access fit in.",
            href: "/settings/support/users-roles-guide",
            linkLabel: "Open the Users, Roles & Permissions guide",
          },
        ],
      },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    icon: ShoppingCart,
    articles: [
      {
        id: "requisitions",
        title: "Creating a Purchase Requisition",
        summary: "Request items before a formal PO is issued.",
        icon: FileText,
        steps: [
          {
            step: "Open the Requisitions page",
            detail:
              "Navigate to Purchasing > Requisitions in the sidebar. Click '+ New Requisition' to open the creation form.",
          },
          {
            step: "Fill in the header",
            detail:
              "Enter a title, select the vendor from the dropdown, and add any notes. The requisition number is auto-generated.",
          },
          {
            step: "Add line items",
            detail:
              "Click '+ Add Line Item'. Each line must reference a product from the catalog (Purchasing > Products). Set the quantity and unit cost. Optionally assign the line to a project for cost tracking.",
          },
          {
            step: "Save or submit",
            detail:
              "Save as Draft if you need to come back later. Click 'Submit for Approval' when ready — this routes it to the first approver in your configured Approval Flow.",
          },
          {
            step: "Track the approval",
            detail:
              "Status moves through: Draft → Pending Approval → Approved (or Rejected). You'll get an in-app notification and email when a decision is made.",
          },
        ],
      },
      {
        id: "convert-to-po",
        title: "Converting a Requisition to a PO",
        summary: "Turn an approved requisition into a formal Purchase Order.",
        icon: ClipboardList,
        steps: [
          {
            step: "Open the approved requisition",
            detail:
              "From Purchasing > Requisitions, click the requisition with status 'Approved' to open its detail panel.",
          },
          {
            step: "Click 'Convert to PO'",
            detail:
              "The button appears in the header of the detail panel. A new PO is pre-filled with all line items, vendor, and cost information from the requisition.",
          },
          {
            step: "Review and adjust",
            detail:
              "You can modify quantities, costs, or add a vendor reference number before saving. The PO links back to the originating requisition automatically.",
          },
          {
            step: "Submit the PO for approval",
            detail:
              "If your org requires PO approval, click 'Submit for Approval'. Otherwise it can be moved directly to 'Ordered' status once sent to the vendor.",
          },
        ],
      },
      {
        id: "receiving",
        title: "Recording Goods Received",
        summary: "Log delivered items and auto-update parts inventory.",
        icon: PackageCheck,
        steps: [
          {
            step: "Go to Receiving",
            detail:
              "Navigate to Purchasing > Receiving and click '+ New Receipt'.",
          },
          {
            step: "Select the Purchase Order",
            detail:
              "Pick the PO from the dropdown. All open line items from that PO load automatically.",
          },
          {
            step: "Enter received quantities",
            detail:
              "For each line item, enter the quantity received. You can receive partially — the PO tracks remaining open quantities across multiple receipts.",
          },
          {
            step: "Parts inventory auto-updates",
            detail:
              "Any line item with category 'Maintenance Part' automatically increments quantity on hand in CMMS > Parts when the receipt is saved. This is the only place stock levels are updated.",
          },
          {
            step: "Attach documentation",
            detail:
              "You can attach delivery slips, invoices, or inspection reports to the receipt record for audit trail purposes.",
          },
        ],
      },
      {
        id: "products",
        title: "Managing the Products Catalog",
        summary: "The single source of truth for all purchasable items.",
        icon: Boxes,
        steps: [
          {
            step: "Why a catalog is required",
            detail:
              "Every line item on a Requisition or PO must reference a catalog entry. Free-text descriptions are not allowed — this ensures consistent naming, GL coding, and reporting.",
          },
          {
            step: "Three product categories",
            detail:
              "'Maintenance Part' — spare parts that feed into CMMS Parts inventory on receipt. 'Stocked Material' — landscape supplies kept on hand (mulch, seed, etc.). 'Project Material' — job-specific materials that must be assigned to a project.",
          },
          {
            step: "Adding a new product",
            detail:
              "Go to Purchasing > Products, click '+ New Product'. Fill in the name, unit of measure, default unit cost, category, and optional GL code. Save and it's immediately available on all Requisition and PO line items.",
          },
          {
            step: "Linking Maintenance Parts to CMMS",
            detail:
              "When you create a Maintenance Part in the catalog, you can link it to a Part in the CMMS Parts inventory. This creates the connection so receiving that product updates the correct part's stock level and cost — see Administration > Inventory Costing Methods.",
          },
        ],
      },
      {
        id: "projects",
        title: "Project Cost Tracking",
        summary: "Assign materials to landscaping jobs and track spend.",
        icon: FolderKanban,
        steps: [
          {
            step: "Create a project",
            detail:
              "Go to Purchasing > Projects and click '+ New Project'. Enter the job name, client, start date, and budget. Projects represent individual landscaping jobs or contracts.",
          },
          {
            step: "Assign line items to a project",
            detail:
              "When adding line items to a Requisition or PO, set the optional 'Project' field on each line. Only 'Stocked Material' and 'Project Material' category items can be project-assigned.",
          },
          {
            step: "View project costs",
            detail:
              "Open a project to see its Materials tab — all assigned line items, quantities, and costs are rolled up here. Total committed and received spend updates in real time.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — why 'Projects' means the same underlying record in both Purchasing and CRM, the extra CRM-only tabs, and how the Job Costing Dashboard's breakeven rate feeds into a project's default labor rate.",
            href: "/settings/support/projects-guide",
            linkLabel: "Open the Projects & Job Costing guide",
          },
        ],
      },
    ],
  },
  {
    id: "maintenance",
    label: "Equipt (CMMS)",
    icon: Wrench,
    articles: [
      {
        id: "work-orders",
        title: "Work Orders",
        summary: "Create and manage maintenance tasks from open to done.",
        icon: ClipboardCheck,
        steps: [
          {
            step: "Create a work order",
            detail:
              "Go to CMMS > Work Orders and click '+ New Work Order'. Fill in the title, linked asset or vehicle, priority (Low / Medium / High / Urgent), due date, and assign to a technician.",
          },
          {
            step: "Status flow",
            detail:
              "Work orders move through: Open → In Progress → On Hold → Done. Update the status from the detail panel. Moving to Done stamps a completed date and can advance automation thresholds if the WO was created by an automation.",
          },
          {
            step: "Request parts from a work order",
            detail:
              "Use 'Request Parts' in the work order detail to auto-create a linked Purchase Requisition pre-filled with the parts needed. The WO reference is stored on the requisition so costs trace back to the job.",
          },
          {
            step: "Add notes and labor",
            detail:
              "Use the Notes tab to log what was done, findings, or follow-up tasks. Labor time can be recorded to track technician hours per job.",
          },
          {
            step: "View maintenance history",
            detail:
              "Open any asset or vehicle to see its full history of completed work orders in the History tab.",
          },
        ],
      },
      {
        id: "requests",
        title: "Maintenance Requests",
        summary: "Let your team flag issues without creating WOs directly.",
        icon: MessageSquare,
        steps: [
          {
            step: "What is a Maintenance Request?",
            detail:
              "A Maintenance Request is a lower-friction way for staff or requestors to flag an issue. It goes through an approval flow before becoming a Work Order, giving managers a triage step.",
          },
          {
            step: "Submitting a request",
            detail:
              "Go to CMMS > Requests and click '+ New Request'. Select the asset, describe the issue, and set priority. Submit — it enters the approval queue.",
          },
          {
            step: "Approving and converting",
            detail:
              "Managers can approve the request and convert it to a Work Order from the request detail panel. The WO is pre-filled with the request details and linked back.",
          },
          {
            step: "Automations can create requests too",
            detail:
              "If you set up an automation with action type 'Create WO Request', it inserts a Maintenance Request (not a direct WO) when the trigger fires — ideal when you want a human review step.",
          },
        ],
      },
      {
        id: "pm-schedules",
        title: "Preventive Maintenance Schedules",
        summary: "Schedule recurring maintenance before problems occur.",
        icon: CalendarClock,
        steps: [
          {
            step: "Create a PM Schedule",
            detail:
              "Go to CMMS > PM Schedules and click '+ New PM Schedule'. Give it a name (e.g., 'Monthly Blade Inspection') and set the frequency, then link it to the asset(s) it covers from the Assets tab.",
          },
          {
            step: "Frequency options",
            detail:
              "Schedules can repeat daily, weekly, monthly, quarterly, or annually. The Next Due Date you set is the schedule's calendar — a weekly schedule first due on a Wednesday stays due every Wednesday.",
          },
          {
            step: "One schedule can cover multiple assets",
            detail:
              "A PM Schedule's Assets tab holds a list of assets, not just one — useful for a fleet-wide routine like 'Quarterly Blade Sharpening' that applies to every mower on the crew. Add or remove assets from that tab at any time.",
          },
          {
            step: "Parts lists",
            detail:
              "Two ways to plan parts for a PM: the schedule-level Parts tab lists parts expected for the routine in general, while each asset row on the Assets tab can carry its own per-asset parts list (with quantity and unit cost) — useful when different assets on the same schedule need different parts, e.g. different oil filter part numbers per mower model. When work orders generate, Parts-tab parts go once on the master work order (or the single work order for a one-asset schedule) with one stock deduction, while each asset's own parts go on that asset's sub-work order.",
          },
          {
            step: "Notifications",
            detail:
              "PM schedules due within 7 days appear in the Notifications bell as 'PM Due' alerts. The PM Due Reminder automation template can also create a work order automatically before the due date.",
          },
          {
            step: "Generating work orders",
            detail:
              "Click Generate WOs on the schedule (clicking a work order in the schedule's list takes you to the Work Orders page with that work order open). Each work order is due on the schedule's Next Due Date, and Next Due moves to the next date on the cadence. Generating late doesn't shift the calendar: last Wednesday's batch generated on Sunday leaves Next Due on this Wednesday. Only one batch can be open at a time — finish or skip it before generating the next.",
          },
          {
            step: "Pausing for the off-season",
            detail:
              "Click Pause to stop a schedule between two dates, until you resume it, or every year (e.g. Dec 1 → Apr 1 for mowers). Paused cycles aren't due: nothing is generated, alerted on, or counted against PM compliance. Pause windows are listed on the Details tab.",
            href: "/settings/support/pm-schedules-guide#pausing",
            linkLabel: "How pausing works",
          },
          {
            step: "PM compliance",
            detail:
              "PMs are scored against the schedule's calendar, so a week nobody generated counts as missed — once per asset on the schedule. Skipped and overdue PMs count as missed too; late ones count as done. See each asset's Performance cards or Equipt > Reports > PM Compliance.",
            href: "/settings/support/asset-performance-guide#pm-compliance",
            linkLabel: "How PM compliance is scored",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — fleet-wide seasonal PMs, exactly how due dates advance, and how this relates to usage-based meter automations.",
            href: "/settings/support/pm-schedules-guide",
            linkLabel: "Open the Preventive Maintenance guide",
          },
        ],
      },
      {
        id: "assets-vehicles",
        title: "Assets & Vehicles",
        summary: "Build your equipment registry and track service history.",
        icon: Truck,
        steps: [
          {
            step: "Assets vs. vehicles",
            detail:
              "Assets (CMMS > Assets) cover equipment like pumps, HVAC units, and mowers. Vehicles (CMMS > Vehicles) are a specialized type with VIN, odometer tracking, and oil change/registration reminders.",
          },
          {
            step: "Key fields",
            detail:
              "For assets: make, model, serial number, location, status, and purchase date. For vehicles: all of the above plus VIN, license plate, and service reminder dates/mileages.",
          },
          {
            step: "Linking spare parts",
            detail:
              "In the asset detail, use the Parts tab to link which parts this asset typically uses. This is a many-to-many relationship — one part (like an oil filter) can be linked to multiple vehicles.",
          },
          {
            step: "Adding meters",
            detail:
              "Meters track usage values like hours, miles, gallons, or cycles. Add them in the asset detail and record readings regularly. Meters power automation triggers — e.g., create an oil change WO every 5,000 miles.",
          },
          {
            step: "Vehicle service reminders",
            detail:
              "Set oil change due date and mileage, registration expiry, and inspection due on each vehicle. The reminder card changes color: green (current), amber (due soon — within 30 days / 500 miles), red (overdue).",
          },
          {
            step: "Warranties",
            detail:
              "Edit an asset or vehicle and fill in the Warranty section — either the end date, or a coverage period (e.g. 3 years) from a start date (blank = purchase date). Add notes like 'powertrain 5 yr / 2,000 hrs'. The Details tab shows a countdown; 90 days or less reads 'Expiring soon'. Equipt > Reports > Warranties lists everything expiring.",
          },
          {
            step: "Performance cards",
            detail:
              "The top of every asset's Details tab shows uptime, 12-month and lifetime maintenance cost (with lifetime as a % of purchase price), PM compliance, average repair time, and warranty status. Pick 30 days, 90 days or 12 months for the time-based cards.",
          },
          {
            step: "Keep status current for uptime",
            detail:
              "Uptime is measured from the asset's status: In Shop and Out of Service are down, Active is up, and Inactive (parked), Disposed or Sold time is left out. Set a machine to In Shop when it goes down and back to Active when it's fixed.",
          },
          {
            step: "Full guide",
            detail:
              "Exactly how uptime, maintenance cost and PM compliance are calculated, with worked examples, and what the PM Compliance, Uptime and Warranties reports show.",
            href: "/settings/support/asset-performance-guide",
            linkLabel: "Open the Asset Performance guide",
          },
        ],
      },
      {
        id: "parts",
        title: "Parts Inventory",
        summary: "Manage spare parts stock and link parts to assets.",
        icon: Container,
        steps: [
          {
            step: "Adding a part",
            detail:
              "Go to CMMS > Parts and click '+ New Part'. Enter the part name, part number, unit of measure, minimum stock level, and current quantity on hand. You can also add a picture, a storage location, and one or more categories to help with search and filtering.",
          },
          {
            step: "Copying a part",
            detail:
              "On a part's detail, click Copy to start a new part from it (needs inventory-management permission). The name becomes '<name> (Copy)', the part number is left blank for you to fill in, quantity on hand starts at 0, and category, cost, minimum stock, location, vendor and description carry over.",
          },
          {
            step: "Linking to assets",
            detail:
              "In the part detail, use the Assets tab to link which assets use this part. This is many-to-many — a single part can serve multiple assets.",
          },
          {
            step: "Multiple vendors per part",
            detail:
              "A part can list a primary vendor plus alternate vendors it's also sourced from. This is for reference/reordering convenience — it does not split the part into separate catalog entries. A vendor name in a parts CSV import is matched to your existing vendor by name (when exactly one vendor has that name) so the part links to the real vendor record, and a blank vendor column on re-import leaves the vendor alone.",
          },
          {
            step: "Generic / interchangeable equivalents get their own part",
            detail:
              "If a part number is genuinely interchangeable across brands (e.g. a name-brand filter vs. an aftermarket equivalent that fits the same spec), keep them as two separate catalog entries rather than merging purchases of both under one part — the two aren't the same cost or vendor history, and PO line items need to attach to the correct one. Import history is easy to conflate the first time a part number is entered under a different name in a later purchase; if you spot a part whose Products catalog name and Parts inventory name genuinely disagree, check its Audit Trail for a 'name conflict' entry (see FAQ) before assuming it's just a typo.",
          },
          {
            step: "Linking alternative parts",
            detail:
              "Once you've split two interchangeable parts into separate catalog entries, use the Interchangeable Parts section on either part's detail page to formally link them together — click 'Link as alternative part' (or 'Add Alternative' if you're starting from a part that already has one or more links) and pick the other part. Either part can link to the other; there's no required direction, and neither side is treated as more authoritative.",
          },
          {
            step: "Replenishing stock",
            detail:
              "Create a Purchase Requisition using the Maintenance Part product that corresponds to this part. When the PO is received in Purchasing > Receiving, the quantity on hand increments automatically. Never adjust quantity manually outside of receiving.",
          },
          {
            step: "Cost stays in sync with the Products catalog",
            detail:
              "Every part is linked to a Products catalog entry. When a receipt updates a part's unit cost, the linked product's cost updates automatically too (and vice versa for manual edits) — so the price shown in CMMS Parts and Purchasing Products should always match. See Administration > Inventory Costing Methods for how that cost is actually calculated.",
          },
          {
            step: "Low stock alerts",
            detail:
              "When quantity on hand drops to or below the minimum stock level, a Low Stock badge appears on the part and a notification fires in the bell. Use the Low Stock Alert automation template to auto-create a requisition.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough of the full part lifecycle, the asset link model, and exactly when to split interchangeable parts vs. add an alternate vendor.",
            href: "/settings/support/parts-inventory-guide",
            linkLabel: "Open the Parts Inventory guide",
          },
        ],
      },
      {
        id: "meters-automations",
        title: "Meters & Automations",
        summary: "Automate work orders based on usage thresholds.",
        icon: Gauge,
        steps: [
          {
            step: "Adding a meter to an asset",
            detail:
              "Open any asset or vehicle detail and go to the Meters tab. Click '+ New Meter'. Choose the unit (miles, hours, gallons, cycles, etc.), give it a name, and pick Cumulative (odometer, hours; readings only go up) or Level (fuel, tank; readings can go up or down, with an optional capacity).",
          },
          {
            step: "Recording a reading",
            detail:
              "Click the meter and use '+ Add Reading'. Enter the value and date. The meter's current value updates to the latest reading.",
          },
          {
            step: "Creating a meter-threshold automation",
            detail:
              "Go to CMMS > Automations and click '+ New Automation'. Set Trigger Type to 'Meter Threshold', select the meter, choose the operator (≥ for cumulative meters like mileage; < 'drops below' for level meters like a fuel tank), and enter the threshold value. A level rule fires once when the value drops below the threshold and re-arms after a reading brings it back to or above it. Service Intervals and PM triggers are for cumulative meters only.",
          },
          {
            step: "Other trigger types",
            detail:
              "Beyond meter thresholds, an automation can trigger on: a part dropping below minimum stock (any part, or a specific one), a PM schedule coming due within N days, a work order going overdue by N+ days, a new maintenance request being submitted, a work order's status changing to a specific value, or a purchase order's status changing to a specific value.",
          },
          {
            step: "Action types",
            detail:
              "An automation can: create a Work Order, create a Maintenance Request (a review step before it becomes a WO), create a Purchase Requisition, notify a role in-app (Send Notification), or send an email (Send Email, requires email configuration).",
          },
          {
            step: "Assigned To on Create WO / WO Request",
            detail:
              "For the Create Work Order and Create WO Request actions, Assigned To is a picker of your employees (Unassigned by default). The person you pick is put on every work order the automation creates; on a WO Request they carry over to the work order when the request is converted. An older automation with free-typed text shows 'Previously typed… no matching employee' — pick the employee once so its work orders get assigned. An employee who has since left stays selectable on automations already using them.",
          },
          {
            step: "Setting a service interval",
            detail:
              "When the action type is 'Create Work Order' or 'Create WO Request', you can set a Service Interval. After the triggered WO is marked Done, the threshold automatically advances by the interval — so you never have to update it manually.",
          },
          {
            step: "Automations fire immediately on reading",
            detail:
              "Every time you record a meter reading, the automations engine runs instantly in the background. If the reading crosses a threshold, the WO or request is created right away.",
          },
          {
            step: "Pre-built templates",
            detail:
              "On the Automations page, click any template card to add it instantly. Available templates: Low Stock Alert, PM Due Reminder, WO Completed — Notify Team, PO Approved.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a full meter + threshold + service-interval worked example, the 'Pending Reset' state machine, and every trigger/action type in one table.",
            href: "/settings/support/meters-guide",
            linkLabel: "Open the Meters & Automations guide",
          },
        ],
      },
    ],
  },
  {
    id: "crm",
    label: "Landscapt (CRM)",
    icon: Building2,
    articles: [
      {
        id: "clients-properties",
        title: "Clients & Properties",
        summary: "Manage client accounts, commercial hierarchies, service properties, and the activity timeline.",
        icon: Users,
        steps: [
          {
            step: "Creating a client",
            detail:
              "Go to CRM > Clients and click '+ New Client'. The quick-create step captures Display Name, Account Type (Residential or Commercial), phone, and email — click 'Create & Continue' and the full client record opens immediately for billing info, custom fields, and office notes.",
          },
          {
            step: "Finding clients: search, filters & export",
            detail:
              "The Clients list (List or Table view, which share the same search and filters) shows the total number of matches and loads clients 100 at a time as you scroll, or click 'Load more'. Search covers name, account #, email, phone (digits only once you type 3+), billing and service address, city, ZIP and tags, across every client. Filters include Status, Balance, Billing City, Service City, Tags, custom fields and Has Scheduled / Completed Job For a service. In the Table, the header checkbox selects the loaded rows and 'Select all N matching clients' selects every match. Import / Export > Export downloads every client that matches the current search and filters.",
          },
          {
            step: "Client status",
            detail:
              "Status is one of Active, Inactive, Lead, or Cancelled. Cancelling a client requires picking a reason — Price, Moved, Unhappy with Service, No Longer Needs Service, or Other — which is kept on the record for churn reporting.",
          },
          {
            step: "Commercial parent/child hierarchy",
            detail:
              "Use 'Link Parent Account' on a commercial client to nest it under a property-manager parent. Only a client that isn't already a child itself can be picked as the parent — the hierarchy is one level deep. The picker shows the first 50 eligible clients; type to search the rest. A client that already has sub-accounts can't be given a parent, and the picker says so. The parent's record shows a Sub-Accounts banner with the combined balance across all its children.",
          },
          {
            step: "Adding a property",
            detail:
              "On a client's detail page, open the Details tab and click '+ Add' in the Properties list (or More → Add Property). Enter the property name/label, street address, city/state/zip, gate code, and notes to crew. Properties are extra service addresses on the same account: they share the client's balance and invoices. When a client has two or more properties, the New Job dialog asks which one the job is for, so the crew is routed to that address and sees its gate code and notes. If each location needs its own invoices or balance, create each as its own client and link them under a parent account. Turf sq ft, mulch bed sq ft, gross sq ft, and linear ft measurements are entered on the client's Custom Fields tab and feed the estimating engine's production-rate calculations.",
          },
          {
            step: "A location that needs its own jobs/invoices",
            detail:
              "If a location genuinely needs independent scheduling and billing — not just a second address on the same account — use the Commercial parent/child hierarchy above instead of a property.",
          },
          {
            step: "Open Tickets card",
            detail:
              "The client detail page shows a compact Open Tickets card (count plus the most recent few) alongside Contacts and Office Notes, with a link to the full Tickets tab and an Add Ticket shortcut.",
          },
          {
            step: "Contacts",
            detail:
              "Add contacts from the client detail page with a type — Owner, Primary, Spouse, Property Manager, District Manager, Trustee/Board Member, Employee, Child, or Other. A contact can have multiple phone numbers; toggle the star to mark which one is primary.",
          },
          {
            step: "Activity timeline",
            detail:
              "Every note, call, email, invoice, payment, job visit, estimate, contract, automation, and ticket for a client lands in one chronological Activity Timeline, filterable by All History, Notes, Visits, Transactions, or Estimates. Rows deep-link straight to the invoice, estimate, or job they reference.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the parent/child hierarchy worked in full, how a Lead becomes a Client, and a status table of what's blocked in each state.",
            href: "/settings/support/clients-guide",
            linkLabel: "Open the Clients, Properties & Leads guide",
          },
        ],
      },
      {
        id: "estimates",
        title: "Estimates & the Budget Engine",
        summary: "Build client-facing proposals using production rates, labor burden, and overhead markup.",
        icon: Calculator,
        steps: [
          {
            step: "Creating an estimate",
            detail:
              "Go to CRM > Estimates and click '+ New Estimate'. Pick a client (leads are labeled '(lead)' in the picker; inactive or cancelled clients don't appear), set the estimate date and a valid-until date (defaults to 30 days out), and assign a sales rep.",
          },
          {
            step: "What the client's proposal link shows",
            detail:
              "The proposal link (and the client portal) shows the last version you sent — emailing the estimate, or Get link / Copy link / Open, publishes the current estimate as a numbered version. If you keep editing, a banner reads 'Edited since Version N was sent': the client still sees Version N and can't accept until you send again. The page honors the Valid until date through the end of that day; after it, the page reads Expired, acceptance (link or portal) is refused, and the client can still decline or request changes. The page also has a Download PDF button, and Visits, Quantities and Units are separate display toggles. Tax rate, overhead rate and win probability are limited to 0-100%.",
          },
          {
            step: "Stage vs. approval status",
            detail:
              "Stage tracks the sales process: Draft → Quote → Sent → Accepted → Lost → Invoiced. Approval Status (Not Required / Pending / Approved / Rejected) is a separate internal sign-off gate that can hold an estimate back from being sent regardless of its stage.",
          },
          {
            step: "Manual vs. production-rate budgeting",
            detail:
              "Each line item snapshots a budget method from its service at the time it's added: Manual (enter budgeted hours directly — Service Autopilot style) or Production Rate (hours = quantity ÷ the service's sq ft per man-hour — Aspire style). Lines with an hourly unit type always use the entered quantity as hours, regardless of method.",
          },
          {
            step: "Cost and overhead",
            detail:
              "A labor line's cost pre-fills from your org's breakeven (fully-burdened) rate the first time it's added, and only while it's still zero — edit it directly to override. Overhead markup applies per cost type (Labor, Sub-Contract, Product/Material, Asset/Equipment, Service/Other), each configurable separately in org settings.",
          },
          {
            step: "Reading the line-item grid",
            detail:
              "The grid's GM% column color-codes gross margin per line — green at 30%+, gray at 10%+, red below 10% — calculated from Rate, Cost, and Adjusted Rate. Toggle a line between per-unit (×) and fixed total ($) pricing with the Calc Type control.",
          },
          {
            step: "Converting an estimate to a job",
            detail:
              "Click 'Convert Estimate to Job', choose which line items to include, and pick a Job Type: One Time, Recurring, Project, or Waiting List. Package and Snow jobs are created directly rather than converted from an estimate. Set the scheduled date and assign a crew before confirming.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a full worked numeric example of the production-rate calculation, the Stage state machine, and why budget method is snapshotted per line.",
            href: "/settings/support/estimating-guide",
            linkLabel: "Open the Estimates & Budget Engine guide",
          },
        ],
      },
      {
        id: "jobs-dispatch",
        title: "Jobs, Packages & the Dispatch Board",
        summary: "Schedule recurring and one-time work, bundle services into packages, and run the daily dispatch board.",
        icon: CalendarDays,
        steps: [
          {
            step: "Job types",
            detail:
              "A CRM Job is one of: recurring, one_time, waiting_list, package, snow, or project. The job itself has a status (Scheduled, In Progress, Completed, Cancelled, Skipped, Hold); each individual scheduled occurrence — a visit — has its own status (Scheduled, Dispatched, In Progress, Completed, Cancelled, Skipped).",
          },
          {
            step: "The Dispatch Board",
            detail:
              "CRM > Scheduling > Dispatch Board shows one day at a time with a week strip for picking the date. Click a visit's status pill to open a status menu (Scheduled, Dispatched, In Progress, Completed, Skipped) and pick the new status, which applies as soon as you click — and assign crews directly from the board.",
          },
          {
            step: "How actual hours are calculated",
            detail:
              "Unless a crew clocks in and out manually, a visit's actual hours are calculated as (scheduled end time − scheduled start time) × number of crew members assigned — not a fixed estimate carried over from the job.",
          },
          {
            step: "Packages",
            detail:
              "Go to CRM > Settings > Packages to bundle recurring services (e.g. a 7-Step Fertilizer program) under one program. A package's Services tab defines each visit — its service, date window, minimum days between visits, and default budgeted hours/rate. The fixed monthly billing amount and discount live on the resulting job once a client is signed up, not on the package template itself. Next season, Renew for next season (on the job's More menu, or Renew Packages on the Jobs list) copies the job forward a year.",
          },
          {
            step: "Projects",
            detail:
              "CRM > Scheduling > Projects tracks one-off landscaping jobs distinct from recurring service — the CRM equivalent of the PO module's Projects/Jobs section, used the same way for cost tracking and reporting.",
          },
          {
            step: "Stop order is remembered per crew, per weekday",
            detail:
              "Reorder a crew's stops (drag in Manual Route mode, or use Reverse) and click Save Order. That sets today's sequence AND remembers it for that crew on that weekday — so next Monday's board comes up already in the order you routed this Monday, instead of an unsorted crew grouping. Jobs with no remembered position sort to the bottom, which is your cue to place them; saving a day always wins over the remembered order, so a one-off change never overwrites the usual route.",
          },
          {
            step: "Optimize Route",
            detail:
              "Reorders the stops in view by real driving time, anchored at the crew's starting address (Team > Crews) rather than at whichever stop happens to be listed first. The dropdown beside the button picks the direction: 'Nearest first' takes the closest stop each time (shortest total drive), 'Furthest first' drives out to the far end and works back in so the crew finishes near the yard. Anchoring only applies when every stop in view belongs to one crew — filter to a single crew first. An optimized order isn't saved until you click Save Order. Needs a Google Maps API key with the Distance Matrix API enabled, under Landscapt Settings > Integrations.",
          },
          {
            step: "Full guides",
            detail:
              "Job types and Packages get their own deep dive; the Dispatch Board's status cycling, stop order, and actual-hours calculation get a dedicated guide.",
            href: "/settings/support/jobs-packages-guide",
            linkLabel: "Open the Jobs & Packages guide",
          },
          {
            step: "Dispatch Board guide",
            detail:
              "The day-to-day scheduling screen — status cycling, crew assignment, and exactly how actual hours are calculated when a crew doesn't clock in.",
            href: "/settings/support/dispatch-board-guide",
            linkLabel: "Open the Dispatch Board guide",
          },
        ],
      },
      {
        id: "services-pricing",
        title: "Services & Pricing",
        summary: "The service catalog, bulk catalog price changes, and Price Adjustment runs that re-price live client work.",
        icon: DollarSign,
        steps: [
          {
            step: "Where it is",
            detail:
              "CRM > Services, titled 'Services & Pricing'. Three tabs: Service Catalog (your services, rate matrices and production rates), Price Adjustments (re-pricing existing client work), and Adjustment History (every run, with an undo).",
          },
          {
            step: "Catalog rates vs. what actually bills",
            detail:
              "A service's default rate is a starting value — it fills in a price when that service is added to a NEW estimate, invoice or package. It is not what existing clients are billed. Each job keeps the rate it was sold at on its own Services tab, and that per-client rate is what an invoice is built from when a visit completes. Raising the catalog rate alone moves no money.",
          },
          {
            step: "Bulk Prices (catalog)",
            detail:
              "On the Service Catalog tab, 'Bulk Prices' opens an editable grid with a Quick Adjust: percent or flat dollars, with rounding to the exact cent, nearest $0.25, $1 or $5. It acts on whatever matches the search box, so you can raise just mowing. Rate-matrix tiers and the overflow rate are included by default — for a matrix-priced service the tiers ARE the real price, so leave that on for a general increase. A percentage leaves a $0.00 row at $0.00; use a flat adjustment to price something that has none.",
          },
          {
            step: "Price Adjustment runs (live work)",
            detail:
              "The Price Adjustments tab changes what clients are billed going forward. Pick percent or flat plus a rounding rule, choose targets (client job service rates, package monthly amounts, package service rates), optionally narrow by service and job type, then Preview changes. The preview is a line-by-line before/after naming each client and job, with the total change broken down per target. Name the run and apply. Signed contracts, already-issued invoices, and per-visit rate overrides are never touched.",
          },
          {
            step: "Leaving a customer out",
            detail:
              "Every line in the preview has a checkbox, ticked by default. Untick one and it's struck through, badged 'excluded', and dropped from the selected count and the total — so a price increase that shouldn't cover a promised-rate account doesn't need its own narrower run. To skip a whole client or service at once, search their name in 'Search these lines' and use Exclude shown, which acts only on what the search is displaying; the header checkbox does the same. The confirmation states both numbers before writing: 'Re-price 12 lines by +$201.00? 3 lines you unticked will be left alone.'",
          },
          {
            step: "Safety rails",
            detail:
              "Changing the form after previewing clears the preview, your ticks and the Apply button, so you can't apply numbers you didn't look at. A run only ever touches lines you ticked, so rows created after your preview are never swept in — and if one of those lines was re-priced by someone else in the meantime it's skipped rather than increased from a figure you never saw, with the toast reporting how many.",
          },
          {
            step: "Undoing a run",
            detail:
              "Adjustment History lists every run with an undo arrow that restores each line's original price. Undo deliberately skips any line you re-priced by hand since the run and tells you how many it left alone — a later manual decision is never thrown away. A reverted run stays in the history and can't be undone twice.",
          },
          {
            step: "Permissions",
            detail:
              "Two separate keys under Scheduling > Service Access in Roles, both off by default for non-admin roles: 'Bulk Update Catalog Prices' shows the Bulk Prices button, 'Run Price Adjustments' shows the Price Adjustments and Adjustment History tabs. The second is enforced server-side, not just hidden in the UI.",
          },
          {
            step: "Full guide",
            detail:
              "Which price lives where, what each tool touches, and how the undo's skip behaviour works.",
            href: "/settings/support/services-pricing-guide",
            linkLabel: "Open the Services & Pricing guide",
          },
        ],
      },
      {
        id: "sales-meetings",
        title: "Sales Meetings",
        summary: "Book sales appointments per rep, catch double-bookings, and remind reps and clients automatically.",
        icon: Handshake,
        steps: [
          {
            step: "Setting up sales reps",
            detail:
              "Only employees flagged as a sales rep show up on the calendar. Mark someone as a sales rep (and make sure they're active) in Team > Employees before booking meetings for them.",
          },
          {
            step: "Where it is",
            detail:
              "CRM > Sales Meetings shows a per-rep Day, Week, or Month calendar. Click any open slot to book a new meeting for that rep and time, or click an existing meeting to edit it.",
          },
          {
            step: "Booking a meeting",
            detail:
              "Pick a sales rep, an existing client (or a free-text lead name for a new prospect), a title, meeting type (in person, phone, video), date/time, and duration. Location accepts either an address or a meeting link.",
          },
          {
            step: "Double-booking warning",
            detail:
              "If the picked rep already has another meeting overlapping the chosen time, the dialog warns you when you save — it does not block the save. This matches the same-class overlap warning used on the Dispatch Board.",
          },
          {
            step: "Linking to estimates and tickets",
            detail:
              "Once a client is selected, the dialog lets you link the meeting to one of that client's existing estimates or tickets — useful for tying an in-person walkthrough back to the estimate it's discussing.",
          },
          {
            step: "Reminders",
            detail:
              "60 minutes before a scheduled meeting, the assigned rep gets an in-app and email reminder automatically (toggle either off in Settings > Notifications). If the meeting has a client, a separate 'Sales Meeting Reminder' automation trigger is also available in the Automations builder for a client-facing reminder.",
          },
          {
            step: "Rescheduling",
            detail:
              "Changing a meeting's date or time re-arms its reminder so it fires again for the new time. Editing anything else (notes, title, link to an estimate) leaves an already-sent reminder alone.",
          },
          {
            step: "Full guide",
            detail:
              "Sales-rep visibility rules, exactly how the double-booking check compares meetings, and the split between the rep's direct reminder and the client-facing automation trigger.",
            href: "/settings/support/sales-meetings-guide",
            linkLabel: "Open the Sales Meetings guide",
          },
        ],
      },
      {
        id: "waiting-list-snow",
        title: "Waiting List & Snow Jobs",
        summary: "Queue opportunistic work and manage storm-based snow dispatch.",
        icon: Snowflake,
        steps: [
          {
            step: "What the Waiting List is for",
            detail:
              "CRM > Scheduling > Waiting List holds jobs with type Waiting List or Package that don't have a fixed date yet — only a date range (e.g. 'From May 1' or 'May 1 – May 15'). Filter by Client, Service, Date Range, City, Zip, Crew, or Rate.",
          },
          {
            step: "Dispatching from the waiting list",
            detail:
              "When a crew has an opening nearby, click 'Dispatch' on a waiting-list job to assign a firm date and crew, converting it into a scheduled visit. Matching today is by City/Zip filtering rather than GPS geofencing.",
          },
          {
            step: "Storm events",
            detail:
              "CRM > Scheduling > Snow Jobs is organized around Storm Events, not individual visits. Click '+ New Storm Event', name it (defaults to 'Snow Event' plus the date), and set the event date, forecast depth, and temperature.",
          },
          {
            step: "Dispatching snow visits",
            detail:
              "Add jobs to the storm event, then dispatch visits in priority order — High before Normal before Low, set per client. Storm event status moves Pending → Working → Complete.",
          },
          {
            step: "Snow invoicing",
            detail:
              "CRM > Accounting > Snow Invoicing groups a client's uninvoiced storm visits and computes the amount from the job's invoice type: a flat rate per event, a rate per inch of snowfall (per event or per push), or an hourly rate × actual hours logged.",
          },
          {
            step: "Full guides",
            detail:
              "The Waiting List's filtering and dispatch flow gets its own deep dive; storm-event dispatch and snow invoice types get a dedicated guide.",
            href: "/settings/support/waiting-list-guide",
            linkLabel: "Open the Waiting List guide",
          },
          {
            step: "Snow Jobs guide",
            detail:
              "Storm events, priority-based visit dispatch, and a worked example of all three snow invoice types with dollar amounts.",
            href: "/settings/support/snow-guide",
            linkLabel: "Open the Snow Jobs & Storm Dispatch guide",
          },
        ],
      },
      {
        id: "invoicing-contracts",
        title: "Invoicing & Contracts",
        summary: "Bill clients, track payments, and manage recurring service contracts.",
        icon: Receipt,
        steps: [
          {
            step: "Invoice status",
            detail:
              "Invoices move Draft → Sent → Viewed → Partial → Paid, with Overdue and Void as side states. Payments can be recorded against an invoice with a specific method — Cash, Check, ACH/E-Check, AutoPay, Credit Card by network, AR Write-off, or Other.",
          },
          {
            step: "Every invoice line bills a service",
            detail:
              "Each invoice line has a service dropdown and an invoice can't be saved until every line has one — there are no free-form lines. The service decides where revenue lands in reports and which commission rate applies. Lines from visits, estimates and contracts get their service automatically; a line without one shows in amber. The invoice CSV import needs a 'service' column that matches a service in your catalog (rows that don't match are skipped).",
          },
          {
            step: "Sale type on an invoice",
            detail:
              "Sale Type (New sale or Renewal / existing account) sits next to the Sales Rep and decides which commission rate applies. Blank uses the job's, contract's or estimate's sale type, then counts as a new sale. Both are fixed when the invoice is issued; after that only someone who manages commissions can change them.",
          },
          {
            step: "Photos on an invoice",
            detail:
              "Open the invoice's Photos tab (or 'Photos to include' in the email dialog) to attach up to 12 photos from the invoice's visits and jobs, Job Photos linked to the client or project, or direct uploads. They print on extra PDF pages and show as a gallery on the client's online invoice page. HEIC iPhone photos are converted automatically; only JPEG and PNG print in the PDF, and Print Selected leaves photos out.",
          },
          {
            step: "Other charges (fixed or % of invoice)",
            detail:
              "Settings > Accounting > Other Charges is a catalog of fees — late fee, trip charge, fuel surcharge — each with a name, a printed description, a Taxable switch and an amount that is either Fixed $ or % of invoice (e.g. 4.5%). Add one from an invoice's Add Line Item list, or to many invoices at once from the Invoices list (Actions > Add Other Charge, needs Add / modify invoices). A percent charge is worked out when you add it, from that invoice's service lines (each line after its own discount; other charges and the invoice discount aren't counted), and the line prints with the percent, e.g. 'Fuel Surcharge (4.5%)'. It is then a fixed-dollar line that doesn't change if the services are edited, and changing the catalog never changes lines already on invoices. In bulk, each invoice gets its own dollar figure; the percent (or amount) can be overridden for that run, and locked, void or service-less invoices are skipped. 'Add common charges' seeds nine standard fees at $0.00 as Fixed $ — switch the ones you charge as a percentage. Other charges need no service and earn no commission.",
          },
          {
            step: "Invoices list columns and filters",
            detail:
              "The Columns menu adds Account Balance, Prepay, Credits, Payment type, Sent / Printed (where a draft is queued, or Sent/Printed once issued) and Frequency (the contract's cadence, or One-time). Filters: Date takes a from/to range, Balance takes At least / At most / Exactly, and Status and Payment type are pick-from-list (Status matches what the column shows, so a past-due Sent invoice is under Overdue). The Payments page has the same Date range filter; it opens on Last 30 Days, the All tab shows every payment, and searching or filtering reaches past the 30-day window.",
          },
          {
            step: "Limits, voids and disputes",
            detail:
              "Payment amounts must be greater than $0. Discounts can't be negative or exceed the subtotal, and tax rate is limited to 0-100%. An invoice with payments applied can't be voided — hover the greyed-out Void button to see why (refund or unapply first); Charge shows why it's disabled too (for example a bank debit still settling). While a card chargeback is open, the invoice is flagged and drops out of the To Charge queues and can't be charged again until the dispute closes.",
          },
          {
            step: "Paying across sub-accounts",
            detail:
              "Recording a payment against a commercial parent with sub-accounts shows open invoices from the parent AND every sub-account, grouped by account — covers a property manager sending one check for several HOAs' invoices at once. A sub-account's own invoice list tags that payment 'via [Parent Name]'.",
          },
          {
            step: "Contracts",
            detail:
              "CRM > Accounting > Contracts covers ongoing agreements: an amount per invoice, a Billing Frequency (Monthly, Quarterly, Annual, Weekly, Every 2 weeks or One time — set in the contract's Invoice Details), auto-renew, billing day of month, and whether the contract bills a month in advance. The amount is charged per invoice at every frequency, not annualized: a $3,000-a-quarter contract stores $3,000. Monthly contracts have a 12-month grid so each month can bill a different amount (a month at $0 is skipped); every other frequency has one Amount per invoice field and shows the months or dates it will bill in. The contracts list shows the cadence ('$3,000.00 / quarter'), and a monthly contract whose months differ shows its yearly total ('$4,100.00 / yr · 8 months (varies)'). The end date can't be before the start date. If a contract starts mid-cycle you can choose 'Prorate first period' (a daily-prorated first invoice for the partial stretch, then normal billing) or leave the default of starting on the first full cycle. Editing the financial terms of a signed contract keeps it billing at the new terms and flags it 'Changed since signed — needs client approval' until you clear the flag. Visits on a cancelled, expired or inactive contract bill like normal per-visit work.",
          },
          {
            step: "Sub-properties on one contract",
            detail:
              "A commercial contract can be set to include sub-properties — billing every property on the SAME client's account from a single contract rather than issuing one contract per address. This is for one client billed together across multiple sites, not the parent/child (sub-account) hierarchy — that's for locations that need their own independent jobs/invoicing.",
          },
          {
            step: "The 'PO Number' field is not the internal PO module",
            detail:
              "The PO Number shown on an invoice or estimate PDF is a free-text field for the client's own purchase order reference — it has no link to this platform's internal vendor Purchase Orders (Requisitions → POs → Receiving). Don't confuse the two.",
          },
          {
            step: "Linking job costs to vendor POs",
            detail:
              "To reconcile what a job actually cost against vendor purchase orders, assign the PO line item to a CRM Project (via the line item's Project field) rather than to a specific job — cost tracking rolls up at the project level.",
          },
          {
            step: "Full guides",
            detail:
              "Invoice status state machine, partial payments, and the PO-Number gotcha get a dedicated guide; contract billing frequency and sub-property billing get their own.",
            href: "/settings/support/invoicing-guide",
            linkLabel: "Open the Invoicing & Payments guide",
          },
          {
            step: "Contracts guide",
            detail:
              "Billing frequency, month-by-month seasonal overrides, and billing every property under a commercial hierarchy from one contract.",
            href: "/settings/support/contracts-guide",
            linkLabel: "Open the Contracts guide",
          },
        ],
      },
      {
        id: "online-payments-stripe",
        title: "Online Payments (Stripe)",
        summary: "Connect your Stripe account, then save cards/bank accounts on file and charge clients directly from an invoice.",
        icon: CreditCard,
        steps: [
          {
            step: "One-time setup: connect your Stripe account",
            detail:
              "CRM > Settings > Card Payments (Stripe). Click Connect and complete Stripe's onboarding — this creates a Standard connected Stripe account for your org, fully independent of Landscapt's own billing. Charges, payouts, and your Stripe dashboard login are entirely managed by Stripe; Landscapt only initiates charges and listens for the result. If you already have a Stripe account, click 'Connect your existing account' (shown until you're connected) to link it through Stripe instead of creating a new one; admins only, and an account can be linked to one Landscapt organization only.",
          },
          {
            step: "Managing your Stripe account",
            detail:
              "Once connected, 'Manage on Stripe' opens dashboard.stripe.com directly — log in there with your own Stripe credentials to see payouts, statements, and update your bank details for deposits.",
          },
          {
            step: "Turning on ACH / bank transfer payments",
            detail:
              "Stripe's own ACH toggle in their dashboard does not control whether Landscapt can accept bank transfers — it only affects Stripe's automatic payment-method detection. Enabling ACH here requires two things: ACH Direct Debit activated on your Stripe account, and the separate 'Enable ACH / bank transfer payments' checkbox in CRM > Settings > Card Payments (Stripe). Until both are on, only card payments are offered.",
          },
          {
            step: "Processing fees",
            detail:
              "The card processing fee is off by default for new companies; turn it on under Settings > Payments. It applies to credit cards only (never debit or prepaid cards, never ACH), as either a flat rate or Cover the card fee mode (capped at 4%). The card is authorized first and captured with the fee included. Staff can waive the fee or override it to a custom amount on any single charge. Fees collected flow into the Profit & Loss report as 'Credit card processing fees' income, and the Credit Card Processing Fees report itemizes every fee by payment.",
          },
          {
            step: "Saving a card or bank account on file",
            detail:
              "From a client's Details tab, use 'Payment Method on File' to save a card or ACH bank account — staff can enter the client's card themselves, without the client needing to do anything on their end. Saving a method defaults to enrolling the client in Autopay, but there's a checkbox to save the method without turning Autopay on, for clients who just want a card kept on file for you to charge manually.",
          },
          {
            step: "Autopay vs. a saved method",
            detail:
              "A saved payment method and Autopay are independent settings, toggled separately in the client's Payment Method on File section. Autopay On means the client's saved method is eligible for the 'To Charge' / 'ACH To Charge' invoice tabs and bulk 'Charge All' action. Autopay Off still lets staff charge that saved method any time via 'Charge Saved' — it just won't be swept up automatically.",
          },
          {
            step: "Charging an invoice",
            detail:
              "From an invoice, 'Charge Saved' uses the client's card/bank on file; the Card/Bank toggle lets staff key in a fresh card or account for a one-off charge instead. The Invoices list's 'To Charge' and 'ACH To Charge' tabs show every invoice eligible for its respective saved method, with a per-row Charge button and a bulk 'Charge All' in the Actions menu.",
          },
          {
            step: "Charging across multiple invoices at once",
            detail:
              "In Add Payment, 'Charge a Card/Bank Instead' switches the same client + invoice allocation table used for recording a manual payment into a real Stripe charge — one card/bank charge for the combined total, split across however many invoices are checked, using the client's saved method or a freshly entered card/bank.",
          },
          {
            step: "Where a payment shows up",
            detail:
              "A successful online charge posts automatically as a payment against the invoice(s) it was allocated to — no manual recording needed. It can take a few seconds after checkout to appear while Stripe's confirmation is processed; if it hasn't shown up after a minute, check the payment wasn't declined before assuming something's wrong.",
          },
        ],
      },
      {
        id: "communication-automations",
        title: "Communication & Automations",
        summary: "Trigger event-driven emails, texts, and alerts without manual follow-up.",
        icon: Zap,
        steps: [
          {
            step: "Automation structure",
            detail:
              "CRM > Communication > Automations. Each automation contains one or more Sequences; a sequence has Triggers (with optional Trigger Conditions), Stop Conditions, and an ordered list of Events that run once triggered.",
          },
          {
            step: "Custom field conditions",
            detail:
              "Trigger conditions, stop conditions, and If Branches can check a client custom field: pick the field, then compare it (text: equals, not equals, contains, does not contain, is set, is not set; number: also greater/less than). The condition reads the client's saved value at trigger time and at each stop/If check. A client with no value only matches 'is not set'. If the field is later deleted, the condition is never met and the editor shows 'Field deleted'.",
          },
          {
            step: "If Branch blocks",
            detail:
              "An If Branch guards a block of steps: everything inside runs only when all its conditions are met, and everyone else skips the whole block and carries on with the step after it. Add a branch, then use 'Add step inside' on its card to put steps in it (any type, including another If Branch); they show indented under an orange line. Steps are added at the end of the sequence or of the block — there's no drag-to-reorder yet. Deleting a branch deletes its block. A deactivated branch isn't checked, so its steps run for everyone. Branches built before blocks existed guarded only the one step after them; that step was moved inside automatically so nothing changed. The execution log shows 'branch true' (block ran) or 'branch false' (block skipped).",
          },
          {
            step: "What can trigger a sequence",
            detail:
              "Client/lead events (created, cancelled, converted, card charge failed), dates (a specific date, day of week, or an anniversary of the client's start date), estimate events (sent, won, lost, expiring, no response), form submissions, invoice events (past due, paid), job/visit events (created, cancelled, completed, dispatched, skipped, moved to waiting list), tag added/removed, and ticket events (created, past due, closed, reopened).",
          },
          {
            step: "What an event can do",
            detail:
              "Wait (delay), Email, Text Message, Alert (Info / Warning / Urgent), Ticket (with priority Low / Normal / High / Urgent), If/Branch, Note, Update a field, or add/remove Tags.",
          },
          {
            step: "Email send windows",
            detail:
              "An email event can be restricted to weekdays only and a specific send-time window, and can require manual approval before it actually sends — useful for anything you want a human to glance at first.",
          },
          {
            step: "Forms and campaigns",
            detail:
              "Forms (Draft / Published) capture leads and route submissions into automations via the 'form submitted' trigger. Sales Campaigns (Draft, Scheduled, Sending, Active, Paused, Completed, Cancelled) send email, SMS, or postcard blasts to a segment — All Clients, Active Clients, Leads, Past Clients, or a custom list — and track delivered/opened/clicked/unsubscribed counts.",
          },
          {
            step: "Full guides",
            detail:
              "A deeper walkthrough of sequences/triggers/events with a worked example, plus Automations vs. Sales Campaigns compared side by side.",
            href: "/settings/support/automations-guide",
            linkLabel: "Open the Communication Automations guide",
          },
          {
            step: "Forms guide",
            detail:
              "Field types, embedding a public form, what happens on submission, and the two things to know before sharing a link publicly.",
            href: "/settings/support/forms-guide",
            linkLabel: "Open the Forms & Lead Capture guide",
          },
        ],
      },
      {
        id: "tickets",
        title: "Tickets",
        summary: "Track customer-service issues from open through closed.",
        icon: Ticket,
        steps: [
          {
            step: "What a ticket is",
            detail:
              "A CRM customer-service record — distinct from a CMMS Maintenance Request, which is for asset/equipment issue triage. A published form creates an open ticket for each submission unless you turn off Ticket Settings on the form (the default is on), in addition to manual creation and automation-driven creation.",
          },
          {
            step: "Status and priority",
            detail:
              "Status is one of Open, On Hold, Pending, or Closed. Priority is Low, Normal, High, or Urgent. A ticket can also be typed as a Note, Call, or Event — the same underlying list view covers all three.",
          },
          {
            step: "Assignment",
            detail:
              "Assign a ticket to a specific user. Notification preferences let that person (and anyone watching) get alerted on assignment and new comments, both by email and in-app.",
          },
          {
            step: "Show in client portal",
            detail:
              "A ticket linked to a client has a 'Show in client portal' switch (also on the New Ticket form), off by default. When on, the client sees the subject, category, status and notes in their portal, never comments, files or the assignee.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full lifecycle from form submission to close, the real status/priority/type values, and a clear line between Tickets and CMMS Maintenance Requests.",
            href: "/settings/support/tickets-guide",
            linkLabel: "Open the Tickets guide",
          },
          {
            step: "Field upsells from crews",
            detail:
              "Work a crew spots at a property arrives as a normal ticket with category 'Upsell', carrying their note, who spotted it, the date, the property, the suggested service, and any photo they took (on the Files tab — usually enough to price it without a trip out). The ticket is linked back to the job. Crews never see or set a price; they pick from a list you control by ticking 'Show in field upsells' on a service under Services & Pricing. With no services ticked the Suggest work button doesn't appear in the crew app, which is how the feature is switched on and off. To take one forward, click Create estimate on the ticket (needs the Add Estimate permission): it makes a draft estimate for the client with the suggested service already on it at your catalog rate, links the two, and opens it ready to price. A ticket can only be converted once — the estimate claims it, so two people clicking at the same time, or an interrupted conversion, reopens the estimate that already exists instead of building a second one; deleting that estimate makes the ticket convertible again. You can still link extra estimates by hand from Linked Records when work is re-quoted, and the reports read the most recent one. That link is what makes a suggestion measurable, since the estimate carries the Won/Lost stage while ticket open/closed only means whether the office has dealt with it. Two Report Center reports read it: Field Upsells (every suggestion and its outcome) and Upsell Conversion by Crew Member (submissions against revenue won).",
          },
        ],
      },
      {
        id: "damage-cases",
        title: "Damage Cases",
        summary: "Track property damage during a job and warranty claims.",
        icon: AlertTriangle,
        steps: [
          {
            step: "Two kinds of case, one record shape",
            detail:
              "CRM > Tools > Damage Cases covers both property damage during a job (e.g. a mower hitting a sprinkler head) and warranty claims (e.g. a plant dying in its warranty window), distinguished by a Case Type field.",
          },
          {
            step: "Cost tracking",
            detail:
              "A case's cost is the sum of its linked expense entries, not a single manual total. A case can optionally link to one existing Purchase Order.",
          },
          {
            step: "Status",
            detail:
              "Open, In Progress, Resolved, or Closed. Creating a case can fire both an internal automation and a Zapier trigger. Once Resolved or Closed, adding an expense or editing the description/resolution notes is blocked until the case is reopened.",
          },
          {
            step: "Linking a warranty",
            detail:
              "For Warranty cases, an optional Warranty picker lists your active warranties. Choosing one fills in the customer and warns if the incident date falls outside its coverage; the case header then shows whether the incident was covered. The warranty tracks how many claims and how much spend sit against it.",
            href: "/settings/support/warranties-guide",
            linkLabel: "Open the Warranties guide",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a worked example, and a real current limitation worth knowing about client-linking before you rely on filtering cases by client.",
            href: "/settings/support/damage-cases-guide",
            linkLabel: "Open the Damage Cases guide",
          },
        ],
      },
      {
        id: "warranties",
        title: "Warranties",
        summary: "Track the warranties you give on walls, walkways, patios and renovations.",
        icon: ShieldCheck,
        steps: [
          {
            step: "Where warranties live",
            detail:
              "A Warranties tab on each client, project and job, plus a Warranties page under Scheduling with search and status filters. Each warranty has a name, coverage note, length in months, start and end date, and an optional damages-covered cap.",
          },
          {
            step: "Warranty types",
            detail:
              "On the Warranties page, Types lets you define what you offer (for example Retaining wall — 60 months). Picking a type fills in the length and coverage wording; you can still change them on the warranty.",
          },
          {
            step: "When the clock starts",
            detail:
              "On an unfinished project, leave the start date blank: the warranty shows Not started and begins automatically the day the project is marked Complete. Elsewhere the start defaults to today. The end date is the day before the anniversary (12 months from March 15 covers through March 14).",
          },
          {
            step: "Renew, void, delete",
            detail:
              "Renew creates a new warranty of the same length starting the day after the old one ends (or today if it already ended). Void removes a warranty from coverage but keeps it; Delete removes it from the lists.",
          },
          {
            step: "Claims and reminders",
            detail:
              "Warranty cases link to the warranty they're claimed against. Each morning, warranties within 30 days of ending trigger one reminder to the client's sales rep so they can offer a renewal.",
          },
          {
            step: "Permissions",
            detail:
              "View Warranties shows the tabs and page; Add/Edit/Void Warranties allows changes and managing types. Both are set per role in Settings > Roles under Scheduling.",
          },
          {
            step: "Full guide",
            detail: "Statuses, renewal rules, and how claims and reminders work in detail.",
            href: "/settings/support/warranties-guide",
            linkLabel: "Open the Warranties guide",
          },
        ],
      },
      {
        id: "commissions",
        title: "Sales Commissions",
        summary: "Pay reps a percentage of what they sell, by service and sale type.",
        icon: Percent,
        steps: [
          {
            step: "Plans and rules",
            detail:
              "Settings > Commissions (also linked from Accounting > Commissions). A plan holds rules; each rule sets a percentage for a service, a service category or all services, for new sales, renewals or both, earned when the payment is collected or when the invoice is issued. The most specific rule wins (service, then category, then all; a sale type beats 'New & renewal').",
          },
          {
            step: "Assigning reps",
            detail:
              "Assign an employee a plan with an effective date. A rep can hold several plans at once, such as outside sales plus renewals. End a plan with 'End today'.",
          },
          {
            step: "New sale vs renewal",
            detail:
              "Set Sale Type on an estimate, contract, job or invoice. An invoice uses its own, then its job's, contract's and estimate's; blank counts as a new sale. The office decides, so a one-time job for an existing customer can still be paid as a new sale.",
          },
          {
            step: "How earnings are calculated",
            detail:
              "Per invoice line, on pre-tax revenue after discounts. The rep (and sale type) is fixed when the invoice is issued: the invoice's own, else the job's, contract's, estimate's, then the client's rep at that moment — reassigning a client later only affects later invoices. After issue only Manage can change an invoice's Sales Rep or Sale Type, and not while its commission is on a statement. 'When paid' rules earn on each payment applied (net of refunds); 'when invoiced' rules earn on the invoice date. Every line needs a service — lines without one only earn under an All services rule.",
          },
          {
            step: "Statements",
            detail:
              "Create statement on the Earnings tab locks a rep's unclaimed earnings for a period, plus any earlier earnings no statement has claimed yet (a payment entered late, a deposit applied later), marked 'Earlier period'. Each earning line can be on only one live statement, whoever the rep, so nothing is paid twice. Draft → Approved → Paid; Void releases the lines (not allowed once paid). If a payment is refunded or deleted, or an invoice is voided or edited down after it was statemented, the rep's next statement gets a negative Adjustment line for the difference (once per change, at the original rate; a reversed refund adds back a positive one).",
          },
          {
            step: "Not covered",
            detail:
              "Percentages only (no flat per-job amounts), and annual bonuses tied to company results aren't calculated here. Permissions under Commission Access in Settings > Roles: View My Own Commissions (a rep sees only their own earnings and their approved or paid statements), View All Reps', and Manage (statements plus plans, rules and assignments in Settings > Commissions). Plans are visible only to Manage.",
          },
          {
            step: "Full guide",
            detail: "Rules, sale types, earnings math and statements in detail.",
            href: "/settings/support/commissions-guide",
            linkLabel: "Open the Commissions guide",
          },
        ],
      },
      {
        id: "injury-cases",
        title: "Injury & Near-Miss Cases",
        summary: "Report injuries, illnesses and near misses from the field and follow them up in the office.",
        icon: HeartPulse,
        steps: [
          {
            step: "Report from the field",
            detail:
              "Job Photos > Field > Injury / Near Miss is a phone-friendly form based on your paper Employee's Report of Injury. Choose Injury, Illness or Near miss, then fill in who, when, what happened, the injury, and what could have prevented it. Submitting opens a new case. The same menu has a Damage Report form that opens a Damage Case.",
          },
          {
            step: "Follow up in the office",
            detail:
              "Tools > Injury Cases shows Days Since Last Injury, open and closed cases, and year-to-date totals above a searchable list. Open a case to set severity, days away, how the cost is handled (workers' comp or self-pay), cause and corrective action, and to attach your completed investigation PDF on the Files tab.",
          },
          {
            step: "Self-pay expenses",
            detail:
              "If the company pays instead of filing a workers' comp claim, log the costs on the case's Expenses tab (medical, lost wages or other). The total shows in the list and on the Reporting tab.",
          },
          {
            step: "Supervisor alerts",
            detail:
              "Filing a report alerts the named supervisor (if they match an employee with a login) and everyone on the Injury & Near-Miss Report Recipients list in Settings > Notifications (default: all admins and managers). The reporter is never alerted about their own report, and anyone can opt out.",
          },
          {
            step: "Near misses count differently",
            detail:
              "A near miss is tracked but never resets Days Since Last Injury or the Accident Free Workdays KPI. That KPI is calculated automatically from Injury Cases: Monday-Friday workdays since the last injury or illness.",
          },
          {
            step: "Full guide",
            detail:
              "Every field, status, who can see injury records, and how this works alongside your paper investigation form.",
            href: "/settings/support/injury-cases-guide",
            linkLabel: "Open the Injury & Near-Miss Cases guide",
          },
        ],
      },
      {
        id: "client-portal",
        title: "The Client Portal",
        summary: "A separate, invite-only login where clients pay invoices and act on estimates.",
        icon: Globe,
        steps: [
          {
            step: "Inviting a client",
            detail:
              "From a client's '…' menu, send a portal invite. It emails a 7-day registration link. The portal is a fully separate login from staff accounts — a client cannot use it to access the main app.",
          },
          {
            step: "What a client can do",
            detail:
              "Not read-only: a client can pay invoices via Stripe (card or ACH), and can accept (with e-signature), decline, or request changes on estimates. Up to seven tabs are available — Home, Billing, Services, Estimates, Tickets, Documents, Account — and an org can hide three of them.",
          },
          {
            step: "What stays hidden, and sharing tickets",
            detail:
              "Draft invoices and unsent estimates never appear in the portal and can't be paid from it. Invoice and estimate PDFs are the real PDFs. Tickets the client submits show up automatically; for one you created, turn on 'Show in client portal' on the ticket (it needs a linked client) — the client sees only the subject, category, status and description, never comments, files or the assignee. Documents have separate View and Download buttons. The portal shows the last sent version of an estimate and refuses acceptance after its Valid until date.",
          },
          {
            step: "Configuring what's visible",
            detail:
              "Landscapt Settings > Client Portal controls which optional tabs are shown.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full invite/registration flow, e-signature estimate approval, multi-org clients, and a known dead-code gotcha worth being aware of.",
            href: "/settings/support/client-portal-guide",
            linkLabel: "Open the Client Portal guide",
          },
        ],
      },
      {
        id: "job-photos",
        title: "Job Photos",
        summary: "A paid add-on for field photo documentation, annotation, and before/after comparisons.",
        icon: Camera,
        steps: [
          {
            step: "What it's for",
            detail:
              "A photo-documentation system organized around lightweight Photo Jobs, optionally linked to an Equipt Project or a Landscapt Client. Access is role-based, not crew-exclusive — Admins and Crew get it automatically, others need it enabled.",
          },
          {
            step: "Uploading",
            detail:
              "Camera, photo library, video, or generic file uploads are client-side compressed and GPS-tagged from live device location.",
          },
          {
            step: "Annotation and before/after",
            detail:
              "Admins/Managers can mark up a photo with arrows, circles, text, and freehand drawing, and pair photos into labeled Before/After comparisons with a slider view.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — real access rules, the annotation tool, before/after pairing, and current limitations (manual client linking, no visit/work order link).",
            href: "/settings/support/job-photos-guide",
            linkLabel: "Open the Job Photos guide",
          },
        ],
      },
      {
        id: "report-center",
        title: "Report Center & Dashboards",
        summary: "75 reports across 12 categories, curated and custom dashboards, and a customizable KPI Scorecard.",
        icon: BarChart3,
        steps: [
          {
            step: "Where it lives",
            detail:
              "CRM > Reports. A 6-tab shell: Dashboard (the legacy overview), Custom Dashboards, Report Center (the searchable catalog), My Reports (saved analyses), Payroll (crew hours from Start Day / End Day, editable and exportable; admins and managers only), and Graphics Library.",
          },
          {
            step: "Categories",
            detail:
              "Service, Client, Revenue, Schedule Lists, Job Costing, Financial, Audits, Lead, Estimates, Job Hours, Receivables, and Forms.",
          },
          {
            step: "Exporting",
            detail:
              "CSV, Excel, PDF, and print are all available on demand. There is no scheduled or emailed report delivery today.",
          },
          {
            step: "KPI Scorecard",
            detail:
              "Dashboards > KPI Scorecard scores annual targets by category. Metrics tagged auto are computed live from Landscapt data (invoices, payments, visits, estimates, clients, employees); the rest are typed in. Click Customize to add metrics from the catalog, add your own manual metrics, set weights, or remove any row. Viewing needs the View Report Center permission; editing targets, manual actuals, or the layout needs Manage Report Center.",
          },
          {
            step: "Company Report",
            detail:
              "Dashboards > Company Report is a live sales/operations/A-R snapshot, always \"as of now\" (YTD from Jan 1, trailing 3 months for the monthly tables). Progress bars on the KPI row read Targets from that org's KPI Scorecard. The flags section is rule-based (fixed dollar/percent thresholds), not AI-generated commentary.",
          },
          {
            step: "Social Media dashboard",
            detail:
              "Dashboards > Social Media tracks your accounts week by week. Someone logs each week's numbers per platform (posts, views, profile views, likes, comments, shares, saves, followers, leads) from each platform's own analytics; the dashboard shows trends, a platform comparison, and this month against editable minimum/stretch goals. Add, hide or reorder platforms from Add / hide platforms (hiding keeps past numbers). Admins and managers can log and edit; give another role the Social Media: Enter & Edit Data permission to let them too. Each dashboard also has its own View permission in the role editor.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a worked example running the Production Rate Accuracy report end to end, and the distinction between curated and custom dashboards.",
            href: "/settings/support/report-center-guide",
            linkLabel: "Open the Report Center guide",
          },
          {
            step: "Reports reference",
            detail:
              "A description, available filters, and known gotchas for every one of the ~75 reports, organized by section — for researching a specific report rather than the Report Center itself.",
            href: "/settings/support/reports-reference-guide",
            linkLabel: "Open the Reports Reference guide",
          },
        ],
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    icon: Settings2,
    articles: [
      {
        id: "approval-flows",
        title: "Configuring Approval Flows",
        summary: "Set up multi-step approval chains for requisitions and POs.",
        icon: GitMerge,
        steps: [
          {
            step: "Open Approval Flows",
            detail:
              "Go to Settings > Approval Flows. There are separate flows for Requisitions and Purchase Orders.",
          },
          {
            step: "Add steps",
            detail:
              "Each flow can have one or more approval steps in sequence. For each step, assign either a specific user or a role (e.g., any Manager). If a role is assigned, any user with that role can approve.",
          },
          {
            step: "Approval chain order",
            detail:
              "Steps are processed in order. Step 1 approver is notified first. After they approve, Step 2 is notified. All steps must approve before the entity reaches 'Approved' status.",
          },
          {
            step: "Rejection",
            detail:
              "Any approver in the chain can reject. This moves the entity to 'Rejected' status immediately and notifies the original requester by email with the rejection comment.",
          },
          {
            step: "Multiple eligible approvers on one step",
            detail:
              "If a step is assigned to a role (e.g., any Manager), every user with that role — including the requester, if they hold the role — is listed as an eligible approver for that step. Whoever decides first resolves the step; the other eligible approvers' entries are marked 'Superseded' and no longer actionable.",
          },
          {
            step: "Reordering steps and admin-only steps",
            detail:
              "Drag a step by its grip handle to reorder; on a phone or narrow screen use the up/down arrows on each step instead. Managers can approve on behalf of another approver, but never on a step whose required role is admin — only an admin can decide those.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a worked 2-step example with dollar-threshold routing, the full state-machine table, and the 'Superseded' self-approval gotcha explained.",
            href: "/settings/support/approval-flows-guide",
            linkLabel: "Open the Approval Flows guide",
          },
        ],
      },
      {
        id: "notifications-setup",
        title: "Notification Preferences",
        summary: "Control which events trigger email and in-app alerts.",
        icon: Bell,
        steps: [
          {
            step: "In-app notifications",
            detail:
              "The bell icon in the top bar shows live alerts for overdue work orders, low stock parts, pending approvals, and upcoming PM schedules. These update in real time.",
          },
          {
            step: "Warranty expiring",
            detail:
              "A reminder goes out once per end date when a warranty is within 30 days of ending — to the client's sales rep (in-app and email), or, when the client has no rep or the rep has left or can't be reached, to the organization's admins (in-app and email, per each admin's settings). Turn either off under Settings > Notifications > Warranty Expiring Soon.",
          },
          {
            step: "Per-user preferences",
            detail:
              "Go to Settings > Notifications to toggle which events show as in-app or email notifications. Preferences are per-user and save automatically.",
          },
          {
            step: "Email notifications",
            detail:
              "Approval flow emails (requested, approved, rejected) send automatically when a verified sender domain is configured. Contact your admin if you are not receiving approval emails.",
          },
          {
            step: "Automation notifications",
            detail:
              "The 'Send Notification' automation action pushes an alert to users by role (e.g., all Managers). Use this for custom trigger-based alerts beyond the built-in ones.",
          },
          {
            step: "Full guide",
            detail:
              "A complete table of every notification event, which ones are email-only or in-app-only, and how personal preferences differ from the admin-controlled recipient pool.",
            href: "/settings/support/notification-preferences-guide",
            linkLabel: "Open the Notification Preferences guide",
          },
        ],
      },
      {
        id: "vendors",
        title: "Managing Vendors",
        summary: "Vendors are shared across Purchasing, Maintenance, and CRM.",
        icon: Boxes,
        steps: [
          {
            step: "Shared vendor directory",
            detail:
              "Vendors live in a single shared table. A vendor can supply landscape materials (used on POs), maintenance parts/services (used on work orders), or field-service subcontractor/chemical-supplier work (used on CRM jobs and contracts). There is no module-specific vendor list.",
          },
          {
            step: "Adding a vendor",
            detail:
              "Go to Vendors in the sidebar. Click '+ New Vendor'. Enter name, contact name, email, phone, and the address in separate Street, City, State and Zip boxes (Google checks it when you leave the field and offers a correction you can accept or ignore). Vendors are immediately available on all Requisition, PO, and CRM forms.",
          },
          {
            step: "Renaming a vendor",
            detail:
              "Renaming a vendor updates the name everywhere it is shown: parts, products and their alternate-vendor lists, requisitions, purchase orders, receipts, work-order vendor charges, project subcontract costs, and asset and vehicle purchase vendors. Records that only have a typed-in name and no link to the vendor are not changed.",
          },
          {
            step: "Vendor history",
            detail:
              "Open a vendor to see its Spend History — POs issued to them AND direct CMMS work-order vendor charges, both counted in Total Spend — plus contact history. Use this for vendor performance reviews and negotiations.",
          },
        ],
      },
      {
        id: "costing-methods",
        title: "Inventory Costing Methods",
        summary: "Choose how the unit cost pre-fills on new Requisition, PO, and Work Order lines.",
        icon: Gauge,
        steps: [
          {
            step: "Where it's configured",
            detail:
              "Go to Settings > Costing. This is an org-wide setting with three modes: Manual, Weighted Average Cost (WAC), and First In, First Out (FIFO).",
          },
          {
            step: "Manual",
            detail:
              "The catalog's stored unit cost is used as-is. It updates to the most recently received price after each goods receipt, but you can also override it directly on the part or product record.",
          },
          {
            step: "Weighted Average Cost (WAC)",
            detail:
              "The pre-filled cost is the quantity-weighted average across every cost layer still in stock. Receiving more stock at a different price blends into the average rather than replacing it outright.",
          },
          {
            step: "First In, First Out (FIFO)",
            detail:
              "The pre-filled cost is whatever the oldest still-in-stock batch paid. As that batch is consumed and a newer one becomes the oldest, the pre-fill shifts to that batch's price.",
          },
          {
            step: "Cost layers, and what never changes",
            detail:
              "Each goods receipt adds a 'cost layer' (quantity + unit cost + date + PO reference) to the part/product record. Cost layers only affect the pre-fill on new lines — historical Requisition, PO, and Work Order line items keep whatever cost was recorded at the time and are never retroactively changed.",
          },
          {
            step: "Parts and Products always agree",
            detail:
              "A CMMS Part and its linked Products catalog entry share one cost — updating either one (through a receipt or a manual edit) propagates to the other automatically, so the price you see is consistent whether you're looking at CMMS > Parts or Purchasing > Products.",
          },
        ],
      },
      {
        id: "import-export",
        title: "Import & Export",
        summary: "Bring in existing data from a spreadsheet, or pull your data back out.",
        icon: Upload,
        steps: [
          {
            step: "Where it lives",
            detail:
              "Both Equipt Settings and Landscapt Settings have their own Import/Export tab, each covering the entities relevant to that module. Export produces a real CSV of your actual data; import maps spreadsheet columns to fields and shows a preview before committing.",
          },
          {
            step: "Invoice imports need a service",
            detail:
              "The Invoices import requires clientName, service, description and amount. The service must match a service in your catalog (case doesn't matter); a row whose service isn't found is skipped with a warning.",
          },
          {
            step: "Duplicate handling",
            detail:
              "Depends on the entity — some merge into the existing record by a matching field (name, part number), others skip a row outright if it already exists (e.g. by PO number).",
          },
          {
            step: "The bulk PO importer's name-conflict handling",
            detail:
              "A separate, denormalized purchase-history importer keeps the first name it ever saw for a part number. If a later import uses a different name for the same part number, it doesn't silently overwrite the catalog — it logs a 'name conflict' entry on that part's audit trail for review.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — a worked import example, exactly what gets validated, and the bulk PO name-conflict mechanic in full.",
            href: "/settings/support/import-export-guide",
            linkLabel: "Open the Import & Export guide",
          },
        ],
      },
      {
        id: "required-fields",
        title: "Required Fields",
        summary: "Make specific fields mandatory before a record can be saved.",
        icon: ListChecks,
        steps: [
          {
            step: "Where it's configured",
            detail:
              "Equipt Settings covers Purchase Orders, Requisitions, Work Orders, Assets, and Vehicles. Landscapt Settings > CRM covers Clients and Tickets. Each field can be set to Required, Optional, or Hidden. This is a single org-wide setting — there's no per-role variant.",
          },
          {
            step: "Enforcement",
            detail:
              "Checked client-side by the relevant creation forms — there's no API or database-level enforcement of these toggles. A few fields are hard-required outside this system entirely and can't be loosened (e.g. every Requisition/PO line item must reference a Products catalog entry).",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — every entity's configurable fields, a worked example, and the client-side-only enforcement gotcha.",
            href: "/settings/support/required-fields-guide",
            linkLabel: "Open the Required Fields guide",
          },
        ],
      },
      {
        id: "samsara-integration",
        title: "Samsara Integration",
        summary: "Sync vehicle odometer readings automatically from Samsara.",
        icon: Satellite,
        steps: [
          {
            step: "Connecting",
            detail:
              "Settings > Integrations. Enter your Samsara API key. Vehicles match to Samsara by a stored vehicle ID first, falling back to an exact name match — an unmatched vehicle is skipped, not errored.",
          },
          {
            step: "What syncs",
            detail:
              "Odometer and GPS-distance readings, converted to miles. A reading only updates if the new mileage is greater than or equal to the meter's current value. Nothing else from Samsara's API — no engine hours, fuel, or fault codes.",
          },
          {
            step: "When it runs",
            detail:
              "A daily scheduled sync, plus a manual 'Sync Now' button for admins. There's no webhook — Samsara doesn't push data to Landscapt in real time.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full setup flow, exactly how vehicle matching and mileage validation work, and what to check if readings aren't updating.",
            href: "/settings/support/samsara-guide",
            linkLabel: "Open the Samsara Integration guide",
          },
        ],
      },
      {
        id: "api-keys-mcp",
        title: "API Keys & MCP",
        summary: "Scoped REST API access, and the same keys work as an MCP server for AI agents.",
        icon: KeyRound,
        steps: [
          {
            step: "Create a scoped key",
            detail:
              "Go to Master Account Settings > Integrations > Public API Keys and click 'Create Key'. Pick only the scopes it needs from the checklist (Clients, Jobs, Work Orders, Invoices, and 11 more resources, each with Read / Write / Write-sensitive tiers). The plaintext key is shown once, immediately after creation — copy it before closing the dialog.",
          },
          {
            step: "Same key works as MCP",
            detail:
              "There's no separate MCP credential. Point Claude Desktop, Claude Code, or any MCP client at /api/mcp with the same 'Authorization: Bearer <key>' header, and it sees exactly the tools its scopes allow — a key with zero scopes still gets a 'whoami' tool so an agent can see what org/scopes it's connected as.",
          },
          {
            step: "Full reference",
            detail:
              "Every endpoint and its MCP tool name is generated live from the API's own OpenAPI spec.",
            href: "/settings/support/api-docs",
            linkLabel: "Open the endpoint reference",
          },
          {
            step: "Full guide",
            detail:
              "A narrative walkthrough — a worked example scoping a read-only reporting key, a table of all 14 resources, and why REST and MCP share one credential system.",
            href: "/settings/support/api-mcp-guide",
            linkLabel: "Open the API Keys & MCP guide",
          },
        ],
      },
      {
        id: "quickbooks-integration",
        title: "Connecting QuickBooks Online",
        summary: "Send customers, invoices and payments to QuickBooks automatically — one way, Landscapt to QuickBooks.",
        icon: Receipt,
        steps: [
          {
            step: "Connect",
            detail:
              "An admin goes to Landscapt Settings > Integrations (also shown under Settings > Accounting), clicks Connect QuickBooks, signs in to Intuit, picks the QuickBooks Online company and approves. The card then reads 'Connected' with the company name. QuickBooks Desktop isn't supported.",
          },
          {
            step: "What syncs",
            detail:
              "Clients (as QuickBooks customers), invoices once they leave draft (number, lines, terms, due date, discount and sales tax), payments (including Stripe card and ACH payments, with the check/reference number), and later changes: invoice edits and voids update the same QuickBooks invoice, and refunds or chargebacks void or reduce the QuickBooks payment. AR write-offs go to QuickBooks as credit memos applied to the invoice; credits you apply from an existing prepayment aren't sent again.",
          },
          {
            step: "One way, and only new records",
            detail:
              "Landscapt writes to QuickBooks; nothing is pulled back, so change invoices and payments in Landscapt. Only invoices and payments created after you connect are sent — existing ones are not backfilled.",
          },
          {
            step: "Matching clients to customers",
            detail:
              "An exact name match links automatically, no match creates a new QuickBooks customer, and similar-but-not-identical names ask you to choose: open the client, find the QuickBooks section, click Sync to QuickBooks and pick a match or 'None of these — create new'.",
          },
          {
            step: "Check for failures",
            detail:
              "Settings > Accounting > Sync Status lists anything that didn't sync, with the reason and a Retry button (needs the QB Reconciliation and QuickBooks Resync permissions). A safety-net job also re-checks every 15 minutes.",
          },
          {
            step: "Full guide",
            detail:
              "How each field maps, timing, what doesn't sync, and fixes for each error message.",
            href: "/settings/support/quickbooks-guide",
            linkLabel: "Open the QuickBooks guide",
          },
        ],
      },
      {
        id: "zapier-integration",
        title: "Connecting Zapier",
        summary: "Trigger Zaps on Equipt and Landscapt events, or create records from a Zap.",
        icon: Plug,
        steps: [
          {
            step: "Generate your key",
            detail:
              "Go to Master Account Settings > Integrations (not Equipt Settings or Landscapt Settings — this connection is account-wide and works regardless of your plan). Click Generate Key and copy it — it's shown once, in full. Paste it into the API Key field when connecting the Equipt/Landscapt app in Zapier. A link to the full, detailed guide below sits right under the key on that page.",
          },
          {
            step: "Landscapt triggers",
            detail:
              "New Client, New Lead, Lead Converted to Client, Client Cancelled, New Estimate, Estimate Won/Lost, New Job, New Ticket, Ticket Closed, New Invoice, Invoice Paid, Contract Signed, New Damage Case, and Visit Dispatched all fire instantly — the moment the event happens, not on a delay.",
          },
          {
            step: "Equipt triggers",
            detail:
              "New Asset, New Work Order, New Requisition, New Purchase Order, PM Schedule Due, Part Low Stock, and New Vendor check every few minutes rather than firing instantly. Work Order Completed and PO Approved are instant. A delayed poll rarely matters for these — low stock and PM-due don't need a same-second alert.",
          },
          {
            step: "Meter Threshold",
            detail:
              "This trigger is configured per-Zap rather than always meaning one fixed thing: pick a meter (or leave it blank to watch every meter), a threshold value, and a direction (at least / at most). Example: watch Truck #4's odometer and fire once it reaches 50,000 miles. This is separate from any meter-threshold automations already configured inside Equipt itself.",
          },
          {
            step: "Actions",
            detail:
              "A Zap can create a Client, Job, or Ticket (or add a note to a client's activity timeline) in Landscapt, and a Work Order or Requisition in Equipt. Every vendor/client/asset/work-order ID a Zap passes in is checked against your org before anything is created.",
          },
          {
            step: "Rotating the key",
            detail:
              "Clicking Regenerate immediately invalidates the old key — any Zaps still using it will need to be reconnected with the new one before they'll work again.",
          },
          {
            step: "Full reference guide",
            detail:
              "Every trigger and action, with sample payloads and field-by-field explanations, lives on one dedicated page.",
            href: "/settings/support/zapier-guide",
            linkLabel: "Open the full Zapier guide",
          },
        ],
      },
    ],
  },
];

// ── FAQ content ───────────────────────────────────────────────────────────────

export const FAQ_CATEGORIES: FAQCategory[] = [
  {
    label: "Purchasing",
    items: [
      {
        q: "Why can't I delete a purchase order or requisition, or lower a PO line's quantity?",
        a: "The app blocks changes that would orphan stock or records. A PO that has goods receipts recorded against it can't be deleted — cancel it instead. A requisition that already has purchase orders created from it can't be deleted — cancel or close it. And a PO line's quantity can't be lowered below what has already been received; correct the goods receipt first, then edit the line.",
      },
      {
        q: "How do I create a purchase order from a requisition?",
        a: "Open the approved requisition from Purchasing > Requisitions and click 'Convert to PO' in the detail panel. The PO is pre-filled with all line items, vendor, and cost information. You can adjust any field before saving.",
      },
      {
        q: "Why can't I approve my own requisition?",
        a: "There's no rule against it — if you hold the role assigned to that approval step, you're listed as an eligible approver even on your own submission. What usually happens is another eligible approver decided first: when a step allows any user with a role (e.g., any Manager) to approve, the first decision resolves the step and the other eligible approvers' entries are marked 'Superseded'.",
      },
      {
        q: "Why can't I edit the line items on an ordered requisition or PO?",
        a: "Once a requisition or PO reaches Ordered (or a later status), only admins can change its line items (managers can't either). Ask an admin to make the change. Editing lines on a Pending Approval or Approved record, by contrast, sends it back through the approval chain for the new total.",
      },
      {
        q: "What do the Parts Spend and Repair Cost reports include?",
        a: "Reports > Parts Spend totals maintenance-part lines on POs by PO date and excludes canceled and rejected POs; pick Last 6 months, Last 12 months, or All time, and click any stat card to see the lines or POs behind it. Reports > Repair Cost totals the parts, labor and vendor/sub lines on work orders' Costs tabs over the same ranges, with cards that also drill down. The Equipt Dashboard shows Parts Spend MTD with repairs MTD beneath it.",
      },
      {
        q: "Why does a line item require a product from the catalog?",
        a: "Free-text item descriptions are not allowed. Every line must reference the Products catalog to ensure consistent naming, GL coding, and reporting. If the item doesn't exist yet, add it to the catalog first in Purchasing > Products.",
      },
      {
        q: "Can I partially receive a purchase order?",
        a: "Yes. When recording a receipt in Purchasing > Receiving, enter only the quantities that arrived. The PO tracks remaining open quantities and you can create additional receipts as more goods arrive.",
      },
      {
        q: "How do I assign material costs to a specific job?",
        a: "When adding line items to a Requisition or PO, set the optional 'Project' field on each line. Only Stocked Material and Project Material category items can be assigned to a project. Costs roll up in the project's Materials tab.",
      },
      {
        q: "How do I record goods received against a purchase order?",
        a: "Go to Purchasing > Receiving and click '+ New Receipt'. Select the PO, enter quantities received for each line, and save. Maintenance Part lines auto-update the CMMS Parts inventory quantity on hand.",
      },
      {
        q: "Why did a product's unit cost change after a goods receipt?",
        a: "A Products catalog entry and its linked CMMS Part always share one cost. Depending on the org's Costing Method (Settings > Costing — Manual, WAC, or FIFO), receiving stock at a different price can update that shared cost. See Administration > Inventory Costing Methods for details.",
      },
    ],
  },
  {
    label: "Maintenance & Work Orders",
    items: [
      {
        q: "What's the difference between a Work Order and a Maintenance Request?",
        a: "A Work Order is a direct maintenance task — created by Staff, Managers, or Admins and immediately actionable. A Maintenance Request goes through an approval flow before becoming a Work Order. Requestors can only submit requests.",
      },
      {
        q: "Can a work order automatically create a requisition for parts?",
        a: "Yes. Open a work order and use the 'Request Parts' action. This creates a linked requisition pre-filled with the parts needed, and stores the work order reference so cost traces back to the job.",
      },
      {
        q: "How do I set up a preventive maintenance schedule?",
        a: "Go to CMMS > PM Schedules and click '+ New PM Schedule'. Select the asset, set the frequency, add instructions, and save. Upcoming and overdue PMs surface in the Notifications bell.",
      },
      {
        q: "How do I stop a PM schedule over the winter?",
        a: "Open the schedule and click Pause. Pick a start date and either a resume date, 'Until I resume it', or 'Repeat every year' (e.g. Dec 1 → Apr 1). Paused cycles aren't due, can't be generated, don't trigger PM Due alerts, and don't count against PM compliance.",
      },
      {
        q: "We forgot to generate last week's PM. What happens if we generate it now?",
        a: "Generate it as usual. The batch is due on the date it was actually due, so once it's done it counts as late — not missed. Next Due moves to the next date on the schedule's cadence (e.g. this Wednesday), not a week from today. Finish that batch before generating the next one; a schedule can only have one open batch at a time.",
      },
      {
        q: "Why does PM compliance show a missed PM when no work order exists?",
        a: "Compliance is scored against the schedule's calendar. If a due date passes and nobody generates the work orders, that cycle counts as 'Not generated' (missed) for each asset on the schedule. Generating it turns it into an overdue PM, and completing it into a late one. If the equipment really wasn't running, pause the schedule for that period instead.",
      },
      {
        q: "How is asset uptime calculated?",
        a: "From the asset's status history: time Active ÷ time Active + In Shop + Out of Service, over the window you pick. Inactive, Disposed and Sold time is left out entirely, so a mower parked for the winter isn't counted as down. Average repair time is the average length of an In Shop / Out of Service stretch.",
      },
      {
        q: "What counts toward an asset's maintenance cost?",
        a: "Parts, labor and vendor charges on the asset's work orders (the lines on each work order's Costs tab), dated by when the work order was completed — or created, while it's still open. Skipped work orders don't count. PM is anything typed Preventive or generated from a PM schedule or meter automation; the rest is Repair.",
      },
      {
        q: "Do meter-based oil changes count toward PM compliance?",
        a: "Yes. A work order from a cumulative Meter Threshold (≥) automation — created directly or converted from its request — is due 7 days after the meter tripped. Done within 7 days is on time; a request still unconverted after 7 days counts as a missed PM. Low-level (drops below) alerts from a level meter are not PM and don't count.",
      },
      {
        q: "What happens when a part falls below minimum stock?",
        a: "A Low Stock alert appears in the Notifications bell and a warning badge shows on the Parts page. Use the Low Stock Alert automation template to automatically create a purchase requisition when this happens.",
      },
      {
        q: "Why didn't my automation fire when I expected?",
        a: "Check that: 1) The automation is enabled. 2) 'Pending Reset' is false — set to true after firing and cleared when the linked WO is marked Done. 3) The meter's current value actually crosses the threshold. 4) The correct meter is selected in the trigger config.",
      },
      {
        q: "How does the service interval on an automation work?",
        a: "After the triggered WO is marked Done, the threshold automatically advances by the interval amount. Example: oil change automation at 36,000 miles with a 5,000 mile interval — after WO completes, threshold becomes 41,000 miles automatically.",
      },
      {
        q: "Why does a part's audit trail show a 'name conflict' entry?",
        a: "The bulk PO import keeps the first name it ever saw for a given part number. If a later purchase uses a different name for the same part number (a different vendor's label for an interchangeable part, or a genuine data-entry mismatch), the import doesn't silently overwrite the catalog — it records a 'name conflict' entry on that part/product's audit trail instead so it can be reviewed rather than lost.",
      },
      {
        q: "A part number seems to cover two different physical parts — what should I do?",
        a: "Split it into two catalog entries — one per physical part — rather than sharing one record. Give each a distinct part number (e.g. append '-OEM' / '-GEN' if the real-world part number would otherwise collide) so future purchases and Work Order usage attach to the correct one. Any Assets already linked to the shared part should be copied over to the new entry for whichever part actually fits them. Once split, link the two as alternatives via the Interchangeable Parts section (see Parts Inventory).",
      },
      {
        q: "Does it matter which part I start from when linking two interchangeable parts?",
        a: "No. Whichever part you click 'Link as alternative part' from, and whichever part you pick, is purely which side of the link initiates it — the display is identical either way and neither part is treated as more correct or authoritative.",
      },
    ],
  },
  {
    label: "Landscapt (CRM)",
    items: [
      {
        q: "How do I make an automation wait until a certain time of day, or skip weekends?",
        a: "Edit the Wait step and turn on 'Then wait until a time of day' (for example, wait 1 day, then continue at 9:00 AM; if that time has already passed it rolls to the next day) and/or 'Weekdays only' (a Saturday or Sunday result moves to Monday at the same time). Both are read on your company clock, including daylight saving.",
      },
      {
        q: "Does 'Estimate was won' fire when the customer accepts online?",
        a: "Yes. Estimate was won fires when the customer accepts through the proposal link or the client portal, when someone marks it accepted in the app, and when an open estimate is converted to a job. Estimate was lost fires when the customer declines in the portal or someone marks it lost. Each decision fires once.",
      },
      {
        q: "Can a 'Form was submitted' automation run for just one form?",
        a: "Yes. In the sequence's rules, pick the form(s) next to the Form was submitted trigger; leave it on All forms to run for every form. Tags a form adds on submit also fire Tag added, and the sequence's first step (an auto-reply, say) goes out right after the submission rather than at the next 15-minute run.",
      },
      {
        q: "What happens to an automation when the client is deleted or the meeting is cancelled?",
        a: "Deleting a client stops every sequence they're in (the activity log shows Stopped (client deleted)), so no later ticket, alert, field-update or tag step runs for them. A meeting reminder stops if the meeting is cancelled, deleted or rescheduled (Stopped (meeting changed)); a rescheduled meeting gets new reminders for its new time.",
      },
      {
        q: "Which merge tags can an automation's email or text use?",
        a: "The client tags, plus invoice tags ([invoicenumber], [invoicetotal], [invoicebalance], [invoiceduedate], [invoiceterms], [viewinvoiceonline], [paymentlink]) that fill in for automations started by an invoice trigger, and service tags: [servicename] and [servicedate] for the client's last completed service, [nextservicename] and [nextservicedate] for their next scheduled one. [chemicalnotice] adds the compact Notice of Treatment for that last completed visit and is blank when it logged no chemicals. A tag with no value is left blank.",
      },
      {
        q: "Why didn't a form submission create a ticket?",
        a: "Form tickets are controlled by Ticket Settings in the form's Configure step. Every submission creates a ticket by default, but the setting can be turned off, and it also sets the ticket's priority and category (the category defaults to the form's name). Check it on the form if tickets stopped appearing.",
      },
      {
        q: "What does 'Publish with warnings?' or 'Turn on with warnings?' mean?",
        a: "Before a form is published or an automation is switched on, Landscapt checks for setups that would quietly do nothing: a form with no questions, Account Management with no email or phone field, an email notification with no recipients, or an automation with no sequences, no start trigger, only Wait steps, or an empty email or text. You can fix the problem or choose Publish anyway / Turn on anyway. Two form fields with the same label always block publishing.",
      },
      {
        q: "How do I make a new form from an existing one?",
        a: "Open the row menu on the Forms list and choose Copy form (needs the Forms edit permission). It creates '<name> (Copy)' with the same fields, pages, rules and settings as an unpublished draft with its own link. Responses are not copied.",
      },
      {
        q: "How do I save my dispatch board filters, or pick a quick date range?",
        a: "Open Saved views next to Refresh and choose Save current as view. It stores your filters, search and visible columns (and a date range if you set it with Quick range); click a view to apply it or Update to overwrite it. Views are private to you, and applying one replaces your current visible columns. Quick range, beside the From and To dates, offers Today, Past 1/3/5 days, Next 3/5/7 days, This week and Next week.",
      },
      {
        q: "How do I move a stop to another crew on a touchscreen or when dragging is refused?",
        a: "Dragging a stop between crews on the board itself is refused with 'Use Team Assign to move a stop between crews'. Open Team Assignment and either drag the visit card to the crew's column, or tap the card to pick it up and then tap the crew column (or Unassigned). Press Escape or Cancel to put it back.",
      },
      {
        q: "How do I send Notices of Treatment to several clients at once?",
        a: "Select the chemical visits on the Dispatch Board, open Actions and choose Send Chemical Notices (n). It emails each client their Notice of Treatment with the PDF attached unless you untick that option. It needs the permission to send application notices. The route sheets dialog also has a Chemical sheets button that prints the day's chemical route sheets.",
      },
      {
        q: "Why does my estimate say it needs approval again?",
        a: "An approval covers the total that was approved. If lines added afterwards push the estimate above that amount, Send and Copy link resubmit it for approval, and it can't go out until it is approved again. Lowering the total doesn't need a new approval.",
      },
      {
        q: "Why won't the job's Complete button finish the job?",
        a: "Complete refuses while the job still has scheduled, dispatched or in-progress visits, because completing the job would bill every service as done and each visit also bills itself when it's completed. Complete, skip or cancel the open visits on the job's Visits tab, then the job completes itself (or click Complete again).",
      },
      {
        q: "Why can't I move or change the status of a visit?",
        a: "The crew is clocked in to it. While a stop is running you can't move it to another day, change its crew, change its status or delete it, from anywhere in the office. Have the crew tap Stop Job (or Skip) first. A stop the crew skipped after starting can be rescheduled or reopened normally.",
      },
      {
        q: "Why did a client's visits and contract invoices stop?",
        a: "The client is marked Inactive, Lost or Cancelled. Those statuses stop new recurring and package visits and stop contract invoices. Set the client back to Active to resume both on the next run.",
      },
      {
        q: "Why didn't a text message send from an automation?",
        a: "Usually your company hasn't finished SMS registration (Settings → Integrations → Your own texting number). Until it is approved, text steps are skipped and the rest of the sequence still runs; the builder shows “SMS setup not complete” on those steps and your admins get one notification. A number that replied STOP is also skipped: that number only, so the client's other numbers still get the text.",
      },
      {
        q: "A contact or a billing phone replied STOP. What happens?",
        a: "That number stops getting texts from your company, from automations and 1:1 texts alike. The client's other numbers keep getting them, and the client stays opted in. Only a STOP from the client's primary phone turns off the client's texting consent. If the same number texts START, it can be texted again; START from the primary phone also turns the client's consent back on.",
      },
      {
        q: "Why didn't an email go to one of a client's addresses?",
        a: "That address hard-bounced: the mail server said it doesn't exist. A bounced address is skipped on every send (campaigns, automations, invoices, estimates, statements, ticket and chemical emails), but only that address: the client's other addresses still get the email. The client's page shows a red notice listing bounced addresses. Fix the address (a new address is never blocked), or click Clear bounce if the mailbox works again.",
      },
      {
        q: "Why can't I delete an invoice?",
        a: "Invoices with payments applied, locked invoices and invoices already sent to QuickBooks can't be deleted. Refund or unapply the payments, unlock the invoice, or (for a QuickBooks-synced invoice) void it so QuickBooks is updated too.",
      },
      {
        q: "Does a refund return the card processing fee?",
        a: "Yes. A full refund returns the processing fee the client paid; a partial refund returns the fee's matching share. Your books still show the refund against the invoice amount.",
      },
      {
        q: "Why does a client's portal say their access is no longer active?",
        a: "Their portal link was removed: someone used Reset portal access, the client was deleted, or the client portal was turned off for your company. Send them a new portal invite from the client's Details tab.",
      },
      {
        q: "Can a property manager see their sub-accounts in the portal?",
        a: "Yes. A client with sub-accounts sees the sub-accounts' invoices, estimates, visits and tickets when they sign in, each labelled with the sub-account's name. They can pay a sub-account's invoice and pick which account a new ticket is for.",
      },
      {
        q: "Can clients turn autopay on or off themselves?",
        a: "Yes. A client with a saved card has an Autopay switch on the portal Account page. Saving a card asks whether to use it for autopay (off by default), and removing the saved card turns autopay off.",
      },
      {
        q: "Can a client pay several invoices at once or pay ahead from the portal?",
        a: "Yes. On the portal Billing tab the client ticks the invoices to pay (or Select all unpaid) and pays them in one payment; invoices from different accounts, such as a property manager's sub-accounts, are paid separately. Make a prepayment lets them pay $1.00 to $25,000.00 ahead by card or bank transfer, and it becomes account credit that settles their next invoice. Payments & Credits on the same tab shows each payment and the invoices it covered. The emailed invoice link also offers Bank transfer (ACH) next to Card when bank transfer is enabled; it carries no card fee and takes a few business days to clear.",
      },
      {
        q: "Can portal customers attach photos to a ticket?",
        a: "Yes. The New Ticket form has an optional Photos field for up to 5 images, which appear on the ticket's attachments for staff. If a photo fails to upload the ticket is still filed and the customer is told which photos to send another way.",
      },
      {
        q: "Why does a contract show Inactive client when I click Create Invoices?",
        a: "Contracts don't bill clients marked Inactive, Lost or Cancelled. Reactivate the client to bill the contract. Create Invoices always says why it skipped a contract (already billed, draft, not started, $0 month, not a billing month, or inactive client).",
      },
      {
        q: "Do account credits earn commission?",
        a: "No. Commission earned when paid counts only money actually received, so account credits and AR write-offs applied to an invoice earn none.",
      },
      {
        q: "Which clients does the campaign All Clients audience include?",
        a: "Active and inactive clients with an email address that can be emailed. Lost leads and cancelled clients are left out; reach them with the Leads or Past Clients audience. Do-not-market, opt-outs and bounced addresses are always skipped.",
      },
      {
        q: "Why can't my crew confirm chemicals yet?",
        a: "Chemicals can only be confirmed once the stop is running, so the application record has real start and end times. Tap Start Job first. Confirming records the crew foreman as the applicator, with their license number.",
      },
      {
        q: "Can the crew record a chemical that wasn't preloaded on the stop?",
        a: "Yes. On the stop (browser crew page or the iOS/Android crew app) tap Add a chemical, choose the product, and enter the amount and unit. It is saved already confirmed with the foreman as applicator, and it counts toward the compliance report and stock like any other. This also works when nothing was planned for the stop. If a planned chemical has no amount (no area or rate on file), the card says so and the crew enters what they measured. Each chemical also has a View label link with its EPA number, re-entry interval and label directions.",
      },
      {
        q: "How do I record temperature and wind for chemical applications from the weather?",
        a: "On the crew's stop, the Conditions box under the chemical list is filled in from the National Weather Service reading nearest the property (tap Update to refresh it) and can be corrected; if no reading is available, type the values. In the Dispatch Board's Chemical Tracking dialog, Fill from weather (on a visit's own Conditions box, and on Conditions, which applies one temperature, wind and pH to every visit in the list) uses the reading nearest the time the chemicals went on, when that is within the last week. You can edit the figures before saving.",
      },
      {
        q: "Where do I keep chemical labels and Safety Data Sheets?",
        a: "Open Reference Library in the Tools sidebar. Upload PDFs, images, Word or Excel files and give each a type (SDS, label, SOP, training, equipment, other), an optional revision date and the chemical products it covers. Documents linked to a product show on its page under Labels & Safety Data Sheets and open from View label on the crew's stop. Everything not marked office-only (untick Show to crews) is on the crew app's Reference screen. Anyone with a CRM seat can open the library; adding, editing and deleting needs the CRM Settings permission.",
      },
      {
        q: "Why is the QuickBooks invoice stuck on “name exists as a vendor or employee”?",
        a: "QuickBooks won't create a customer whose name already belongs to a vendor or employee. Rename the Landscapt client (or link it to the existing QuickBooks customer), then edit and save the invoice to retry.",
      },
      {
        q: "How do I see what my crews need to load on the truck?",
        a: "On the Dispatch Board, click Load List next to Stats. It shows the Daily Load List for the board's day, chemicals with concentrate and mix volume and other materials, grouped by crew, with Print and a link to the full report. It needs the View Report Center permission.",
      },
      {
        q: "How do I schedule a job or visit?",
        a: "Use the Scheduling section of the Landscapt left menu, not Settings. Scheduling > Dispatch Board is where you put a visit on a day and assign it to a crew; Scheduling > Waiting List is for jobs that only have a date range and no firm date yet, where each row has a Schedule button. Scheduling > Jobs lists every job. The Schedules page under Administration only holds the reusable recurrence patterns (weekly, bi-weekly, seasonal) that a recurring job's Schedule dropdown uses.",
      },
      {
        q: "How do I bill several properties together on one invoice for a parent account?",
        a: "Sub-accounts are separate clients, so their invoices can't be merged the usual way. On the Invoices list, tick the invoices from the sub-accounts and choose Actions > Merge / Consolidate Invoices, then Consolidate to Parent. It creates one new draft invoice on the parent account with each line tagged with its sub-account name in brackets, each line keeps the tax it was already charged, and the original invoices are voided and linked to the new one. It is blocked for locked invoices, invoices synced to QuickBooks, invoices with a bank payment still processing or an open dispute, and invoices where a sub-account has already paid something. A payment the parent itself made, such as one check for several properties, moves onto the new invoice.",
      },
      {
        q: "Collect Payment showed the old amount after I changed the invoice. Why?",
        a: "Collect Payment charges the balance as of when you click Continue. It now starts over from the new balance whenever the invoice total changes or you close and reopen it. If you still see an old figure, close the dialog, confirm the invoice's Balance Due, and open Collect Payment again before clicking Continue.",
      },
      {
        q: "Can I set the Waiting List date range and have it stick?",
        a: "Yes. The Date Window on the Waiting List has a preset dropdown (Next 30 days, This week, This month, This quarter, This year, Next 90 days) and Custom range if you edit either date. Your choice is saved to your login, so it is still there after a refresh. Presets are remembered by name, so 'This quarter' still means the current quarter next month.",
      },
      {
        q: "Does Nearby → Schedule Today create a duplicate visit for a waiting-list job?",
        a: "No. A waiting-list job has no visit while it waits; the Waiting List shows the job's services, not visits. Dispatching a service gives it its one visit, which moves it off the list and onto the board. Example: a job has Spring Clean-up and Mulch. You dispatch Spring Clean-up for Monday and the crew completes it. On Thursday, Nearby → Schedule Today next to that client creates Mulch's first and only visit for Thursday, so Mulch leaves the list and lands on Thursday's board. The job ends with exactly two visits, each billed once. A skipped or cancelled visit never happened, so its service goes back on the list. Package jobs are different: each step already has a placeholder visit, so Nearby (like the Waiting List) moves the next due step's placeholder to today instead of creating one, and only offers it once that step's window has opened and its Min Days since the previous step are met.",
      },
      {
        q: "Can I schedule a waiting-list job from the client's record?",
        a: "Yes. On the client's Home tab, open the waiting-list job's MORE menu and choose Schedule Job, pick a date and optionally a crew, and dispatch it. It then leaves the Waiting List and shows on the Dispatch Board. The item only appears while the job has no visit yet, and only for logins with the Waiting List permission. View Upcoming in the same menu has a Schedule button per service if you want to send one service out and keep the others waiting.",
      },
      {
        q: "Why won't a merge tag insert in my email template?",
        a: "Click into a text block first (Header, Paragraph, List, Signature or a Columns column), then click the tag in the Merge Tags panel and it is inserted at your cursor. If no text block is active, the tag is copied to your clipboard instead and a notice says so. Two tags with nothing between them run together, so add your own space or comma.",
      },
      {
        q: "A merge tag came out blank in an estimate email or proposal. Why?",
        a: "A tag is blank only when that client or record has no value for it — for example [physicaladdress1] on an estimate with no property and no service address on the client, or [estimatevaliduntil] when the estimate has no Valid Until date. Estimate emails, the online proposal and PDF, acceptance confirmations and chemical notices all fill in every tag the Merge Tags panel offers. Property tags use the estimate's or visit's own property when it has one, and [salesrepname] is the estimate's sales rep (the company name when none is set). The Send Estimate preview shows the estimate's real values, so check it before sending.",
      },
      {
        q: "Who can change invoice templates, rate-matrix prices and services?",
        a: "Invoice templates (Settings > Accounting > Invoice Templates) need the Accounting Settings permission. Rate-matrix prices need Scheduling Settings or Edit Services; the Bulk Prices permission can also change matrix and service prices, but nothing else on a service. The Delete Services permission can delete a service without being able to edit it. Everyone with Landscapt access can still read them, so estimates, invoices and the dispatch board price correctly.",
      },
      {
        q: "How does the company Default Tax Rate apply to clients and invoices?",
        a: "Settings > Accounting > Sales Tax sets one company rate. Each new client starts with it as their own tax rate (a client marked tax-exempt stays at 0%), and that client's estimates, invoices and automatic invoices use the client's rate. Changing the company rate later doesn't change existing clients; edit a client's rate on their profile. An invoice keeps the rate it was saved with — an invoice set to no tax stays untaxed when you edit and save it again.",
      },
      {
        q: "How do I make a button in an email template link to something?",
        a: "Add a Button block, type its label, and use the Button links to control under it. Invoice Email templates offer View & pay invoice online, which links each client to their own invoice; any template can use Custom URL (https://, mailto: or tel:). The link works in the email. In an attached PDF the button is drawn but isn't clickable. See the Document & Email Templates guide.",
      },
      {
        q: "The test email from the template editor failed or looks like a PDF, not an invoice. Why?",
        a: "Send Test Email sends the template with sample data to the email address you are signed in with, with [TEST] at the start of the subject. If the template's Include PDF setting is on, the PDF attachment is the template rendered with sample values, not a real invoice. If the test fails with a message about the PDF attachment, turn off Include PDF in the template's settings to test without it.",
      },
      {
        q: "What is Equipment on an estimate line, and does the client see it?",
        a: "Equipment is an internal cost. Add machines under Administration > Services > Equipment (cost rate, optional charge rate, per hour, per day or flat), then expand an estimate line and choose + Add Equipment. Quantity times rate counts against that line's margin. The client never sees it on the proposal, PDF, portal or invoice, and it does not change the line price. A service's Equipment tab can pre-fill machines on every new line of that service.",
      },
      {
        q: "What are sub-items on a service bundle or estimate line?",
        a: "A sub-item is a product or subservice attached to a bundle item or estimate line, with its own quantity and rate. Add them with + Add sub-item in the bundle editor (Settings > Estimates > Service Bundles); they come along when the bundle is applied. On an estimate, the printer icon beside a sub-item controls whether it is printed under the line for the client. When the estimate becomes a job, the office and the crew see each service's sub-items by name and quantity only, with no prices; they never bill and don't change inventory.",
      },
      {
        q: "What formatting does the text editor support? Can I add a table, change the font or highlight text?",
        a: "Every rich-text box (document blocks, email and invoice messages, service descriptions, estimate line notes, job notes and descriptions) has the same toolbar: font and size, bold, italic, underline, strikethrough, subscript, superscript, text color, highlight color, bullet and numbered lists, alignment, indent and outdent, tables, a horizontal rule, image insert (where allowed) and an HTML source toggle. The table button inserts a 3x3 table with a header row and then adds or deletes rows and columns. All of it carries into the sent email, the proposal page and the PDF; in the PDF subscript and superscript are smaller but not raised or lowered. See the Document & Email Templates guide.",
      },
      {
        q: "How do I resize an image in a document or email?",
        a: "In a text box, hover the image and drag a corner handle; the aspect ratio is kept. An Image block in the document editor has a Size slider (10 to 100 percent). The size carries into the preview, the sent email and the PDF, and the PDF shows JPG, PNG, WEBP, GIF and AVIF images.",
      },
      {
        q: "Why did my document PDF lose its blank lines or images?",
        a: "It used to: empty paragraphs were dropped and only JPG or PNG images displayed. The PDF now keeps blank lines, indents, alignment, tables, colors and images of every supported type, including images inside text and Image blocks at the size you set.",
      },
      {
        q: "Where does the document template's Send Test Email go?",
        a: "To the email address of the person who is signed in and clicking the button, never a fixed address. The subject starts with [TEST] and the merge tags use sample values.",
      },
      {
        q: "Can each estimate document have its own client-view toggles?",
        a: "Yes. In the document's Edit Settings (Estimate-type documents only), tick 'Set What The Client Sees For This Document' and choose visits, quantities, units, line prices, line totals, section subtotals, package visits and the hide-$0 options. Those toggles are copied onto an estimate when it uses the document. The order, most specific first, is the estimate's own toggles, then the document's, then the service bundle's, then the org default. They are copied, so editing the document later does not change existing estimates or sent proposals.",
      },
      {
        q: "Can I put a package on an estimate?",
        a: "Yes. On the estimate's line-item grid, click Add Package and pick a package. It adds a section header named after the package and one line per package service, each keeping the package's visit count and per-visit price. The package's Description on Estimate (Settings, Packages) becomes its wording on the proposal. Tiers, discounts and totals work the same as on any other line.",
      },
      {
        q: "Can a customer accept only part of a package?",
        a: "No. A package is all or nothing. The proposal page and client portal show it as one main line with one checkbox (name, wording and total), and the server accepts or declines every line of the package together, even if a request tries to split it.",
      },
      {
        q: "How do I show or hide a package's visits on the proposal?",
        a: "Use the Package visits toggle in the estimate's 'What the client sees' settings (it is off by default, and can also be set on an Estimate document or the org default). Off shows only the package name, wording and total. On lists each visit as a plain row under the package's main line. It applies to the proposal page, the client portal, the PDF and the [estimategrid] table in emails.",
      },
      {
        q: "Can the Rate Matrix or chemical area use a custom number field I created?",
        a: "Yes. Create a Number field under Settings > Custom Client Fields and it appears automatically in the Rate Matrix lookup list and in a service's Area measurement for chemical quantities. The value is read from the property first and then from the client, so enter it once on the client and override it on a property when it differs. Text, select and date fields can't be used.",
      },
      {
        q: "How do I quote a spot treatment or part of a property so chemical quantities use that area?",
        a: "On the estimate line open the notes menu and use the Treated Area tab to enter the area you will actually treat, in the same unit as the service's area field (sq ft, or linear ft for a perimeter service). It carries to the job service when you convert, and you can also edit it on the job's Services tab. Materials Needed, the Daily Load List, the crew's preloaded amounts and the application panel use it instead of the property measurement. Leave it blank to use the property's measurement.",
      },
      {
        q: "How do I make a service like parking-lot weed control use the Parking Lot square footage?",
        a: "Open the service, go to its Chemicals tab and set Area measurement for chemical quantities to Parking Lot / Hardscape Sq. Ft. Without it the service uses the org's Area Custom Field from Settings > Chemical Tracking (for example Turf Sq. Ft.). A treated area on the job service overrides both.",
      },
      {
        q: "How do I estimate a perimeter or barrier product that is labelled per linear foot?",
        a: "In Settings > Chemical Tracking add an area unit such as 100 Linear Ft or 1,000 Linear Ft (new orgs already have both) and use it on the product's Application Rate. Then open the service's Chemicals tab and set Area measurement for chemical quantities to a linear-foot field such as Linear Ft. Perimeter. A linear-foot rate is only sized from a linear-foot field and a square-foot rate only from an area field; when they don't match no amount is estimated and the Daily Load List and application panel say why.",
      },
      {
        q: "How do I skip one step of a package on an estimate?",
        a: "Set that visit's status to Draft. Draft and Lost visits are excluded from the package subtotal, the estimate total and the proposal, and the client still sees one package line. Set it back to Quote to include it again.",
      },
      {
        q: "How do I delete a whole package from an estimate?",
        a: "Click the trash icon on the package's header row and confirm. The header and all of its visits are deleted together.",
      },
      {
        q: "How do I copy the first package visit's values to the other visits?",
        a: "On the package header row use the copy buttons (Qty, Rate, B.Hr, Cost, Adj Rate or All). Each copies that value from the first visit to every other visit in the package and recalculates the totals.",
      },
      {
        q: "When a client signs up for a package, do its jobs go on the Waiting List, or are they dispatched automatically?",
        a: "They go on the Waiting List and stay there until you dispatch them; nothing is dispatched automatically. Each step of the package shows as its own row on Scheduling > Waiting List with its date window. A step does not appear on the Dispatch Board until it is dispatched: click Dispatch on the step on the Waiting List (or Actions > Dispatch Selected, or Nearby Waiting List on the board), pick the day and crew, and it moves to the Dispatch Board for that day. If a dispatched step doesn't happen (rained out, say), select it on the Dispatch Board and choose Return to Waiting List. Min Days spacing between steps is enforced on every move; a scheduler can override it with Dispatch anyway when a step is dispatched early on purpose.",
      },
      {
        q: "How do I renew a package job for next season?",
        a: "Open the package job, click More (…) and choose Renew for next season. The window shows last season and the new season, every step with its new date and rate, and any warnings; click Renew for the new year. It creates a new package job for the same client and property with the same services, rates, budgets, Min Days, crew, sales rep and crew notes, with every step date moved forward one year. Its visits are created the same way as Add Job, it is marked as a Renewal sale for commissions, and Date Sold is today. The old job is left as it was. To renew many at once, use Renew Packages on the Jobs list.",
      },
      {
        q: "How do I renew all of last season's package jobs at once?",
        a: "On Scheduling, Jobs, click Renew Packages. Pick the season to renew from. Every package job from that season is listed with its renewal state; the ones not yet renewed and not marked Don't renew are ticked, except cancelled jobs and clients who cancelled or were lost (listed but unticked; tick them to renew anyway). Untick any you want to leave out, optionally set Raise rates by %, and click Renew. Several jobs are renewed at once (one client's jobs in order), the button counts progress, and any that can't be renewed (already renewed, or the client already has that package for the new season) are skipped with the reason shown on its row. Keep the window open until it finishes; the browser warns you if you try to leave mid-run.",
      },
      {
        q: "Does renewing a package use last season's dates or the package template's dates?",
        a: "Last season's job, unless you tick Use the package's current dates. By default each step keeps the date it had on the old job, moved forward one year (Feb 29 becomes Feb 28), so per-client changes carry over. With the box ticked (in the renew window, or Use each package's current dates in Renew Packages), each step's window comes from the package in Settings, Packages, moved to the new season, so it works whether you have already updated the package's dates or not. Either way the renewal keeps the job's own steps and rates: a step the package doesn't have keeps last season's date, and a step the package has but the job doesn't is not added (the window lists both). A package with no step dates keeps last season's dates. A step with Visits Included above 1 is spread over its window the same way Add Job spreads it, so each visit gets its own date in order. Min Days spacing is applied in both cases. Rates are copied as they are unless you fill in Raise rates by % in the renew window. The renewal lands on the first season that hasn't started yet, or on one already under way while most of it is still ahead; past its midpoint it goes to next season. Any steps that still land before today are counted in the window and on each Renew Packages row.",
      },
      {
        q: "How do I raise prices when renewing package jobs?",
        a: "In the renew window (on the job, or Renew Packages on the Jobs list), enter a percent in Raise rates by and pick the rounding (exact cent, nearest $0.25, $1 or $5). Every step's rate on the new job is raised by that percent and rounded the same way a Price Adjustment run rounds; a $0 step stays $0. The single-job window shows each step's old and new rate and the new program total. Last season's job is not changed. Leave the box blank to keep last season's rates.",
      },
      {
        q: "What stops a package job from being renewed twice?",
        a: "A package job can have only one live renewal. Renewing it again, from either the job or Renew Packages, is refused with the number of the existing renewal. If the client already has the same package at the same property for the new season (for example added with Add Job), renewing warns you and needs Renew anyway ticked. Deleting the renewal lets the old job be renewed again.",
      },
      {
        q: "How do I mark a package client as not renewing?",
        a: "On the package job, click More (…) and choose Mark as not renewing, or click Don't renew on its row in Renew Packages. Renew Packages leaves it unticked and the Custom Package Renewal Report shows it as Don't renew. Choose Renew as usual to undo it. You can still renew a job marked this way from the job itself.",
      },
      {
        q: "What carries over when a package job is renewed, and what doesn't?",
        a: "Carried over: the client, property, package, services and their rates, quantities, budgets, team size, Min Days and taxable setting, the crew, sales rep, crew notes, office notes, invoice description, payment and invoicing settings, each service's crew checklist (sub-items), and planned job materials that weren't recorded on a visit. Not carried over: visits, completions, invoices, the PO number, and a contract that doesn't cover the whole renewed program, from first step to last (the window says so; the renewal then bills on its own until you link a renewed contract). Each step visit gets its pending materials from the copied sub-items. Renewing fires the Package renewed automation trigger, not Job created or Package created, so renewing clients don't get the new-customer sequence.",
      },
      {
        q: "Which automation fires when a package job is renewed?",
        a: "Package renewed. Renewing (from the job or Renew Packages) does not fire Job created or Package created, so a renewing client isn't enrolled in sequences meant for new customers. To send a thank-you or reminder to renewing clients, create a sequence with the trigger Package renewed (Job / Visit group); you can limit it to specific packages.",
      },
      {
        q: "How do I see which package jobs have been renewed?",
        a: "Run the Custom Package Renewal Report (Report Center, Service Reports). It lists every package job with its season and a Renewal column: Renewed (with the new job's number and season), Not renewed, or Don't renew. Filter by Season and Renewal to get a to-do list. On a job, the header shows Renewed as #… or Renewal of #… with a link.",
      },
      {
        q: "How do I change the status of or delete several estimate line items at once?",
        a: "Tick the lines in the grid (the header checkbox selects all lines). A bar appears above the grid with Change Status, Rate Increase and Delete. Delete asks you to confirm.",
      },
      {
        q: "How do I copy a service's rate matrix to other services?",
        a: "Open the service, go to its Rate Matrix tab and click Copy to other services. Tick the services and click Copy. The rows, lookup field and overflow rule are copied, replacing any matrix the targets already have. Rate matrix edits save when you click out of a field.",
      },
      {
        q: "How do I price a property larger than my last rate matrix row without adding hundreds of rows?",
        a: "Use the Overflow rule on the service's Rate Matrix tab: Every Y over X is $R more, plus hours and cost. At or above X, the estimate starts from the last row and adds one increment for each full Y, counting the first interval. It takes priority over a Tail row.",
      },
      {
        q: "How do I see which estimate or invoice an audit log entry belongs to?",
        a: "In the Audit Log report (Report Center, Audits) use the Record column. It shows the estimate or invoice number, PO number, client name, contract title, project name, job number, service, package or crew that changed.",
      },
      {
        q: "What happens when I convert an estimate that has a package on it?",
        a: "Convert to Job creates a Package job instead of a plain job, with the package, its total steps, each step's date window (with Min Days spacing), the package's invoice description and one visit per dated step. Convert one package at a time, and not in the same pass as ordinary lines; the convert window has a button per package and locks Job Type to Package. Scheduled Date acts as a Program Start Date that moves every step window by the same number of days.",
      },
      {
        q: "Does a package with several included visits become several steps on the job?",
        a: "No. Each package service becomes one step on the job with one visit, billed at that line's full price. This matches how Add Job's package picker works.",
      },
      {
        q: "What happens to an estimate's toggles if I change its Estimate Document or apply a bundle?",
        a: "If you never changed the toggles by hand, the new document's (or bundle's) toggles are copied on silently. If you did change them on the Client View tab, you are asked 'Replace the client-view settings?' with Replace toggles or Keep mine. Keep mine still switches the document or adds the bundle's lines but leaves your toggles alone. A document that sets no toggles leaves the estimate's toggles as they are. Applying a bundle also replaces the estimate's document with the bundle's linked document.",
      },
      {
        q: "What does 'Automatic' mean for an estimate's document?",
        a: "The estimate has no document of its own picked. Sending or previewing it uses your default active Estimate document (marked default in Documents), or the built-in proposal layout if none is the default. Automatic does not copy the default document's toggles onto the estimate; only picking a document, or applying a bundle that links one, does.",
      },
      {
        q: "Can I link a service bundle to an estimate document?",
        a: "Yes. Open the bundle (Settings > Estimates > Service Bundles) and pick an Estimate document on the Details tab. Estimates created from, or given, that bundle remember the document, and Send pre-selects it instead of the default. The client-view toggles for the bundle are on the Display Settings tab.",
      },
      {
        q: "I applied a bundle with sub-items to an estimate and they did not show. Why?",
        a: "Applying a bundle from the Apply bundle menu on an existing estimate used to copy the sub-items without refreshing the list, so they appeared only after a reload. They now show straight away. If a bundle's items have no sub-items in the bundle editor, there is nothing to copy.",
      },
      {
        q: "What does the Mine / Everyone toggle on My Day do?",
        a: "My Day opens scoped to you. Mine shows tickets assigned to you or where you're a contributor, estimates where you're the sales rep, and meetings assigned to you; Everyone shows the whole company's. A My Upcoming Meetings card lists your next seven days of meetings. Breadcrumbs across the top of list pages are clickable to jump back to the section.",
      },
      {
        q: "Why does the Clients list only show 100 clients when the count says more?",
        a: "The list loads clients 100 at a time to stay fast for large client lists. Scroll down and the next 100 load automatically, or click 'Load more' at the bottom. The count at the top is the true number of matches, and search, filters and Export always cover every client, not just the ones on screen.",
      },
      {
        q: "The Leads list is loading leads in batches. Is that new?",
        a: "Yes. Like Clients, the Leads list (List and Table views) loads 100 leads at a time as you scroll, or click 'Load more'. The count at the top is every matching lead, and search, filters, 'Select all N matching leads' and Export all cover every lead, not just the ones on screen. Your search and filters carry over between the two views.",
      },
      {
        q: "The Leads 'Date Added' filter never returned anything. Is it fixed?",
        a: "Yes. It used to check Client Since, which stays empty until a lead converts, so it matched nothing. It now uses the same date as the Date Added column: Client Since if set, otherwise the day the lead was created.",
      },
      {
        q: "My City filter doesn't match the address shown in the Clients table. Why?",
        a: "There are two city filters. 'Billing City' filters on the billing address. The table's 'Service Address' column shows where the work is done, and 'Service City' is the filter that matches it. Use Service City to find everyone serviced in a town.",
      },
      {
        q: "Where did the 'Active Service' filter go?",
        a: "It was replaced by 'Has Scheduled Job For' (clients with an upcoming visit for that service) and 'Has Completed Job For' (clients with a completed visit for it). The old Active Service filter in the Table view didn't actually filter anything; the new ones work in both List and Table, and you can pick several services at once.",
      },
      {
        q: "I can't find a client in a client picker or in Link Parent Account. Where is it?",
        a: "Client pickers search as you type and show up to 50 matches. If the client isn't in the first 50, type part of the name, the account number, a phone number or part of the address. In Link Parent Account, clients that already have a parent are never offered, and a client that has sub-accounts of its own can't be linked under a parent at all, since the hierarchy is one level deep.",
      },
      {
        q: "Does exporting clients export everyone or just what I'm looking at?",
        a: "Clients > Import / Export > Export downloads every client that matches your current search and filters, including the ones not yet loaded on screen. Clear the search box and filters first if you want the whole client list.",
      },
      {
        q: "A refund or chargeback didn't update in QuickBooks. What now?",
        a: "Open Settings > Accounting > Sync Status. The payment is listed with the reason; click Retry (it needs the QuickBooks Resync permission) and Landscapt re-runs the void or reduction on the QuickBooks payment and clears the error once it goes through.",
      },
      {
        q: "Why does an invoice line show HTML tags like <p>?",
        a: "Older invoices created automatically from a visit copied the job's rich-text invoice description onto the line with its formatting tags. The invoice editor now shows those descriptions as plain text, and new invoice lines are created as plain text. The PDF never showed the tags.",
      },
      {
        q: "A job I skipped or cancelled a visit for is back on the Waiting List. Is that right?",
        a: "Yes. A waiting-list job leaves the list once it has a live visit, but a skipped or cancelled visit never happened, so a job whose only visits were skipped or cancelled returns to the Waiting List. Scheduling it again creates a new visit and takes it off.",
      },
      {
        q: "When does an invoice count as overdue, and who gets contract and estimate expiry reminders?",
        a: "An unpaid invoice is overdue once its due day has passed; one on Due on Receipt terms with no due date goes overdue the day after its invoice date, and an invoice with no balance left is never overdue. About three days before an open estimate expires, its creator is reminded (its sales rep when there is no creator). Contract expiry warnings go only for signed or active contracts, never for cancelled, expired or draft ones. A snow job whose contract has ended no longer shows on the Snow Jobs board, and its completed visits bill per visit.",
      },
      {
        q: "How do I set up a contract that bills only some months, at different amounts?",
        a: "Leave the contract's Billing Frequency on Monthly and fill in the 12-month grid in Invoice Details: enter each billed month's own amount and leave the other months at $0.00 — a $0 month is skipped, so an April–November contract sends 8 invoices a year, each for that month's amount. The line under the grid shows the yearly total as you type. On the contracts list (and the client's contract badge) it reads like '$4,100.00 / yr · 8 months (varies)', and the CSV export says 'varies by month' in Amount per invoice with the total in Yearly Total. If every billed month is the same, it reads '$500.00 / month · 8 months'.",
      },
      {
        q: "How do I bill a contract quarterly, yearly, weekly or once?",
        a: "Open the contract, go to Contract Details > Invoice Details and pick a Billing Frequency. Enter the Amount per invoice — the amount charged every time it bills, not a monthly figure: a $3,000-a-quarter contract is $3,000, a $12,000-a-year contract is $12,000. The dialog shows when it will bill (for example 'Invoices in Jan, Apr, Jul, Oct'), counted from the start date. Quarterly and annual contracts bill on the Billing Day of Month in those months; weekly and every-2-weeks contracts bill every 7 or 14 days from the start date; a one-time contract bills once, on or after the start date. Changing the frequency of a signed or active contract flags it 'Changed since signed — needs client approval'.",
      },
      {
        q: "Why can't a crew member edit punches on a visit?",
        a: "Once a visit's hours are on a live invoice, the crew app refuses changes or deletions to member punches on it and asks you to have the office correct the time. The office can still edit times. A crew note resent after a dropped connection is saved once.",
      },
      {
        q: "How does the crew clock in for the day (Start Day / End Day)?",
        a: "On the Crew App's My Schedule screen, tap Start Day once and everyone on the crew's roster for that day is clocked in; tap End Day at the shop to clock everyone out (the app asks you to confirm if a job is still running). This is the paid shop-to-shop day that feeds payroll. Start Job and Stop Job separately clock the crew in and out of each stop for Job Costing. If nobody taps Start Day, starting the first job opens the day anyway and payroll flags it as 'Started at first job'. The Start Day button stays disabled if the crew has nobody on its roster (add people under Team > Crews > Team Assignments).",
      },
      {
        q: "Can I require Before and After photos on a crew stop?",
        a: "Yes. In Landscapt Settings, in the crew app section, tick 'Require a Before photo to start a job' and/or 'Require an After photo to stop a job'. The crew's Photos area then shows Before and After buttons, and Start Job or Stop Job stays disabled until a photo with that label is on the stop. A photo still uploading with no signal counts. The same setting applies in the browser crew page and the native crew app.",
      },
      {
        q: "What is the countdown and Time summary on the crew's running job?",
        a: "A running job's timer counts down the stop's budgeted hours (for example '1h 05m left') and turns red as 'over budget' once it passes; break time doesn't count against it, and a stop with no budget shows plain elapsed time. When the crew stops a job, a Time summary lists each person's start and finish and the total crew time so they can correct someone who arrived late or left early before tapping Done.",
      },
      {
        q: "What if someone is late, out today, or leaves early?",
        a: "On the Crew App's My Schedule screen tap Edit Crew. Mark 'Not working' for someone who is out (they're skipped by Start Day and Start Job), tap Clock In for a late arrival, 'Left for the day' for someone leaving early, and Back if they return the same day (the time away comes off as an unpaid break). The office can fix anything afterward on Report Center > Payroll, or with Edit Job Times on the Dispatch Board.",
      },
      {
        q: "Can the crew leader add someone from another crew for the day?",
        a: "Yes. On the Crew App's My Schedule screen tap Edit Crew, then use the 'Add someone to my crew today' picker at the bottom, choose the person and tap Add. It lists people from the company's other crews who aren't already on yours today. They're moved onto your crew for today only (the same one-day move the Dispatch Board's Team Assignment makes), clocked in like a late arrival, and added to the running job's punches if a job is in progress. They return to their usual crew tomorrow. Only people who are on some crew's roster can be added; add anyone else under Team > Crews first.",
      },
      {
        q: "How do I assign a job straight to one person instead of a crew?",
        a: "Landscapt > Team > Employees > open the person > Edit > User Settings > tick 'Schedule Jobs Directly' and save. That person then appears by name in every crew dropdown (new job, Edit Job, the visit panel and the Dispatch Board) and you assign to them like a crew. Behind the scenes they get their own one-person crew; if their login is linked to the employee and isn't already attached to another crew, it's attached to that crew so they see the jobs in the Crew App. Unticking the box (or deactivating the employee) retires that crew: it stops appearing in dropdowns but past jobs keep their history. A person already on a regular crew can't also be on a second crew's standing roster on the same days, so for them add the personal crew's day through Team Assignment or Edit Crew when they work it.",
      },
      {
        q: "I can't see employees to drag onto a crew on the Dispatch Board. Where are they?",
        a: "Open Team Assignment on the Dispatch Board. The green column on the left has an 'Unassigned people' list: every active employee who isn't on a crew for the day you're viewing. Drag a person onto a crew (or tap them, then tap the crew) to put them on it for that day only; they return to Unassigned the next day. If the list says 'Everyone is on a crew', every active employee is already on a roster for that weekday: drag them from their crew to another one instead. To add someone to a crew permanently, use Team > Crews > open the crew > Team Assignments > Add Assignment.",
      },
      {
        q: "What is the $/hr box next to an employee on a crew's Team Assignments tab (labor burden rate)?",
        a: "It's the employee's fully-loaded labor cost per hour on that crew: wages plus payroll taxes, benefits and other overhead you carry for them. It is what the person costs you, never what the customer is charged (customer pricing comes from the job's service lines and rates). You'll find it on Team > Crews > open the crew > Team Assignments, and only if your role has the 'Show Wage Burden' payroll permission. It drives labor cost: clock-out labor on each visit, the Job Cost Summary, Timesheet Detail and Crew Hours Summary reports, and a visit's labor when its hours are edited. If you leave it blank, Landscapt uses the employee's hourly rate (Team > Employees) times your company Labor Burden % (Settings > Overhead Recovery) instead; if neither is set, labor cost shows as $0. Reports that average a crew's rate (marked with a dagger) average these per-person rates across everyone on the crew.",
      },
      {
        q: "Why does an office login show a My Schedule tile on the home screen?",
        a: "Because that login is attached to a crew (Team > Crews > Linked Login, or automatically through 'Schedule Jobs Directly'), and the crew has a visit today, or a stop still clocked in from an earlier day. The tile opens the Crew App's My Schedule, so an owner or office employee who goes into the field doesn't need a second shared crew login. On a day with nothing assigned the tile is hidden. Shared crew logins always see My Schedule on their own home screen.",
      },
      {
        q: "Why can't a crew login clock in or out, or edit its crew?",
        a: "The Crew App finds the crew's stops, roster and day clock by the crew its login is attached to. If the login's crew has no jobs or visits assigned to it, or the jobs sit on a different (for example inactive or duplicate) crew, the schedule looks empty and clock in/out is refused as not assigned; an empty roster also leaves Edit Crew with no one to show. Check Team > Crews that the login is linked to one active crew, that the crew has members under Team Assignments, and that the jobs are assigned to that crew (Edit Job > Crew). Each crew can have only one linked login.",
      },
      {
        q: "Does the audit trail show which crew a job or visit moved from and to?",
        a: "Yes. A crew change on a job or visit now reads like 'crew: Maintenance 1 → Test Crew' on the visit's Audit tab and the job's Audit Trail, with who made the change and when ('Unassigned' shows when a side was empty). Entries logged before this change say only 'crew changed'.",
      },
      {
        q: "Where do I get crew hours for payroll?",
        a: "Landscapt > Reports > Payroll tab (admins and any role with the \"View & Edit Payroll Report\" permission, under Report Access in the role editor; other users don't see the tab). Pick a period (up to 62 days, with This week / Last week / Last 2 weeks shortcuts), expand an employee to see each day, and correct clock-in/out times, unpaid break minutes or hours, add extra hours (shop time, PTO) with a note, then Save. Export as Excel (totals + daily), CSV or PDF. Corrections only change the Payroll report; recorded shifts and Job Costing are untouched. Amber 'check' badges mark days that were never ended, have an open job punch, or had no Start Day.",
      },
      {
        q: "Can two crews work the same job on the same day?",
        a: "Yes. Open the visit on the Dispatch Board (or the job's Visits table > Change date / crew) and use 'Crews on this stop' > 'Add another crew…'. Each crew gets its own visit, so it has its own row in its own column, its own stop in the Crew App, and clocks its own hours. The original visit is the Lead: it carries the revenue and creates the one invoice, the added crew's visit shows $0 and never invoices, and Job Costing adds up every crew's labor. A shared stop uses one contract visit, rescheduling one crew moves the others that haven't started, and snow visits can't take a second crew.",
      },
      {
        q: "Why does the second crew on a shared stop show $0 and no Invoice button?",
        a: "The stop bills once, from the Lead visit, so the added crew's visit carries no revenue and can't be invoiced on its own — its hours still count in Job Costing and the job's labor. If you remove the Lead crew from the stop, billing passes to the next crew automatically.",
      },
      {
        q: "Should we report near misses, or only injuries?",
        a: "Report both. A near miss is an event that could have hurt someone but didn't, and the Injury / Near Miss form in Job Photos > Field has its own type for it. Near misses are tracked and reported separately and never reset Days Since Last Injury or the Accident Free Workdays KPI, so reporting them can't make your numbers look worse.",
      },
      {
        q: "Does the in-app injury report replace our paper accident investigation form?",
        a: "No. The in-app report is the quick intake and the place the case is tracked. Keep using your paper investigation form for the detail that doesn't belong in the app (date of birth, address, unsafe acts and conditions checklists, signatures) and attach the finished PDF to the case's Files tab.",
      },
      {
        q: "Why didn't my supervisor get an alert when I filed an injury report?",
        a: "The alert finds the supervisor by matching the name typed on the report to an employee who has a login — pick the name from the suggestions rather than typing it. People on the Injury & Near-Miss Report Recipients list (Settings > Notifications, default all admins and managers) are alerted regardless, and anyone can turn the alert off for themselves. You are never alerted about a report you filed yourself.",
      },
      {
        q: "Why is Accident Free Workdays showing a dash?",
        a: "It's calculated from Injury Cases, and shows a dash until at least one injury or illness case exists. Near misses and deleted cases don't count.",
      },
      {
        q: "What's the difference between an estimate's stage and its approval status?",
        a: "Stage (Draft/Quote/Sent/Accepted/Lost/Invoiced) tracks where the estimate sits in the sales process. Approval Status (Not Required/Pending/Approved/Rejected) is a separate internal sign-off gate — an estimate can be stuck 'Pending' approval even though its stage already says 'Sent', which blocks it from actually going out.",
      },
      {
        q: "Why can't I pick a client as a parent account?",
        a: "A commercial client can only be linked as a parent if it doesn't already have a parent of its own — the hierarchy is one level deep. If the client you want to use as a parent is itself a sub-account, unlink it from its current parent first.",
      },
      {
        q: "Where do I enter a property's zone measurements, like turf or mulch bed square footage?",
        a: "Use More → Aerial Measurement on the client: trace each turf, mulch bed or hardscape area on the satellite map (Trace Area), cut out things like the house with Subtract Area, and measure fences or edging with Measure Distance. Totals are saved on the property, and for the client's own address they are also copied to the client's takeoff fields (Turf, Mulch Bed, Parking Lot / Hardscape, Gross). You can also type the client-level totals on the Edit Client dialog's Custom Fields tab. Either way they feed the estimating engine's production-rate calculations. For a client with several properties, type each property's measurements in the Add/Edit Property dialog (Measurements), or trace them with Aerial Measurement; an estimate for a property defaults production-rate quantities from that property, and a blank value stays blank instead of using another address's numbers.",
      },
      {
        q: "Does the 'PO Number' field on an invoice link to a purchase order in the PO module?",
        a: "No. It's a free-text field for the client's own purchase order reference number and has no connection to this platform's internal Purchase Orders (Requisitions → POs → Receiving). To connect vendor PO spend to a CRM job, assign the PO line item to a Project instead — cost tracking is at the project level, not the individual job.",
      },
      {
        q: "How does the Dispatch Board calculate hours if a crew doesn't clock in?",
        a: "It falls back to (scheduled end time − scheduled start time) × the number of crew members assigned to the visit. Clocking in/out with actual times overrides this estimate.",
      },
      {
        q: "What's the difference between a job's 'Waiting List' type and the Waiting List page?",
        a: "They're the same thing — a job with type 'waiting_list' (or 'package', before its recurring dates are set) has no fixed date, only a date range, and automatically surfaces on the Waiting List page for opportunistic dispatch.",
      },
      {
        q: "How is snow invoicing different from a regular invoice?",
        a: "Snow Invoicing groups a client's uninvoiced storm visits and computes the total from the job's invoice type — a flat rate per storm event, a rate per inch of snowfall, or an hourly rate — rather than itemizing a fixed monthly job the way a regular contract invoice does.",
      },
      {
        q: "A snow visit shows 'Possibly billed on invoice #N' — what does that mean?",
        a: "The visit's job already has a non-void invoice line for the same service date that isn't linked to the visit (for example an invoice made by hand), so generating from Snow Invoicing would bill it a second time. Check that invoice first; if you generate anyway you'll be asked to confirm with 'Bill anyway'.",
      },
      {
        q: "Why can't I charge an invoice or void it?",
        a: "Hover the greyed-out button. Void is blocked while payments are applied (refund or unapply them first). Charge is blocked while a card charge or bank debit is still processing (bank debits take a few business days), and charging is refused while a chargeback on that invoice is open, until the dispute closes.",
      },
      {
        q: "Why does a client's proposal link still show the old price after I edited the estimate?",
        a: "The link shows the last version you sent. Edit as much as you like, then use Send or Copy link to publish the new version; until then the client sees the previous one and can't accept it. The estimate header shows an 'Edited since Version N was sent' banner when the two differ.",
      },
      {
        q: "Can an automation email send itself before anyone reviews it?",
        a: "Only if 'require approval' is off for that email event. Turn it on to hold the email for manual approval before it sends — useful when you're not fully confident in a new automation yet.",
      },
      {
        q: "How do I make several steps run only for some clients (If Branch)?",
        a: "Add an If Branch to the sequence, set its conditions, then use 'Add step inside' on the branch card to put each step in the block. Everything inside runs only when all the conditions are met; everyone else skips the whole block and continues with the step after it. Steps are added at the end of the sequence or block (no drag-to-reorder yet), deleting a branch deletes its block, and a deactivated branch isn't checked so its steps run for everyone. If a step ran for someone who didn't qualify, check that it's indented under the branch and the branch is active — the execution log shows 'branch false' when a block was skipped.",
      },
      {
        q: "Can an Other Charge be a percentage of the invoice instead of a fixed amount?",
        a: "Yes. In Settings > Accounting > Other Charges choose 'Fixed $' or '% of invoice' for each charge (e.g. a 4.5% fuel surcharge). When you add it to an invoice, or to many invoices at once from the Invoices list (Actions > Add Other Charge), the dollar amount is worked out from that invoice's service lines — each after its own discount, not counting other charges or the invoice discount — and written as a normal line such as 'Fuel Surcharge (4.5%)'. It doesn't change afterwards if you edit the services, and an invoice with no service lines is skipped because there's nothing to take a percent of.",
      },
    ],
  },
  {
    label: "Users & Settings",
    items: [
      {
        q: "Where did some menu items go — what is the 'More' row in the sidebar?",
        a: "To keep the Landscapt sidebar short, less-used items sit under a collapsed More row at the bottom of their group: Requisitions, Contracts, Snow Invoicing and Commissions (Accounting), and Services, Products, Schedules, Packages and Documents (Administration). Invoices, Payments and Purchase Orders stay visible. The CRM and Scheduling groups are always fully visible. Click More to expand it; it opens by itself when you are on one of those pages. Commission plans and assignments now live in Settings > Commissions.",
      },
      {
        q: "Everything looks too big (or too small) — how do I change the display size?",
        a: "Click the sun/moon Appearance button in the top bar and pick a Display size: 80% (compact, the default), 90%, or 100% (normal browser size). It scales the whole app — text, sidebars, dialogs, side panels and the pop-up notices in the bottom right — so you don't need to zoom your browser out. The choice is saved on that browser and applies on the home screen too. It only shows on a desktop or laptop screen with a mouse; phones and tablets always use 100%, and printed pages and PDFs are unaffected. The same menu has the Light / Dark / System theme. In dark mode, on/off switches show an ON switch as a white track and an OFF switch as a dark gray track, so you can tell them apart at a glance.",
      },
      {
        q: "Why does Settings → Clients say my next account number is too low?",
        a: "The next account number can't be set at or below the highest account number already in use, so new clients never collide with existing ones. Leave it as shown, or pick a higher number.",
      },
      {
        q: "Why does changing the timezone ask me to confirm?",
        a: "The company timezone decides what “today” means everywhere: the dispatch board, crew days, billing dates and reports. Landscapt asks before changing it.",
      },
      {
        q: "Why can't I change someone's Landscapt role on their employee record?",
        a: "Only an admin can change an employee's Landscapt Role or link or unlink their login. Other roles see those controls disabled.",
      },
      {
        q: "Why can't I deactivate a role?",
        a: "Employees still hold it, and an inactive role grants nothing, so they would lose Landscapt access. Move them to another role first.",
      },
      {
        q: "Where is the owner's employee record?",
        a: "Signing up creates an employee record for the owner with the Owner role, so the owner can be picked as a sales rep or assignee and sees their own items in My Day. My Day shows Everyone for a login with no employee record.",
      },
      {
        q: "Which Landscapt role permissions are actually enforced, and which only hide things?",
        a: "Most are enforced on the server, so a role without them is refused even through another route. That covers creating or changing invoices and invoice lines, estimates and their lines, contracts, jobs (setting a job to Cancelled needs the Cancel permission), tickets, campaigns (scheduling and sending need Send; other edits need Edit), automations, document templates, packages, teams and running reports. The full list by permission is in the Users & Roles guide. Also enforced: changing a client's Office Notes needs View Notes; changing the stored card or turning autopay on needs View Credit Card #'s plus Add/Modify Payments; changing a client balance directly needs View Balance plus Add/Modify Credits. Still hide-only: View Notes, View Credit Card #'s, View Balance, View Billing and Export Lists decide what the screen shows, but a login that queries the data directly could still read it, and exports are built in the browser from rows already loaded. Admins always pass.",
      },
      {
        q: "What is Ask AI, and what if it can't answer my question?",
        a: "Ask AI (Help menu > Ask AI) answers how-do-I questions from these help guides and the app's data model, including whether something is actually tracked. Check anything critical, since answers are generated. Each organization can ask up to 100 questions a day. If an answer doesn't solve it, click 'Didn't answer it? Send this conversation to support', add an optional note, and send. Our team gets the whole conversation and replies to you directly: in your support chat if your plan includes chat support, otherwise by email.",
      },
      {
        q: "How do I chat with support, and can I edit a message?",
        a: "If you have chat support (included with the Growth and Enterprise plans, or as an add-on), Help > Chat with us opens your own private conversation with the Landscapt team (teammates can't see it, and everyone else in your company has their own; crew logins don't get chat); once it has messages, a chat bubble stays on screen as the way back in. Messages keep line breaks and bold text, and links are clickable. Hover your own message and click the pencil to edit it (it then shows 'edited'). The header shows Open, In progress or Resolved; a resolved conversation reopens when you send another message. Without chat support you can use Send Feedback or Email Support from the same Help menu.",
      },
      {
        q: "How do I report a bug or suggest an idea?",
        a: "Use Send Feedback (the feedback button in the app, also on the Support page). Pick Bug, Idea or Other, describe what happened or what you'd like, and attach a screenshot if you can — the page you were on is included automatically. Submissions go straight to the Landscapt team.",
      },
      {
        q: "How do I add or remove users from my organization?",
        a: "Go to Settings > Users. Admins can invite new users by email and assign a role (Admin, Manager, Staff, Purchaser, Requestor, or Viewer). Users receive an email invitation and set their own password on first login.",
      },
      {
        q: "What happens if we cancel our subscription?",
        a: "The account becomes read-only for 90 days: you can still view your data, but saves are blocked, automations pause (scheduled invoices, reminder and report emails, campaigns, automation sends and your Zapier API key all stop working), and a banner shows the end date with a Resubscribe link (Settings > Subscription). After 90 days the app locks and shows a Resubscribe screen; your data is kept. Resubscribing restores full access and resumes automations.",
      },
      {
        q: "What happens when my free trial ends?",
        a: "Once the trial end date passes, Landscapt and Equipt lock and show a screen asking you to subscribe; Settings and Billing stay reachable so you can upgrade. Your data is kept, and the database also refuses saves from a stale tab or an API call, so nothing can be changed until you subscribe. Choosing a plan restores full access straight away.",
      },
      {
        q: "Can I customize which fields are required?",
        a: "Yes. Go to Settings > Required Fields to toggle required/optional status for fields across both modules.",
      },
      {
        q: "How do I import existing data?",
        a: "Open the list for what you want to import (Clients, Parts, Products and so on), choose Import / Export, then Download Template to get a blank file with the right columns. Fill it in and upload it with Import CSV; the importer validates each row and tells you which rows failed or were skipped as duplicates. Settings > Import / Export also exports your data in the same column layout, which works as a template too.",
      },
      {
        q: "What file formats and values does the CSV importer accept?",
        a: "CSV files saved as UTF-8, Windows-1252 (Excel's 'CSV (Comma delimited)' on Windows) or UTF-16 ('Unicode Text') all import with accents and curly quotes intact, and columns can be separated by commas, semicolons or tabs. Money cells can include a $ and thousands separators ($1,250.50). The protective leading quote an export adds in front of =, +, - or @ is removed on import. If some rows fail, the dialog says how many imported and how many failed, with each failing row's reason. Rows skipped as duplicates are listed separately: clients that match an existing client's email or phone, products with no part number that match an existing product's name, and employees with no email that match an existing employee's name. Re-importing employees only updates the cells your file fills in.",
      },
      {
        q: "Why can't I invite a user, or assign an approver?",
        a: "An invite is refused when the email already belongs to a different type of account (such as a client portal login) or to a user in another organization; use a different email. In an approval flow editor, Requisition and Purchase Order steps can't be assigned to the viewer or requestor role, or to a user with one of those roles, because they can't approve; pick a manager, admin or purchaser.",
      },
      {
        q: "How is data isolated — can other companies see our data?",
        a: "All records are scoped to your organization at the database level using Row Level Security. Queries that don't match your org ID return zero rows by design. No data is ever shared between organizations.",
      },
      {
        q: "How do I connect the Samsara integration for vehicle odometers?",
        a: "Go to Settings > Integrations and enter your Samsara API key. Once connected, vehicle odometer readings sync automatically and update the corresponding vehicle meter, which can trigger mileage-based automations.",
      },
      {
        q: "How do I connect QuickBooks?",
        a: "An admin goes to Landscapt Settings > Integrations (or Settings > Accounting), clicks Connect QuickBooks, signs in to Intuit, chooses the QuickBooks Online company and approves. Invoices and payments created from then on are sent to QuickBooks automatically. It's one-way — nothing comes back from QuickBooks — and only QuickBooks Online is supported.",
      },
      {
        q: "Why isn't an invoice showing up in QuickBooks?",
        a: "Drafts are never sent, and invoices created before you connected aren't backfilled. Otherwise check Settings > Accounting > Sync Status for the reason and click Retry. The most common cause is a client whose name only loosely matches an existing QuickBooks customer: open the client's QuickBooks section, click Sync to QuickBooks, and pick the right customer. A safety-net job also re-checks every 15 minutes.",
      },
      {
        q: "If I change or void an invoice in Landscapt, does QuickBooks update?",
        a: "Yes. Editing a sent invoice (lines, tax, number, date, terms) updates the same QuickBooks invoice about two seconds after you stop, and voiding it voids it in QuickBooks. A voided QuickBooks invoice can't be reopened, so un-voiding in Landscapt shows a sync error instead. Changes made in QuickBooks are never pulled back.",
      },
      {
        q: "Do payments and refunds sync to QuickBooks?",
        a: "Yes. Recorded payments and Stripe card/ACH payments are sent as payments against the invoice, with your check or reference number. A split payment becomes one QuickBooks payment per invoice. Refunding voids the QuickBooks payment (full refund) or reduces it (partial), and chargebacks do the same. Prepayments and credits not applied to an invoice don't sync.",
      },
      {
        q: "Why is the QuickBooks total different from my Landscapt invoice?",
        a: "Almost always sales tax: QuickBooks calculates tax itself from a tax code at the invoice's rate, and any difference is recorded under Settings > Accounting > Sync Status. Check the tax rate on the invoice and the tax setup on the QuickBooks company, then fix whichever is wrong and Retry.",
      },
      {
        q: "How do I connect Zapier?",
        a: "Go to Master Account Settings > Integrations and click Generate Key — this is account-wide, not tied to Equipt or Landscapt specifically. Paste the key into Zapier's API Key field when connecting the app. Most Landscapt triggers fire instantly; most Equipt triggers check every few minutes instead. There's a full, detailed guide to every trigger and action linked right on that Integrations tab, under the API key.",
      },
    ],
  },
  {
    label: "How the pieces connect",
    items: [
      {
        q: "How do I create a crew (without a login) on the Team → Crews page?",
        a: "Go to Landscapt > Team > Crews and click Add Team (needs the Teams scheduling permission). On the Team Details tab enter a Description (the crew's name), pick a Color, and optionally a Team Code, Linked Login and starting address, then click Create & Continue. The dialog stays open on the Team Assignments tab, where you click Add Assignment to put employees on the crew's default roster. A crew with no Linked Login still works on the Dispatch Board and Crew Board; it just has no Crew App schedule of its own until you link a login (or create a crew account under Settings > Users, which creates the crew and the login together).",
      },
      {
        q: "How do I remove a crew from the Dispatch Board / make a crew inactive?",
        a: "Before it confirms, the app tells you if the crew still has active jobs or upcoming visits; those stay on the inactive crew (hidden from the crew dropdowns, and its linked login sees nothing), so reassign them first. A job or visit whose crew was made inactive shows it as 'Name (inactive)' in Edit Job and the visit panel instead of a blank field. In the crew's Linked Login picker, a login already attached to another crew is shown greyed out with that crew's name. Go to Landscapt > Team > Crews. In the Active column, turn the crew's switch off and confirm. The crew moves to the Inactive tab and stops appearing as a crew you can schedule on the Dispatch Board and Crew Board; its history is kept. To bring it back, open the Inactive tab (or All) and turn the switch on. You need the Teams scheduling permission. This is separate from the crew's login: deactivating the login under Settings > Users only blocks sign-in and does not change the crew on the board.",
      },
      {
        q: "If I create a crew account in Settings, does it show up as a crew in Landscapt?",
        a: "Yes. Settings > Users > Create Crew Account makes the shared login and also creates a Landscapt crew with the same team name, linked to that login. If you already had an unlinked crew with that name, the login is attached to it instead of creating a duplicate. You can change the link any time under Landscapt > Team > Crews > edit the crew > Linked Login (pick another login, or None to unlink).",
      },
      {
        q: "What does a crew see if their login isn't linked to a Landscapt crew?",
        a: "An empty schedule. The Crew App finds a crew's stops by the crew its login is linked to, so an unlinked login has nothing to show and can't clock in or out on any stop. Link it under Landscapt > Team > Crews > Linked Login. Crew accounts created before the automatic link existed may need this done once by hand.",
      },
      {
        q: "Can a regular user (not a shared crew login) be assigned to a crew, and how do they see their jobs?",
        a: "Yes, two ways. To put them on the crew's roster for scheduling and costing, add their employee record under Landscapt > Team > Crews > the crew > Team Assignments. To let them see the crew's stops in the Crew App as themselves, pick their name under Linked Login on the same crew (it lists regular users as well as shared crew logins) — they then find the stops under Scheduling > My Crew Schedule. Without a Linked Login, a regular user can still see the crew's jobs on the Dispatch Board by filtering it to that crew.",
      },
      {
        q: "Why is my crew account password rejected?",
        a: "Passwords that are common or have appeared in a known data breach are refused, even if they meet the length rule. Choose a longer, less predictable password — for example, three unrelated words plus a number.",
      },
      {
        q: "Are clients and vendors the same thing?",
        a: "No. Clients are your customers (Landscapt > Clients) and are never suppliers. Vendors are the companies you buy from, and the Vendors list is shared: Equipt (purchasing and maintenance) and Landscapt (subcontractors, chemical suppliers) all read and write the same vendor records, so editing a vendor in one place changes it everywhere.",
      },
      {
        q: "Can a work order turn into a purchase requisition?",
        a: "Yes. When a work order needs parts, you can create a requisition from it, and the requisition keeps a link back to that work order. It then follows the normal approval and PO process.",
      },
      {
        q: "How do parts inventory counts change?",
        a: "Quantity goes up only when you receive a purchase order line for a maintenance part on a goods receipt. It goes down when a part is added to a work order's Costs tab, or when a PM schedule generates work orders that include parts. Counts never go below zero.",
      },
    ],
  },
];
