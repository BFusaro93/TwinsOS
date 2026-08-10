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
} from "lucide-react";
import type { ElementType } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocStep {
  step: string;
  detail: string;
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
            step: "Maintenance (CMMS) Module",
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
        ],
      },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance (CMMS)",
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
        ],
      },
    ],
  },
  {
    id: "crm",
    label: "CRM / Field Service",
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
    label: "CRM / Field Service",
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
    ],
  },
];
