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
  Ticket,
  Globe,
  Camera,
  BarChart3,
  Upload,
  ListChecks,
  Satellite,
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
            step: "Technician",
            detail:
              "Focused on CMMS — can create and update work orders, record meter readings, view PM schedules and parts. Cannot approve requisitions or modify settings.",
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
              "A Maintenance Request is a lower-friction way for technicians or requestors to flag an issue. It goes through an approval flow before becoming a Work Order, giving managers a triage step.",
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
              "Schedules can repeat daily, weekly, monthly, quarterly, or annually. Set the start date and the system calculates the next due date automatically.",
          },
          {
            step: "One schedule can cover multiple assets",
            detail:
              "A PM Schedule's Assets tab holds a list of assets, not just one — useful for a fleet-wide routine like 'Quarterly Blade Sharpening' that applies to every mower on the crew. Add or remove assets from that tab at any time.",
          },
          {
            step: "Parts lists",
            detail:
              "Two ways to plan parts for a PM: the schedule-level Parts tab lists parts expected for the routine in general, while each asset row on the Assets tab can carry its own per-asset parts list (with quantity and unit cost) — useful when different assets on the same schedule need different parts, e.g. different oil filter part numbers per mower model.",
          },
          {
            step: "Notifications",
            detail:
              "PM schedules due within 7 days appear in the Notifications bell as 'PM Due' alerts. The PM Due Reminder automation template can also create a work order automatically before the due date.",
          },
          {
            step: "Mark as complete",
            detail:
              "When a PM is completed (usually via the linked work order), mark the schedule complete. The next due date advances by one recurrence period.",
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
            step: "Linking to assets",
            detail:
              "In the part detail, use the Assets tab to link which assets use this part. This is many-to-many — a single part can serve multiple assets.",
          },
          {
            step: "Multiple vendors per part",
            detail:
              "A part can list a primary vendor plus alternate vendors it's also sourced from. This is for reference/reordering convenience — it does not split the part into separate catalog entries.",
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
              "Open any asset or vehicle detail and go to the Meters tab. Click '+ New Meter'. Choose the unit (miles, hours, gallons, cycles, etc.) and give it a name.",
          },
          {
            step: "Recording a reading",
            detail:
              "Click the meter and use '+ Add Reading'. Enter the value and date. The meter's current value updates to the latest reading.",
          },
          {
            step: "Creating a meter-threshold automation",
            detail:
              "Go to CMMS > Automations and click '+ New Automation'. Set Trigger Type to 'Meter Threshold', select the meter, choose the operator (≥ for cumulative like mileage), and enter the threshold value.",
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
            step: "Client status",
            detail:
              "Status is one of Active, Inactive, Lead, or Cancelled. Cancelling a client requires picking a reason — Price, Moved, Unhappy with Service, No Longer Needs Service, or Other — which is kept on the record for churn reporting.",
          },
          {
            step: "Commercial parent/child hierarchy",
            detail:
              "Use 'Link Parent Account' on a commercial client to nest it under a property-manager parent. Only a client that isn't already a child itself can be picked as the parent — the hierarchy is one level deep. The parent's record shows a Sub-Accounts banner with the combined balance across all its children.",
          },
          {
            step: "Adding a property",
            detail:
              "On a client's detail page, click 'Add Property' under Related Properties. Enter the property name/label, street address, city/state/zip, gate code, and notes to crew. Turf sq ft, mulch bed sq ft, gross sq ft, and linear ft measurements are entered on the client's Custom Fields tab and feed the estimating engine's production-rate calculations.",
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
              "CRM > Scheduling > Dispatch Board shows one day at a time with a week strip for picking the date. Click a visit's status pill to cycle it forward — Scheduled → Dispatched → In Progress → Completed (or Skipped) — and assign crews directly from the board.",
          },
          {
            step: "How actual hours are calculated",
            detail:
              "Unless a crew clocks in and out manually, a visit's actual hours are calculated as (scheduled end time − scheduled start time) × number of crew members assigned — not a fixed estimate carried over from the job.",
          },
          {
            step: "Packages",
            detail:
              "Go to CRM > Settings > Packages to bundle recurring services (e.g. a 7-Step Fertilizer program) under one program. A package's Services tab defines each visit — its service, date window, minimum days between visits, and default budgeted hours/rate. The fixed monthly billing amount, discount, and renewal terms live on the resulting job once a client is signed up, not on the package template itself.",
          },
          {
            step: "Projects",
            detail:
              "CRM > Scheduling > Projects tracks one-off landscaping jobs distinct from recurring service — the CRM equivalent of the PO module's Projects/Jobs section, used the same way for cost tracking and reporting.",
          },
          {
            step: "Full guides",
            detail:
              "Job types and Packages get their own deep dive; the Dispatch Board's status cycling and actual-hours calculation get a dedicated guide.",
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
            step: "Contracts",
            detail:
              "CRM > Accounting > Contracts covers ongoing agreements: a monthly amount, billing frequency (weekly through annual, or one-time), auto-renew, billing day of month, and whether the contract bills a month in advance. Month-by-month amount overrides are supported for seasonal pricing.",
          },
          {
            step: "Sub-properties on one contract",
            detail:
              "A commercial contract can be set to include sub-properties — billing every property under a parent client's hierarchy from a single contract rather than issuing one contract per site.",
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
              "CRM > Settings > Card Payments (Stripe). Click Connect and complete Stripe's onboarding — this creates a Standard connected Stripe account for your org, fully independent of Landscapt's own billing. Charges, payouts, and your Stripe dashboard login are entirely managed by Stripe; Landscapt only initiates charges and listens for the result.",
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
              "A processing fee is added automatically to card charges (not ACH) to cover the Stripe rate. Staff can waive the fee or override it to a custom amount on any single charge. Fees collected flow into the Profit & Loss report as 'Credit card processing fees' income, and the Credit Card Processing Fees report itemizes every fee by payment.",
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
              "A CRM customer-service record — distinct from a CMMS Maintenance Request, which is for asset/equipment issue triage. Every published form submission automatically creates an open ticket, in addition to manual creation and automation-driven creation.",
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
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full lifecycle from form submission to close, the real status/priority/type values, and a clear line between Tickets and CMMS Maintenance Requests.",
            href: "/settings/support/tickets-guide",
            linkLabel: "Open the Tickets guide",
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
              "Open, In Progress, Resolved, or Closed. Creating a case can fire both an internal automation and a Zapier trigger.",
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
        summary: "75 reports across 12 categories, plus curated and custom dashboards.",
        icon: BarChart3,
        steps: [
          {
            step: "Where it lives",
            detail:
              "CRM > Reports. A 4-tab shell: Dashboard (the legacy overview), Custom Dashboards, Report Center (the searchable catalog), and My Reports (saved analyses).",
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
            step: "Full guide",
            detail:
              "A deeper walkthrough — a worked example running the Production Rate Accuracy report end to end, and the distinction between curated and custom dashboards.",
            href: "/settings/support/report-center-guide",
            linkLabel: "Open the Report Center guide",
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
              "Go to Vendors in the sidebar. Click '+ New Vendor'. Enter name, contact name, email, phone, and address. Vendors are immediately available on all Requisition, PO, and CRM forms.",
          },
          {
            step: "Vendor history",
            detail:
              "Open a vendor to see all POs issued to them, total spend, and contact history. Use this for vendor performance reviews and negotiations.",
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
              "A daily scheduled sync, plus a manual 'Sync Now' button for admins. There's no webhook — Samsara doesn't push data to TwinsOS in real time.",
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
        q: "How do I create a purchase order from a requisition?",
        a: "Open the approved requisition from Purchasing > Requisitions and click 'Convert to PO' in the detail panel. The PO is pre-filled with all line items, vendor, and cost information. You can adjust any field before saving.",
      },
      {
        q: "Why can't I approve my own requisition?",
        a: "There's no rule against it — if you hold the role assigned to that approval step, you're listed as an eligible approver even on your own submission. What usually happens is another eligible approver decided first: when a step allows any user with a role (e.g., any Manager) to approve, the first decision resolves the step and the other eligible approvers' entries are marked 'Superseded'.",
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
        a: "A Work Order is a direct maintenance task — created by Managers, Technicians, or Admins and immediately actionable. A Maintenance Request goes through an approval flow before becoming a Work Order. Requestors can only submit requests.",
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
        q: "What's the difference between an estimate's stage and its approval status?",
        a: "Stage (Draft/Quote/Sent/Accepted/Lost/Invoiced) tracks where the estimate sits in the sales process. Approval Status (Not Required/Pending/Approved/Rejected) is a separate internal sign-off gate — an estimate can be stuck 'Pending' approval even though its stage already says 'Sent', which blocks it from actually going out.",
      },
      {
        q: "Why can't I pick a client as a parent account?",
        a: "A commercial client can only be linked as a parent if it doesn't already have a parent of its own — the hierarchy is one level deep. If the client you want to use as a parent is itself a sub-account, unlink it from its current parent first.",
      },
      {
        q: "Where do I enter a property's zone measurements, like turf or mulch bed square footage?",
        a: "On the client's Custom Fields tab, not the Add Property dialog — there's currently no dedicated per-zone editor in the UI. The client-level totals (Turf Sq Ft, Mulch Bed Sq Ft, Gross Sq Ft, Linear Ft Perimeter/Edging, Yards of Mulch) entered there feed the estimating engine's production-rate calculations.",
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
        q: "Can an automation email send itself before anyone reviews it?",
        a: "Only if 'require approval' is off for that email event. Turn it on to hold the email for manual approval before it sends — useful when you're not fully confident in a new automation yet.",
      },
    ],
  },
  {
    label: "Users & Settings",
    items: [
      {
        q: "How do I add or remove users from my organization?",
        a: "Go to Settings > Users. Admins can invite new users by email and assign a role (Admin, Manager, Purchaser, Technician, Requestor, or Viewer). Users receive an email invitation and set their own password on first login.",
      },
      {
        q: "Can I customize which fields are required?",
        a: "Yes. Go to Settings > Required Fields to toggle required/optional status for fields across both modules.",
      },
      {
        q: "How do I import existing data?",
        a: "Go to Settings > Import / Export. Download the template for the entity you want to import, fill it in, and upload. The importer validates each row before committing.",
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
        q: "How do I connect Zapier?",
        a: "Go to Master Account Settings > Integrations and click Generate Key — this is account-wide, not tied to Equipt or Landscapt specifically. Paste the key into Zapier's API Key field when connecting the app. Most Landscapt triggers fire instantly; most Equipt triggers check every few minutes instead. There's a full, detailed guide to every trigger and action linked right on that Integrations tab, under the API key.",
      },
    ],
  },
];
