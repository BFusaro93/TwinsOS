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
              "Can submit maintenance requests only, and edit or delete their own while it's still Open. Cannot create work orders directly. Useful for field staff or other departments who need to flag issues.",
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
              "Go to CMMS > Work Orders and click '+ New Work Order'. Fill in the title, linked asset or vehicle, priority (Low / Medium / High / Critical), due date, and assign to a technician.",
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
              "PM schedules due within 7 days appear in the Notifications bell as 'PM Due' alerts. The PM Due Reminder automation template can also create a work order automatically before the due date — once for each PM schedule each time it comes due.",
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
              "Click the meter and use '+ Add Reading'. Enter the value and date (today or earlier, on your company's calendar). The meter's current value updates to the latest reading.",
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
              "Every time you record a meter reading (or set a new meter's starting value, or edit a meter's value directly), the automations engine runs instantly in the background. If the reading crosses a threshold, the WO or request is created right away.",
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
              "A labor line's cost pre-fills from your org's breakeven (fully-burdened) rate the first time it's added, and only while it's still zero — edit it directly to override. Overhead markup applies per cost type (Labor, Sub-Contract, Product/Material, Asset/Equipment, Service/Other), each configurable separately in org settings. Lines costed at the breakeven rate get no overhead or labor burden added on top, because that rate already includes them; product sub-items get the Product/Material overhead.",
          },
          {
            step: "Reading the line-item grid",
            detail:
              "The grid's GM% column color-codes gross margin per line — green at 30%+, gray at 10%+, red below 10% — calculated from Rate, Cost, and Adjusted Rate. Toggle a line between per-unit (×) and fixed total ($) pricing with the Calc Type control.",
          },
          {
            step: "Converting an estimate to a job",
            detail:
              "Click 'Convert Estimate to Job', choose which line items to include, and pick a Job Type: One Time, Recurring, Project, or Waiting List. Package and Snow jobs are created directly rather than converted from an estimate. Set the date and assign a crew before confirming. A One Time job needs a Scheduled Date (if it has no date yet, convert it as a Waiting List job instead, since a dateless one-time job would have no visit to dispatch). A Recurring job only needs its Schedule: the date is labeled Start Date and is optional, so leave it blank to begin on the Schedule's next day, or set it to hold the first visit until then (visits start on the first Schedule day on or after it, with no extra hand-placed visit). Waiting List and scheduled recurring jobs are created Scheduled, not on hold. Once a line is converted, its price, quantity and visits are locked on the estimate (change them on the job); budgeted hours, cost, equipment and notes stay editable.",
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
            step: "Map: select and schedule from the map",
            detail:
              "Click Map on the Dispatch Board to open a working map above the list (the same one the Snow Jobs board uses). Stops are numbered in each crew's route order and coloured by crew; the legend shows and hides crews. Pick a mode in the panel: Select (click stops to select them, which selects them in the table too), Route order (left-click a stop to move it later in its crew's route, right-click to move it earlier) or Draw area (click points to outline a shape, then Select inside, or Add to selection to keep your current picks). With stops selected the panel offers Assign to crew... then Update, Move to date, Assign crews... (several crews on one stop) and Dispatch, which follow the same rules as the table's Actions menu: completed visits keep their crew, a visit a crew has clocked into can't be re-crewed or moved, and package Min Days and invoiced-visit locks still apply. Route order changes are a draft until you click Save Order (Clear Order discards them); Save Order also remembers the order for that crew and weekday. Show route lines draws each crew's path, and 'Show only selected stops' narrows the map or the table to your selection.",
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
            step: "Minimum charge",
            detail:
              "On a service, set Minimum Charge ($) and an optional Minimum Message (for example '4-hour minimum'). On an estimate, a per-unit line (qty x rate) is billed at least the minimum for each visit, so 2 hours at $165 with a $660 minimum bills $660, while 5 hours bills $825. The line shows 'Minimum charge applied' whenever the minimum is what is billed. Fixed-price lines, package steps and bundle items are never changed by it, and a quantity of 0 bills nothing. The minimum is copied onto the line when the service is added, so changing it later does not reprice estimates already built. It applies to estimates (and jobs and invoices created from them); services added straight to a job are not raised to the minimum.",
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
            step: "Forecast column",
            detail:
              "The Snow Jobs board's Forecast column (next to Amt) estimates each stop's charge before a crew logs a depth: flat per-event stops show their price, and per-inch or interval stops are priced at the storm event's forecast depth until a real depth is logged. Enter a forecast depth when you create the storm, or later from Actions > Edit Forecast Depth, to get numbers. Per-inch stops without one, and hourly stops, show a dash; Amt shows 'Needs depth' for per-inch stops until a depth is logged. Forecast is an estimate only: never billed, never in Snow Invoicing, and totalled separately. The All tab excludes cancelled stops, which keep their own tab and count.",
          },
          {
            step: "Turning snow on or off",
            detail:
              "If your company doesn't do snow, go to Settings > CRM > Services and untick 'We offer snow services'. Snow Jobs and Snow Invoicing then disappear from the navigation. Nothing is deleted: existing storm events, snow jobs and snow invoices are kept and return when you tick the box again. It is on by default for every company, and it only hides the menu items (a saved direct link to a snow page still opens).",
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
            step: "Storms that run several days",
            detail:
              "Every stop has its own Date (a column on the Snow Jobs board, plus a Dates filter). Click a stop's date to move just that stop, or tick several stops and use Move to date in the selection bar (or the map's selection panel). In Add Jobs each job also has its own date: tick the jobs for a day, pick the date, click Set date, then Add to Dispatch, and repeat for the next day. Finished and cancelled stops don't move, a stop a crew has clocked into can't change day, and the crew sees a stop on the day it is scheduled for. Route order is kept per crew per day, so Optimize Routes and the arrows work within one day at a time.",
          },
          {
            step: "Return trips (pushes) and how they bill",
            detail:
              "When a crew has to go back to a site during a storm, each return is its own visit (Push 2, Push 3...) with its own clock-in/out, depth and crew, and a line on the client's timeline. The office clicks Add push next to the client's name; the crew can tap 'Going back? Add another push' on a finished stop in the crew app. Billing follows the job's invoice type: Per Push and Hourly jobs bill every push; Per Event, Per Inch jobs bill the storm once, on the deepest reading across all its visits (a return trip never bills separately, but a deeper reading on it sets the price); a flat Per Event job records a return trip at no charge unless you choose 'Bill it' when adding it (for example a second salting by another crew). The Billed / No charge tag on a push can be clicked to flip it until it is invoiced. Pushes the crew adds from the tablet start as No charge.",
          },
          {
            step: "More than one crew on a stop",
            detail:
              "Tick the stops and use Assign crews... (selection bar or the map panel), tick the crews and click Set crews. The first crew is the Lead and carries the stop's charge; each extra crew gets its own row tagged Extra crew with its own clock-in, hours and depth. On Hourly jobs every crew bills its own hours on site; on every other billing type only the lead bills. Separate billable work (for example salt after plowing) is its own job, or Add push on a Per Push job, not an extra crew.",
          },
          {
            step: "Crew app: need help, or can't make it (snow stops)",
            detail:
              "On a snow stop the crew app has 'Need help? Call in another crew': the crew they pick gets the stop on its tablet straight away (even after the first crew has clocked in), as an extra crew. Before the crew has started the stop it also has 'Can't make it? Hand off to another crew': the stop moves to the other crew's tablet and comes off theirs, same visit and same billing. Both put a line on the client's timeline; a hand-off also shows 'Handed off from ...' on the board. A stop that already has several crews has to be moved by the office. Both are for snow stops only for now.",
          },
          {
            step: "Board tools: columns, filters, select all, map",
            detail:
              "Columns: Date, Service, Address, City, State, Zip, Priority, Trigger, Crew, Depth, Temp, Notes to Crew and Amt (the column chooser remembers your choice). Filters: status tabs, crew and priority in the dark bar, and a Tags filter (stops whose client has any ticked tag), and a Select a Filter row above it (click Client, Date, Service, City or Zip and tick values), plus search. The Select a Filter row also holds Stats, Map, Optimize, Export and Print, and the Legend button explains every icon and tag. The header checkbox (or Actions > Select All Shown) selects every stop currently shown, so you can filter to an area and act on all of it. The Map button opens a working map with three tools: Select (click stops), Route order (left-click a stop to move it later in its crew's route, right-click to move it earlier) and Draw area (click points to outline an area, then Select inside picks exactly the stops in the shape (replacing your current selection; Add to selection keeps your current picks too)). With stops selected, its panel shows their services, budgeted hours and total and lets you assign a crew, open Assign crews, move them to a date or dispatch them. Crews can be hidden or shown, and 'Show only selected stops' narrows the map or the table.",
          },
          {
            step: "Master Routes",
            detail:
              "Click Master Routes on the Snow Jobs board (the same editor is in Settings > Services > Snow Routes). Pick a route or add one (name, default crew, Active). 'Find jobs for this route' searches snow jobs by client or address, service, zip code(s) and distance (1 to 25 miles of an address or of one of the route's stops), with 'Not already on a route' ticked by default; tick the results and Add to route. A job can be on only one route. Snow jobs added since the routes were built are listed at the top with a NEW flag. Order stops by dragging, typing a position or the arrows; Group Stops orders every stop by driving time from the crew's shop, Optimize Route keeps stop 1 and routes onward from it. Add Jobs can then bring in a whole route, and Actions > Save Order to Master Routes writes a storm's order back onto the routes.",
          },
          {
            step: "Assigning crews: this storm only, or Permanent",
            detail:
              "Pick a crew from the selection bar's Assign crew... (or the map panel's Assign to crew...) and the change applies to this storm's stops only; next storm they come back on whichever crew their Master Route has. Tick Permanent beside the picker to also save the crew onto the Master Routes: the picker then lists each crew's active Master Routes (a crew with several shows as 'Crew name - Route name', for example 'Maintenance 1 - Plowing' and 'Maintenance 1 - Salting'), so you choose the crew and the route in one step. A crew can have several routes (for example one for plowing and one for salting, so a salt-only storm loads only the salt route); a job already on the route you pick keeps its place, others go on the end. If the crew has no route yet, one is created and named after the crew. Choosing Unassigned with Permanent ticked also takes the stops off their Master Routes. A route can only belong to the crew it is set up for.",
          },
          {
            step: "Contract caps and overage (inches, salts, events, pushes)",
            detail:
              "On a Monthly Flat Rate snow contract, tick 'This contract includes snow service' (it ticks itself when a snow job is linked), then set Snow Caps & Overage: an Inch cap (for example 60 or 80 a year), a Salt cap (for example 35 salt applications), and optional Event and Push caps. Cap resets each contract year (from the start date) or monthly. Each linked job is tagged plowing (counts toward inch, event and push caps) or salting (salt cap). Work inside a cap stays covered by the contract price; work beyond it bills as overage in Snow Invoicing, tagged Overage, at the overage price per inch, salt, event or push you set (a cap with no overage price leaves the visits in the queue at $0 with a warning). Inches count once per storm on its deepest depth; a second salting counts as a second salt application. The contract shows usage (for example 42 of 80 in used) and a stop whose cap is used up shows an Overage chip on the board.",
          },
          {
            step: "Snow invoicing",
            detail:
              "CRM > Accounting > Snow Invoicing groups a client's uninvoiced storm visits and computes the amount from the job's invoice type: a flat rate per event, a rate per inch of snowfall (per event or per push), or an hourly rate × actual hours logged. Make one snow job per service: Per Event/Per Inch and Per Push jobs price from their depth ranges and take one service (the service price isn't used), Hourly takes one service whose rate is the hourly rate, and Monthly Flat Rate bills only through a linked contract. A depth range can itself be billed Hourly (hourly rate × hours on site), usually as an all-inclusive top range. A job's Invoice Terms override the client's default terms, and a service can append the visit's clocked start-end times to its snow invoice line.",
          },
          {
            step: "Messaging clients about a storm",
            detail:
              "On the Snow Jobs board, tick the stops, then use Actions > Email Clients… or Text Clients… (also buttons on the selection bar; needs the Send Emails / Send Texts permission). A client with several stops gets one message. Pick a saved template to pre-fill it, edit freely, preview one recipient, then confirm: the dialog shows how many will receive it and who is skipped (no email or phone, bounced email, not opted in to texts, or a number that replied STOP). Storm messages are service notices, so Do Not Market clients still get them, but bounced addresses and text opt-outs are always respected. Every message is logged on the client's timeline. 'Jobs Without Emails…' lists selected (or shown) stops whose client has no usable email. Merge tags: [stormname], [stormdate], [snowservice], [snowcrew], [snowstatus], [snowarrival], [snowaddress], plus client/company tags. Save wording as a template in the dialog or in Documents (types 'Snow – Email' and 'Snow – Text Message'); the same templates can be used in an automation's Email or Text step (e.g. on visit dispatched or completed) for fixed messages that send on their own.",
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
            step: "Line descriptions and the invoice email button",
            detail:
              "An invoice line's Description is a multi-line box: Enter makes a new line, and starting a line with - or * and a space makes a bullet; line breaks and bullets print on the PDF. In the emailed invoice, a button or link to the invoice in the Invoice Email template stays where you placed it, drawn in the invoice template's color (company brand color if none). With no invoice link in the template, a View & Pay Invoice Online button is added at the bottom, never both. The send dialog's Preview tab shows the result.",
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
            step: "Viewing a sent email",
            detail:
              "CRM > Communication > Message Activity (Email tab) lists every email the app sent. Click a row (or an email on a client's Activity timeline) to open a read-only copy of what was delivered: recipients, subject and the full message. Only emails sent after this feature shipped have their content saved; older rows show the summary only.",
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
              "Field > Injury / Near Miss is a phone-friendly form based on your paper Employee's Report of Injury. Choose Injury, Illness or Near miss, then fill in who, when, what happened, the injury, and what could have prevented it. Submitting opens a new case. The same menu has a Damage Report form that opens a Damage Case.",
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
              "Not read-only: a client can pay invoices via Stripe (card or ACH), and can accept (with e-signature), decline, or request changes on estimates. Up to seven tabs are available — Home, Billing, Services, Estimates, Tickets, Documents, Account — and an org can hide Estimates, Tickets and Documents, plus Services when it hides both upcoming services and service history.",
          },
          {
            step: "What stays hidden, and sharing tickets",
            detail:
              "Draft invoices and unsent estimates never appear in the portal and can't be paid from it. Invoice and estimate PDFs are the real PDFs. Tickets the client submits show up automatically; for one you created, turn on 'Show in client portal' on the ticket (it needs a linked client) — the client sees only the subject, category, status and description, never comments, files or the assignee. Documents have separate View and Download buttons. The portal shows the last sent version of an estimate and refuses acceptance after its Valid until date.",
          },
          {
            step: "Configuring what's visible",
            detail:
              "Landscapt Settings > Client Portal controls the portal: logo (upload a PNG, JPG, WebP or GIF, or paste a URL), a Welcome Message shown under the greeting on Home (blank shows nothing), and which tabs are shown. Switches there let you email the portal Support Email on every new ticket (in addition to the sales rep), allow or block autopay and card management by clients, set Card and ACH max payment amounts for online payments, and hide upcoming services or service history.",
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
            step: "Add-on, the Field area, and what's hidden without it",
            detail:
              "Job Photos is a paid add-on (included on Growth and Enterprise and during a trial). Without it, the Job Photos link, the Photos tab on a client, the Job Photos link on a project and Photo Job search results are hidden, and opening a Job Photos page shows an add-on notice. The area itself is called Field: the Home 'Field' tile and the Field sidebar always show the field forms (Damage Report, Injury / Near Miss, Repair Request), which are not part of the add-on.",
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
        summary: "100+ pre-built reports across 13 sections, your own saved analyses, scheduled email delivery, ready-made and custom dashboards, and a customizable KPI Scorecard.",
        icon: BarChart3,
        steps: [
          {
            step: "Where it lives",
            detail:
              "Administration > Reports in the Landscapt sidebar. Seven tabs: Dashboard (the original built-in overview), Custom Dashboards, Report Center (the searchable catalog), My Reports (saved analyses — New Analysis builds one), Scheduled (emailed reports), Payroll (crew hours from Start Day / End Day, editable, exportable and lockable; admins and roles with View & Edit Payroll Report), and Graphics Library. The ready-made dashboards (KPI Scorecard, Company Report, Social Media and others) are under the Dashboards tile on the Home screen. Custom Dashboards (except the three built-in ones), My Reports, Scheduled and the Graphics Library need the Advanced Reporting add-on (included on Enterprise and during a trial, an add-on on Starter and Growth); everything else here is on every plan.",
          },
          {
            step: "Categories",
            detail:
              "Service Reports, Revenue, Client, Job Hours, Schedule Lists, Audits, Financial, Estimates, Job Costing, Lead, Receivables, Tickets, and Forms.",
          },
          {
            step: "Exporting",
            detail:
              "CSV, Excel, PDF, and Print are on every report; downloads end with the same Totals row as the screen. Results stop at 5,000 rows, with a banner saying so. Scheduled delivery emails a report as PDF or Excel once, daily, weekly or monthly at an hour on your company's clock: use Schedule on the Actual v. Budgeted Hours reports, or Schedule… on a saved analysis in My Reports (with an optional rolling date window). Creating or changing a schedule needs Manage Report Center plus permission to view that report.",
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
              "A deeper walkthrough — how a report gets its numbers, a worked example running the Production Rate Accuracy report end to end, time zone and revenue rules, custom analyses and dashboards, Payroll, the audit trail, scheduled delivery, and who can see what.",
            href: "/settings/support/report-center-guide",
            linkLabel: "Open the Report Center guide",
          },
          {
            step: "Reports reference",
            detail:
              "A description, available filters, and known gotchas for every pre-built report, organized by section — for researching a specific report rather than the Report Center itself.",
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
              "Each goods receipt adds a 'cost layer' (quantity + unit cost + date + PO reference) to the part/product record. A $0 layer (for example from stock returned while the part's catalog cost was still $0) is ignored by WAC and FIFO, and a Work Order return costed at $0 falls back to the part's catalog cost, so a pre-fill never comes up as $0 just because of one. Cost layers only affect the pre-fill on new lines — historical Requisition, PO, and Work Order line items keep whatever cost was recorded at the time and are never retroactively changed.",
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
              "Odometer and GPS-distance readings, converted to miles. A reading only updates if the new mileage is greater than or equal to the meter's current value. The daily sync writes nothing else to your meters. Live sensor data (fuel, battery, tires, fault codes, location) is read separately by the vehicle's Telematics tab.",
          },
          {
            step: "When it runs",
            detail:
              "A daily scheduled sync, plus a manual 'Sync Now' button for admins. There's no webhook — Samsara doesn't push data to Landscapt in real time.",
          },
          {
            step: "Telematics tab",
            detail:
              "Once Samsara is connected, each vehicle in Equipt > Vehicles gets a Telematics tab: engine state, battery, tire pressures, fuel, coolant, DEF level, location with address/speed/heading, and fuel and battery history over 7, 30 or 90 days (an hourly job records the samples). A stat the vehicle doesn't report shows 'Not reported'. If the tab is empty it says why: Samsara isn't connected, the vehicle isn't linked (set its Samsara Vehicle ID on the Details tab, or name it exactly as in Samsara), or no data has been pulled yet.",
          },
          {
            step: "Fault codes and work orders",
            detail:
              "The Fault Codes card lists current codes as Confirmed, Pending or Permanent. Pending codes are informational only and never raise work. For a confirmed or permanent code, click 'Create work order' (needs permission to edit work orders; clicking again for the same open code returns the existing work order), or build an Equipt automation with the 'Vehicle Fault Code' trigger, which fires once per new confirmed code and can be limited to when the check-engine light is on. The first hourly check after connecting only records existing codes without firing automations.",
          },
          {
            step: "Full guide",
            detail:
              "A deeper walkthrough — the full setup flow, exactly how vehicle matching and mileage validation work, the Telematics tab, and what to check if readings aren't updating.",
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
              "An exact name match links automatically (unless that customer is already linked to another client — a QuickBooks customer belongs to one client only, so the second client gets its own customer named with its account number, e.g. 'John Smith (acct #1042)'), no match creates a new QuickBooks customer, and similar-but-not-identical names ask you to choose: open the client, find the QuickBooks section, click Sync to QuickBooks and pick a match or 'None of these — create new'.",
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
        q: "I edited a line on an approved PO and it went back to Pending. Why?",
        a: "An approval only covers exactly what the approver saw. Any change to lines (item, quantity, price, taxable, project) or the vendor sends it back for approval, and approvals that no longer match are asked again.",
      },
      {
        q: "Add Part (or a PO line) pre-filled a $0 cost even though the part has a cost. Why?",
        a: "Stock returned while the catalog cost was $0 could leave a $0 cost layer that WAC and FIFO then averaged in. $0 layers are now ignored and the pre-fill falls back to the part's catalog unit cost, and a Work Order return costed at $0 also uses the catalog cost. Check that the part's Unit Cost is set; lines already saved keep the cost they recorded.",
      },
      {
        q: "My requisition was rejected. Do I keep the approvals I already had?",
        a: "No. After you fix it and submit again, the whole approval chain starts over.",
      },
      {
        q: "Why was my PO approved the moment I submitted it?",
        a: "It was made from an approved requisition and only buys what that requisition already approved: same items, no more quantity, no higher price, within its approved total. Add anything beyond that and it goes through the normal PO approval chain.",
      },
      {
        q: "How do I cancel a PO?",
        a: "Open it and click Cancel PO. That works only until something is received. After a delivery has been received, use Mark Complete to close it short.",
      },
      {
        q: "I deleted or canceled the PO I made from a requisition. Can I make a new one?",
        a: "Yes. When no open PO remains, the requisition goes back to Approved so you can convert it again.",
      },
      {
        q: "How do I finish a requisition I no longer need?",
        a: "Use Close Requisition on approved, ordered or rejected requisitions. No more POs can be made from it, and existing POs are unaffected.",
      },
      {
        q: "Why can't I delete a PO line or a goods receipt?",
        a: "Its units were already added to stock. Edit the goods receipt and set the received quantity to 0 first (that takes them back out of stock), then delete it. This stops the same delivery from being received twice.",
      },
      {
        q: "Why did an approval I expected to finish the PO add another approver?",
        a: "The lines or total changed while it was in approval. If the new total crosses a higher approval threshold, that approver is added before it can be approved.",
      },
      {
        q: "Can a discount make a PO total negative?",
        a: "No. A discount larger than the item subtotal is capped at the subtotal; tax and shipping still apply.",
      },
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
      {
        q: "Why did a PO or requisition total change when I saved it, or need approval again?",
        a: "Totals are calculated by the system from the line items, the tax rate, shipping and the discount, every time a line or the header changes. A total typed or saved some other way is replaced by the real one, and approval thresholds use that recalculated total, so a request can't slip under a threshold with a lower header total.",
      },
      {
        q: "How does a PO discount affect sales tax when some lines aren't taxable?",
        a: "With 'discount reduces tax' on, the discount is spread across taxable and non-taxable lines by their share of the subtotal, and only the taxable share lowers the taxed amount. Example: $100 taxable + $900 non-taxable with a $100 discount takes $10 off the taxable part, so tax is charged on $90.",
      },
      {
        q: "Why can't I receive more than was ordered on a PO line?",
        a: "A PO line can't receive more in total, across all its receipts, than its ordered quantity. This also stops a double-clicked or second-tab receipt from counting twice. If more arrived than ordered, raise the line's ordered quantity first (or add a line), then receive.",
      },
      {
        q: "Why did my PO's status change after I edited a receipt?",
        a: "A PO's status (Ordered, Partially Fulfilled, Completed) is worked out from its receipts. Editing or deleting a receipt, or changing a line's ordered quantity, recalculates it. For example, correcting a receipt from 10 to 8 on a completed PO moves it back to Partially Fulfilled, so the last 2 can be received.",
      },
    ],
  },
  {
    label: "Maintenance & Work Orders",
    items: [
      {
        q: "Does a PO status automation fire when changing the vendor sends a PO back for approval?",
        a: "Yes. When a vendor change on an approved PO sends it back to Pending Approval, your Purchase Order Status Changed rules for Pending Approval run, once for that change, just as when you submit it yourself.",
      },
      {
        q: "My PM Due automation fired once and then never again. Why?",
        a: "That's fixed. PM Due automations now fire once for each PM schedule each time it comes due, naming that schedule's asset, so one overdue schedule no longer silences the alert for the others. The same schedule fires again once its next due date moves on. Work Order Overdue automations fire once for each overdue work order.",
      },
      {
        q: "My \"PO Approved\" automation never runs. Why?",
        a: "Approving a PO through its approval chain didn't trigger it before; now it does. Purchase Order Status Changed fires when a PO is approved, rejected or submitted for approval, once per change. It offers the real PO statuses: Requested, Pending Approval, Approved, Rejected, Ordered, Partially Fulfilled, Completed and Canceled. Older rules saved as Closed now mean Completed.",
      },
      {
        q: "Where did the Urgent priority go on automation work orders?",
        a: "Work orders and maintenance requests use Low, Medium, High and Critical. Automations saved with Urgent now create Critical work orders. Urgent was never a valid priority, so those automations couldn't create anything before.",
      },
      {
        q: "Why does my Send Email automation action need an email address?",
        a: "The mail service can only deliver to a real address, so the recipient must be one. You can also add a message. If the mail service rejects the address, the failure is logged once instead of retried every 15 minutes.",
      },
      {
        q: "Do Equipt automations run on the Starter plan?",
        a: "No. Equipt's automations (meter readings, low stock, PM due and work order overdue) pause on the Starter plan, which includes Landscapt only. They resume once the plan includes Equipt.",
      },
      {
        q: "What happens to the parts when I delete a work order?",
        a: "For an Open, On Hold, In Progress or Skipped work order, the parts it took from stock go back on hand automatically. For a Done work order you're asked whether the parts went back on the shelf: answer Yes to return them, or No to keep them counted as used.",
      },
      {
        q: "Why is the Delete button greyed out on a completed work order?",
        a: "It stays disabled until you answer \"Did the parts go back on the shelf?\", so stock is never changed by accident.",
      },
      {
        q: "Does deleting a work order delete its sub work orders?",
        a: "Yes. Every sub work order under it is deleted too, and the parts question covers any of them that are Done.",
      },
      {
        q: "Can a crew login see work orders or parts in Equipt?",
        a: "No. A crew login can only file repair requests from the field page. It sees your active asset and vehicle names to pick from, and the requests it filed itself.",
      },
      {
        q: "Can a crew change the status of its repair request?",
        a: "No. A crew's request always starts as Open, and the crew can only edit its own request while it's still Open.",
      },
      {
        q: "Why can't my Requestor see work order costs or purchase orders?",
        a: "Requestors don't see Equipt costs: work-order parts, labor and vendor charges, part costs, purchase orders and receiving are hidden from them. Viewers and Purchasers still see costs.",
      },
      {
        q: "The part history says \"used 2 on WO-… (3 short)\". What does that mean?",
        a: "The work order asked for 5 but only 2 were on hand. Stock stopped at 0, and the 3 short units are taken from the next delivery.",
      },
      {
        q: "What's the difference between \"Shelf count\" and \"Found / correction\" when I adjust a part's quantity?",
        a: "Choose Shelf count when you physically counted the part. Work orders that used it while it was out of stock are marked settled, so the next delivery won't deduct those parts again. Choose Found / correction when you found extra stock or are fixing a typo; work orders still waiting on the part are covered by the next delivery.",
      },
      {
        q: "Why did my quantity adjustment say \"Stock changed since you opened this — refresh\"?",
        a: "A delivery or a work order changed the part's stock while you had it open. The current number reloads; check it and adjust again.",
      },
      {
        q: "Do parts that aren't tracked as inventory get deducted when used on a work order?",
        a: "No. They can be added for costing, but they never move stock, never show as short or \"used before received\", and never raise Low Stock alerts.",
      },
      {
        q: "Why didn't I get a Low Stock alert for a part at 0?",
        a: "Low Stock (bell and email) only covers parts tracked as inventory with a minimum stock above 0.",
      },
      {
        q: "Do I have to close the master work order of a multi-asset PM batch?",
        a: "No. It completes itself when the last asset's work order is done or skipped, and it is marked Skipped if every asset was skipped.",
      },
      {
        q: "Can I skip a PM or recurring work order?",
        a: "Yes. Single-asset PM work orders and recurring work orders can be skipped. A skipped recurring work order still schedules the next one.",
      },
      {
        q: "Why can't crew members generate PM work orders?",
        a: "Generating is limited to admins, managers and technicians. Crew can work the generated work orders.",
      },
      {
        q: "What price do parts get on work orders generated from a PM schedule?",
        a: "The part's current cost under your costing method on the day they are generated, the same as adding the part by hand. The template's saved cost is not used.",
      },
      {
        q: "What cost do parts go back to stock at when I remove them from a work order?",
        a: "The cost the work order line was charged, not today's price.",
      },
      {
        q: "Why don't skipped work orders show as open or overdue?",
        a: "Skipped means closed. Open means Open, In Progress or On Hold, and overdue means open and past due on your organization's calendar.",
      },
      {
        q: "What completion date does an imported Done work order get?",
        a: "Its completedAt column if the file has one, else its created date, else its due date — not the day of the import.",
      },
      {
        q: "Which month does a repair cost count in?",
        a: "The month it was recorded, in your organization's timezone.",
      },
      {
        q: "Why did a PM work order skip a number?",
        a: "If the next number was already used (for example by a work order numbered by hand), generation moves on to the next free number.",
      },
      {
        q: "Who is shown as \"Submitted By\" on a maintenance request I create in the app?",
        a: "You. The request is credited to whoever is signed in when it's created.",
      },
      {
        q: "Can a Requestor or Purchaser edit or delete a maintenance request?",
        a: "Only their own, and only while it's still Open. They can change the title, description, priority and asset or vehicle. Once someone starts reviewing it, it's locked for them; status changes and converting to a work order are handled by admins, managers and technicians.",
      },
      {
        q: "Why did I get \"This request changed — refresh and try again\"?",
        a: "Someone else changed the request's status after you opened it. Nothing was saved; refresh to see the current status. A request that's already linked to a work order keeps its status.",
      },
      {
        q: "If someone picks a vehicle on the public request form or the field repair page, is it linked?",
        a: "Yes. Picking an asset or a vehicle links the request to it, and converting the request attaches that asset or vehicle to the work order.",
      },
      {
        q: "What happens to open maintenance requests when an asset or vehicle is deleted, disposed or sold?",
        a: "They're closed as Rejected automatically, with a note in the description, and they no longer count as missed PMs in PM compliance.",
      },
      {
        q: "Can I log a meter reading with a future date?",
        a: "No. Readings can be dated today or earlier, using your company's calendar day (the organization time zone in Settings).",
      },
      {
        q: "Does editing a meter's value directly run my meter automations?",
        a: "Yes. A direct value edit, a new meter's starting value and a normal reading all run your meter automations right away.",
      },
      {
        q: "How does the Samsara sync label the meter it creates?",
        a: "As a Samsara meter named \"Odometer\" that carries the vehicle's name. Renaming the vehicle (or an asset) updates its meters' names too.",
      },
      {
        q: "What's the difference between a Work Order and a Maintenance Request?",
        a: "A Work Order is a direct maintenance task — created by Staff, Managers, or Admins and immediately actionable. A Maintenance Request goes through an approval flow before becoming a Work Order. Requestors can only submit requests (and edit or delete their own while it's still Open).",
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
      {
        q: "A part is on both a PM schedule's Parts tab and an asset's parts. Will the work order get it twice?",
        a: "No. When the PM generates a work order, the same part from the schedule and from the asset is combined into one row with the quantities added together. A part can only be listed once per schedule and once per asset.",
      },
      {
        q: "Does adding a part to a skipped work order take it out of stock?",
        a: "No. While a work order is Skipped, its parts don't take stock. If you reopen it, the parts are taken out of stock then.",
      },
    ],
  },
  {
    label: "Landscapt (CRM)",
    items: [
      {
        q: "Can an automation remind clients a few days before their visit?",
        a: "Yes. Use the Visit is coming up trigger and type how many days before the visit it should fire (1 when left blank). Every morning, around 9 to 10am Eastern, it starts the sequence for clients with a scheduled or dispatched visit that many days out on your company's calendar. It runs once per client per service day, the service filter matches any service that day, and [visitdate] / [visitservices] name that day. A cancelled, skipped or moved visit stops the run before its next step.",
      },
      {
        q: "Can one sequence send a reminder a week before and again the day before a visit?",
        a: "Use two sequences: one on Visit is coming up set to 7 days, one set to 1 day. A single sequence runs once per client per service day for that trigger, so a second Visit is coming up trigger on the same sequence wouldn't start it again for the same day.",
      },
      {
        q: "Do the \"days past due\" automation conditions use my time zone?",
        a: "Yes. Days invoice is past due, Days since invoice was paid and Days ticket is past due count whole days between the date and today on your company's calendar, so a rule checked at 9pm counts the same as one checked that morning.",
      },
      {
        q: "My imported estimates are in Sent. Will the estimate reminders pick them up?",
        a: "Yes. An estimate imported already in Sent, Accepted or Invoiced counts as sent on its estimate date, so Estimate expiring and No response from client can pick it up like an estimate you emailed.",
      },
      {
        q: "I marked an estimate as Sent by hand. Will my \"Estimate was sent\" automation run?",
        a: "Yes. Estimate was sent fires the first time an estimate moves into Sent, however it gets there: emailing it, copying its proposal link, or changing its stage to Sent (stage picker, drag or bulk change). That first move also records the sent date that No response from client counts from. Sending it again later doesn't restart the sequence.",
      },
      {
        q: "When does \"Invoice created\" fire?",
        a: "When the invoice is issued, meaning it gets its invoice number: Save Invoice, Send, Print, emailing it, or any invoice Landscapt creates for you (completed visits, contract billing, snow, milestones, merged invoices). It fires once per invoice. Opening the New Invoice screen doesn't fire it, and imported invoices never do. Invoices Landscapt creates on its own start their automation within 15 minutes.",
      },
      {
        q: "Does \"Invoice sent\" fire if I print or mail the invoice?",
        a: "Yes. Invoice sent fires once per invoice the first time it leaves draft: emailed, printed or marked as Sent. Re-emailing the same invoice doesn't fire it again.",
      },
      {
        q: "A client paid with account credit. Does \"Invoice paid\" still run?",
        a: "Yes. Invoice paid fires however the invoice is paid off: a payment entered in the office, a card or bank payment online or through autopay, account credit that covers the balance, or a line edit that leaves nothing owing. When a parent account's check pays a sub-account's invoice, the sub-account is the one enrolled.",
      },
      {
        q: "Will a client get a past-due reminder while their bank payment is still clearing?",
        a: "No. Invoice past due skips an invoice while a bank (ACH) payment for it is in progress, and a past-due sequence that's already running stops at its next step. It also stops if you move the due date out or the client's unused credit covers the invoice.",
      },
      {
        q: "My client mistyped their card on the payment page. Did they get a \"card failed\" email?",
        a: "No. Credit card charge failed only fires when a charge the customer wasn't there for fails: autopay, or the office charging the card on file. It runs once per invoice, so its email can include [invoicenumber] and [paymentlink].",
      },
      {
        q: "My \"Visit completed\" email goes out later than the first visit at a stop. Why?",
        a: "Visit completed waits until the client's whole day is finished: no scheduled, dispatched or in-progress visit left for them that day. That way the email, and the chemical Notice of Treatment, cover every service and product from the stop. Completing, skipping, cancelling or moving the last open visit finishes the day.",
      },
      {
        q: "How do I send a day-before visit reminder?",
        a: "Make an automation on the Visit is coming up trigger, set to 1 day before, with a text or email step that uses [visitdate] and [visitservices], for example \"Your [visitservices] is scheduled for [visitdate].\" It's checked every morning (about 9 to 10am Eastern) for the next day's scheduled and dispatched visits. Each client gets one message for all their visits that day, and if the visit is cancelled or moved before the message goes out, the run stops. If you'd rather the reminder go out when you press Dispatch day for tomorrow, use the Visit was dispatched trigger instead.",
      },
      {
        q: "What's the difference between [servicedate] and [visitdate]?",
        a: "In a visit-triggered sequence, [visitdate] and [visitservices] always describe the day the run is about; [servicename], [servicedate] and [chemicalnotice] now do too. [nextservicename] and [nextservicedate] still show the client's next upcoming visit, which may be a different one, so use [visitdate] for reminders.",
      },
      {
        q: "A crew got rained out. Will clients still get the \"crew coming tomorrow\" text?",
        a: "No. A visit-triggered run stops at its next step when the client has no visit left on that day: everything was cancelled, skipped, deleted or moved.",
      },
      {
        q: "The client asked for changes on the proposal. Will they still get \"we haven't heard from you\"?",
        a: "No. Estimate sent, No response and Estimate expiring runs stop as soon as the client has an open change request on the proposal page.",
      },
      {
        q: "A returning lead filled out our web form again but got no reply. Why?",
        a: "That's fixed: Form submitted now runs once per submission, not once per client. Contract created, Contract signed, Contract about to expire (once per contract term), Damage case created and Credit card about to expire (once per card) also run once per record, so next year's contract renewal reminder goes out too.",
      },
      {
        q: "With Allow Re-Entry on, my estimate reminder used to repeat every other day. Is that fixed?",
        a: "Yes. Re-entry is counted from when the earlier run started, so a 1-day delay means once a day. For date-based triggers (No response, Estimate expiring, Meeting is coming up, card or contract expiring), re-entry only starts a new run when the date itself changes, such as a re-sent estimate, a rescheduled meeting, a new card or a renewed contract.",
      },
      {
        q: "What is the \"Re-subscribed to emails\" trigger?",
        a: "It replaces \"Has opted in for emails\". It fires when a client's Do Not Market is turned off, on the client record or through the API. Has opted in for texts fires when text consent is newly given: a client replying START, the consent box on a web form, the office ticking it, or the API.",
      },
      {
        q: "Do marketing automations text clients who unsubscribed?",
        a: "No. A client marked Do Not Market doesn't get texts from marketing-type sequences (ones with Marketing, General or Follow-up emails). Service sequences, such as text-only reminders or ones whose emails are Transactional or Reminder, still text them.",
      },
      {
        q: "My Zap didn't fire when a sales rep created a lead. Why?",
        a: "Zapier events used to be skipped when the person making the change wasn't an admin. They now go out no matter who makes the change, including office users, sales reps and bulk actions.",
      },
      {
        q: "An automation step adds a tag. Why didn't my \"Tag added\" automation run?",
        a: "By design, automation steps never start other automations. A Tags step or an Update a field step doesn't fire Tag added or Client source updated, so automations can't set each other off in a loop. Add the follow-up steps to the same sequence instead.",
      },
      {
        q: "What time do date-based automations send?",
        a: "Past-due, expiring-estimate, no-response, card-expiry and contract-expiry automations are checked once a day around 9 to 10am Eastern, so their first emails no longer go out overnight. Email steps with a send window and texts (8am to 9pm in your time zone) still follow those rules.",
      },
      {
        q: "A client had three visits completed on the same day. Why did my \"Visit completed\" automation only send one email?",
        a: "Visit triggers run once per client per service day. Every visit that client has that day, across services, crews and properties, shares one run, so they get one message instead of three. A visit on another day starts a new run. Visit completed also waits for the client's day to be finished (no scheduled, dispatched or in-progress visit left that day), so the email goes out once the last visit is completed, skipped, cancelled or moved, and it names every service done that day.",
      },
      {
        q: "Will a weekly mow follow-up automation send every week?",
        a: "Yes. Visit triggers are scoped to the service day, so each week's visit starts its own run. Only the same client on the same day is held to one run.",
      },
      {
        q: "How often does a \"Job created\" or \"Package renewed\" automation run for a client with several jobs?",
        a: "Once per job for each trigger. Job created, Job cancelled, Package created and Package renewed each run for every job separately, so two new jobs for the same client each get their own run. A sequence started by both Job created and Job cancelled still runs for the cancellation while the creation run is going.",
      },
      {
        q: "What does Allow Re-Entry do on an automation sequence?",
        a: "It lets the same service day, record (estimate, invoice, ticket, meeting or job) or client start the sequence again once its earlier run has finished and the re-entry delay has passed. A run that is still going is never started twice. Without it, each day, record or client runs the sequence once.",
      },
      {
        q: "Do Landscapt automations, recurring visits and contract invoices keep running on the Equipt plan?",
        a: "No. On the Equipt plan (Equipt only), Landscapt's background work is paused: recurring visits aren't generated, contract invoices aren't created, past-due and expiry reminders and scheduled campaigns aren't sent, QuickBooks invoice sync stops and automation steps wait. Upgrading to a plan with Landscapt resumes it from that day; skipped days aren't made up.",
      },
      {
        q: "Can I create crew logins on the Equipt plan?",
        a: "No. Crew logins are part of Landscapt, so Create Crew Account is refused on the Equipt plan with a note to upgrade.",
      },
      {
        q: "Can a crew login see product costs, prices or stock levels?",
        a: "No. The product catalog is office-only: unit cost, sale price and stock on hand are never available to a crew login, in the app, in Request Materials or on a crew-visible dashboard. The crew sees the product names, quantities and label details a stop needs.",
      },
      {
        q: "Can a crew login see our service rates?",
        a: "No. Default rates, costs, target rates and rate matrices stay with the office. The crew app only gets the service names on its stops and the services you ticked for Show in field upsells. A service's price on a stop shows only while Hide pricing from crews is off.",
      },
      {
        q: "With Hide pricing from crews on, is the visit price still on the crew's tablet somewhere?",
        a: "No. With the setting on, a visit's price is never sent to crew devices at all, so it can't be recovered from a shared tablet.",
      },
      {
        q: "Can a crew login see other crews' times?",
        a: "No. A crew login sees only its own crew's job punches. Other crews' times stay with the office.",
      },
      {
        q: "Can a crew edit a visit's date, crew or status outside the crew app's buttons?",
        a: "No. A crew changes its visits only through the crew app: Start Job, breaks, Stop Job, Skip, acknowledging notes and completion notes. Anything else on a visit is refused for a crew login.",
      },
      {
        q: "Can a crew fix its own drive times?",
        a: "No. Start Drive and End Drive record drive time; correcting a drive time after the fact is done by the office.",
      },
      {
        q: "My crew tapped several buttons with no signal. Do they reach the office in the right order?",
        a: "Yes. Crew-app taps are sent one at a time in the order they were tapped, both while online and when signal comes back, so Start Day lands before the first Start Job and a pause before its resume.",
      },
      {
        q: "The Payroll report says \"Started at first job\" but the crew did tap Start Day earlier. What happened?",
        a: "Start Day takes the earlier time when its tap reaches the office after the first Start Job (for example both were tapped with no signal). The day's start is moved back to the Start Day tap and the flag goes away. If the flag stays, the crew never tapped Start Day; correct the start in Payroll.",
      },
      {
        q: "One service on a stop wouldn't stop. Were the other services invoiced?",
        a: "Yes. If one service on a stop can't finish at Stop Job (unconfirmed chemicals, a locked payroll day), the crew is told why, but the services that did finish are still completed, invoiced and costed. Fix the one that failed and tap Stop Job again.",
      },
      {
        q: "Does Stop Job change each service's crew size?",
        a: "No. Each service keeps its own men count, so a three-man mow and a one-man bed edge on the same stop are costed as three and one. Stop Job only fills in a service that has no crew size.",
      },
      {
        q: "A crew started yesterday's leftover stop after midnight. Which roster is clocked in?",
        a: "That day's roster, the same people Start Day uses that day, not the roster of the day the stop was originally scheduled.",
      },
      {
        q: "Why does Payroll say someone is \"Not linked to an employee\"?",
        a: "That crew roster entry has no employee record attached, so it is paid as its own person and its hours can't combine with the same worker's hours on another crew for overtime. Pick the employee for it under Team → Crews.",
      },
      {
        q: "Can I change a payment's amount or an invoice's paid balance through the API?",
        a: "No. Amounts, refunds, online-payment details, how a payment is applied, and an invoice's paid amount, balance and Paid / Partial status change only through Enter / Edit Payment, Apply Credit, Refund and the invoice editor. Direct writes are refused, even for admins, so balances always match the payments behind them.",
      },
      {
        q: "Which payments can be deleted?",
        a: "Only an unapplied manual payment: nothing applied, nothing refunded and not taken online. It needs Delete Card Payments or Delete ACH Payments. Anything else is edited or refunded instead.",
      },
      {
        q: "I changed a contract from quarterly to monthly after it had billed. When does monthly billing start?",
        a: "After the period already billed runs out. The quarter already invoiced is used up first, then the first monthly cycle starts on the next billing day, so nothing is billed twice and no month is skipped. The contract dialog shows the end of the billed period and the new first cycle before you save.",
      },
      {
        q: "I edited the start date of a weekly contract that's already billing. Will the billing day move?",
        a: "No. Once a weekly or every-2-weeks contract has billed, its cycle is fixed to the day it started billing on, so a new start date doesn't slide the cycle or bill days already invoiced.",
      },
      {
        q: "A parent account has credit. Why are its sub-accounts still getting past-due reminders?",
        a: "A parent's credit isn't spent on a sub-account's invoices automatically, so it doesn't mark them as covered. Only the invoice's own account's credit (and a deposit on its estimate) counts. Apply the parent's credit to those invoices yourself if that's what you want.",
      },
      {
        q: "Can one credit make two invoices look covered?",
        a: "No. Credit is counted toward one invoice at a time, oldest due first, so a single $200 credit covers one $200 invoice, not two.",
      },
      {
        q: "Can I duplicate a voided contract invoice on the same day it was dated?",
        a: "Yes. A void invoice doesn't count against the contract's one-invoice-per-date rule, so Duplicate as draft works the same day. Voiding still never makes the contract bill that period again on its own.",
      },
      {
        q: "How do refunds show on an account statement?",
        a: "The payment shows at its full amount on the day it was paid, and each refund appears as its own Refund row on the day it was refunded, adding back to the balance. A statement for a period before the refund shows the payment as it was then.",
      },
      {
        q: "Can a property manager file a portal ticket for one of their properties?",
        a: "Yes. A parent account signed in to the portal can file a ticket for any of its sub-accounts as well as its own account, and the ticket lands on the account they pick.",
      },
      {
        q: "Do files attached to an estimate carry over when I convert it to a job?",
        a: "Yes. The estimate's photos and the files attached to it are copied onto the new job's Files tab, marked \"Transferred from estimate\", so the crew sees the estimator's site photos. The originals stay on the estimate. If a copy fails you're told, and the job is still created.",
      },
      {
        q: "I clicked Return to Waiting List on a stop two crews share. What happens to the other crew?",
        a: "Both crews' visits go back together, so the job reappears on the Waiting List as one waiting job. It's refused if any crew on the stop has already clocked in.",
      },
      {
        q: "I renamed a schedule and got an error. Did my jobs move?",
        a: "No. Renaming a schedule moves every job on it in the same step. If any job couldn't be moved, for example one you don't have permission to change, nothing is renamed and the message says why.",
      },
      {
        q: "An old dispatch saved view had a city typed in. Does it still filter?",
        a: "Yes. Typed City or Zip text from an older view keeps filtering the board by that text (any city or zip containing it). Picking from the City or Zip checklist replaces it with an exact list.",
      },
      {
        q: "Why can't I add a maintenance part as a job material?",
        a: "Maintenance parts are Equipt inventory and their stock comes from Parts Inventory. Use a Stocked or Project Material on Landscapt jobs.",
      },
      {
        q: "We put two trucks on a lot during a storm billed by the hour. Do both bill?",
        a: "Yes. Whenever a stop is billed by time (Hourly snow jobs, or Per Push / Per Event Per Inch jobs whose depth falls in an hourly range), every crew bills its own hours on site.",
      },
      {
        q: "A crew went back after I'd already invoiced the storm. How do I bill the extra time?",
        a: "On a Per Event, Per Inch storm in an hourly range, the return trip shows up in Snow Invoicing tagged \"Additional hours\", priced on its own hours only. Generate it like any other row. Hours already on the first invoice are never offered again.",
      },
      {
        q: "Two crews tapped \"Add another push\" at the same time. Did we get two pushes?",
        a: "No. Only one push can be open per stop. The second tablet is told a push is already open and it's on their list.",
      },
      {
        q: "I lowered a service's Visits limit but the extra visits are still on the schedule.",
        a: "When you save a lower limit, Landscapt shows how many visits are over it and offers to remove the newest ones nobody has started, dispatched or invoiced. If you keep them, they stay scheduled and bill when completed, so skip or delete them on the Visits tab.",
      },
      {
        q: "Why does a hidden invoice line say \"Rolls into\"?",
        a: "A hidden line's amount prints inside another visible line, normally the one above it. The note names that line so you can check it after reordering or merging invoices.",
      },
      {
        q: "We use QuickBooks. Will customers see lines I hid?",
        a: "QuickBooks still receives every line, hidden ones included. When you hide lines, send the invoice from Landscapt (email, print or the online invoice), not from QuickBooks.",
      },
      {
        q: "I deleted the invoice template an invoice was set to use. What prints now?",
        a: "The company's default invoice template.",
      },
      {
        q: "My crew's tablet lost signal and the screen said part of the page couldn't load. Should they reload?",
        a: "No. Their queued taps are kept on the open page. Tap Try again once there's signal; the app won't reload itself while offline or while taps are waiting.",
      },
      {
        q: "Our snow automation message showed the wrong property's address.",
        a: "Automations started by a visit event use that exact stop for the snow tags. Other triggers use the client's most recent storm stop.",
      },
      {
        q: "Why can't I mark an estimate Accepted, convert it or invoice it?",
        a: "It needs approval first: it's waiting, was rejected, grew past the approved amount, or hasn't been submitted. Click Send to submit it. An admin or the approver can go ahead. An estimate that's already Accepted isn't held back.",
      },
      {
        q: "My client says they can't accept the proposal and it says it's \"being reviewed\".",
        a: "The estimate changed after it was approved, or it still needs internal approval. Get it approved and send it again.",
      },
      {
        q: "Why can't I change the discount or tax rate on this estimate?",
        a: "Part of it is already on a job. Changing it would re-split the price between jobs already created and ones still to come. Change the price on the job instead.",
      },
      {
        q: "Does the customer's deposit come off their invoice automatically?",
        a: "Yes. When an invoice for that estimate is issued (sent, printed or emailed), the deposit is applied to it automatically, up to what the invoice owes. Any leftover stays reserved for the estimate's next invoice.",
      },
      {
        q: "What does \"Credit available\" on an invoice mean?",
        a: "The client has unapplied money, such as a prepayment or overpayment, that could pay it. It isn't subtracted until you click Apply to this invoice. Only the invoice's own account's credit counts (plus a deposit taken on its estimate), never a parent account's. Invoices fully covered by credit don't get past-due reminders.",
      },
      {
        q: "Why won't these two invoices merge?",
        a: "They use different tax rates, and a merge taxes everything at the kept invoice's rate. Set both to the same rate first.",
      },
      {
        q: "How is tax calculated when an invoice has a discount and some lines aren't taxable?",
        a: "The discount is split between taxable and non-taxable lines by their share of the subtotal, and tax is charged on the taxable share that's left. Invoices issued before this change keep their original figures.",
      },
      {
        q: "Why does my estimate show \"—\" for margin and say \"Set your breakeven rate\"?",
        a: "There's no cost on it yet. Set your Break-Even Labor Rate in Settings → Organization, or enter line costs, to see a real margin.",
      },
      {
        q: "I duplicated a voided invoice. Are hidden lines still hidden?",
        a: "Yes. Lines hidden on print stay hidden on the new draft.",
      },
      {
        q: "Why is the labor cost column blank in my Job Visits report?",
        a: "Labor cost is shown only to admins and roles with Job Costing, Job Cost Summary, Cost of Goods Sold, Show Wage & Labor Burden, or a Profit & Loss report permission.",
      },
      {
        q: "Can someone see a crew member's pay rate from the reports?",
        a: "No. Reports only use a crew's average labor rate, and only for people allowed to see labor cost. Crew logins never see pay, labor cost, product costs or service rates in reports.",
      },
      {
        q: "Can anyone read a job's or visit's labor cost outside the reports?",
        a: "No. The labor cost stored on each job and visit can't be read directly by any login, admins included, because for a one-person crew it would reveal that person's pay rate. Labor cost appears only in the costing reports and the job's Job Costing tab, for admins and roles with a costing or wage permission.",
      },
      {
        q: "Why did my January cash total stay the same after I refunded a January payment in March?",
        a: "Cash reports subtract a refund on the day it was issued, so it shows in March and January stays as it was.",
      },
      {
        q: "Do card processing fees come back off when I refund a card payment?",
        a: "Yes. The refund's share of the fee shows as a negative row on the Credit Card Processing Fees report, and P&L Cash lists fees net of refunds.",
      },
      {
        q: "How do I set the goal on a dashboard gauge?",
        a: "The first time you open a built-in gauge it asks for your goal. Type it (in dollars for revenue) and click Save goal; use Edit goal to change it later. Admins and Manage Report Center roles can set goals on any plan.",
      },
      {
        q: "My export says \"Partial: first 5,000 of …\" and has no totals. Why?",
        a: "Reports return at most 5,000 rows, and a total of only those rows would be wrong. Narrow the date range or filters to get the full result.",
      },
      {
        q: "Someone works on two crews. Will Payroll count their overtime correctly?",
        a: "Yes, as long as each crew's roster entry is linked to their employee record. Overtime limits are per person, so hours on every crew count together, and the person is listed once. A roster entry with no linked employee is counted on its own; Payroll names those people in an amber note so you can link them under Team → Crews.",
      },
      {
        q: "Can crew logins see the change history?",
        a: "No. Crew logins can't read audit trails or audit reports. Office users see the company-wide history.",
      },
      {
        q: "Why is the payment link blank in my automation email?",
        a: "The invoice is still a draft. Drafts can't be viewed or paid online, so [viewinvoiceonline] and [paymentlink] stay blank until the invoice is sent or printed.",
      },
      {
        q: "Where do I see the content of an email that was sent to a client?",
        a: "Go to Communication > Email Activity (you need the Email Activity view permission). Click the email's subject to open a read-only view showing the recipients, subject and the message exactly as it was delivered. Very old entries may show only a one-line summary if the sent message wasn't kept. Invoice emails can also be resent from the list.",
      },
      {
        q: "What do Delivered, Bounced, Failed and Pending mean on Email Activity?",
        a: "The Delivery column shows Yes (confirmed delivered), Bounced (the mail server rejected it; hover the badge for the reason when one was reported), Failed (the email could not be sent and no further reason is recorded) or Pending (no delivery confirmation yet). The filter buttons above the list are All, Delivered, Not Delivered, Failed, Bounced and Pending; Not Delivered covers Bounced and Failed (a Pending email is still in flight, so it is not counted as not delivered).",
      },
      {
        q: "What can a crew login see about our clients?",
        a: "Only the clients on that crew's own stops: name, phone, address, gate code and property notes. Crews don't see client contacts, the client Files tab, or the client timeline — only the notes, skip reasons and upsell suggestions the crew itself sent. Invoices, payments, emails and office notes on the timeline stay with the office.",
      },
      {
        q: "Can a crew edit client details or timeline entries?",
        a: "No. Crews can add notes, skip reasons and upsell suggestions to the timeline of clients on their stops, but they can't edit or delete entries, change contacts or properties, or create clients.",
      },
      {
        q: "Why doesn't my draft invoice PDF have a \"View & Pay Online\" link?",
        a: "Drafts aren't issued yet, so previews have no online link. Printing or emailing the invoice issues it, and those copies include the link.",
      },
      {
        q: "What's the difference between Preview and Download PDF on an invoice?",
        a: "Preview opens the invoice as a PDF in a new tab without printing, locking or changing its status; save first to see your latest edits. Download PDF, in the actions menu, saves the file to your computer instead.",
      },
      {
        q: "How does a consolidated invoice for a property manager print?",
        a: "The parent's own lines print first, then the lines from each sub-account under a header with that sub-account's name. The '[Sub-account name]' prefix you see on the lines while editing is removed on the PDF, since the header says it. The stored lines and totals don't change.",
      },
      {
        q: "Can I filter the Invoices list by client tag?",
        a: "Yes. Once any of your clients has a tag, a Tags filter appears with the other filters above the Invoices list. Pick one or more tags to see only invoices whose client has at least one of them.",
      },
      {
        q: "Does marking an invoice Sent or Printed lock it?",
        a: "Yes. Setting an invoice to Sent or Printed by hand freezes its amounts the same way emailing or printing it does, so it can't be edited until you click Unlock. A locked invoice can't be deleted until it is unlocked, but it can still be voided.",
      },
      {
        q: "Can my team leave comments on an invoice?",
        a: "Yes. Open the invoice and click the Comments tab next to Photos and Audit Trail. Type a note and @mention a teammate to notify them; the notification opens the invoice. Comments are for your team.",
      },
      {
        q: "How do I export only some invoices or payments to a spreadsheet?",
        a: "On Accounting > Invoices or Accounting > Payments, tick the rows you want, then choose Actions > Export Selected (CSV) or Export Selected (Excel). The file has just those rows in the order the table shows them, with money columns as plain numbers so Excel can total them. Invoices export number, client, description, status, dates, terms, PO #, subtotal, discount, tax, total, paid and balance. Payments export date, client, amount, unused, refunded, method, reference, memo and invoice number.",
      },
      {
        q: "Can I sort the Payments and Estimates lists, and what happens when I click a name?",
        a: "Yes. Click any column header on the Payments or Estimates list to sort by it, and click again to reverse. Without a sort, both lists show newest first. On the Invoices, Estimates, Payments, Jobs, Waiting List, Tickets, Contracts and dispatch board tables, clicking the empty space in the name cell opens the record. Only clicking the client's name itself opens the client.",
      },
      {
        q: "A client opened an invoice link and saw \"not found\". Why?",
        a: "The invoice is still a draft. The link starts working once the invoice is sent or printed.",
      },
      {
        q: "Can visitors see my form's tag rules?",
        a: "No. The public form only receives page-jump and show/hide rules; tags are applied on our server when the form is submitted.",
      },
      {
        q: "I linked a job to a contract that isn't signed yet. Why aren't its visits being invoiced?",
        a: "Visits on a Draft or Sent contract are held. Once you sign the contract, it covers them. If you cancel it without signing, they're billed per visit right away.",
      },
      {
        q: "I signed a contract months after its start date. Will the earlier months be billed?",
        a: "When you mark it Signed, Landscapt lists every month (or cycle) it hasn't billed since the start date. You can bill them all now on invoices dated today, bill only the current one, or start with the next cycle.",
      },
      {
        q: "What happens to billing when I make a contract inactive and then active again?",
        a: "While it's inactive, its visits bill per visit. When you make it active again, contract billing starts with the next cycle; the current cycle isn't billed again, and visits until then keep billing per visit.",
      },
      {
        q: "I cancelled a contract that bills a month in advance. What about next month's invoice?",
        a: "The cancel window lists any draft invoices dated after today. Leave them ticked to void them as the contract is cancelled.",
      },
      {
        q: "Are materials on a contract job included in the contract price?",
        a: "Each product has an \"In contract\" checkbox, on by default. When it's ticked, only the amount used above what was planned is billed (10 yards planned, 15 used bills 5). Untick it to bill the full amount. Materials bill when the visit is completed.",
      },
      {
        q: "My contract was signed after its prorated first period ended. Is that invoice overdue?",
        a: "No. A late prorated invoice is dated the day it's created, and its due date counts from then.",
      },
      {
        q: "The billing run failed on the 31st. Is that month lost?",
        a: "No. A missed month-end run is made up in the following month, before that month's own billing day, dated its original billing day.",
      },
      {
        q: "I'm importing contracts that are already billing in another system. Will the current month be billed twice?",
        a: "No. A contract imported as signed or active is marked as billed for the period in progress. Add a lastBilledDate column to set it yourself.",
      },
      {
        q: "Why was my punch edit refused as \"overlaps another punch\"?",
        a: "One person can't be clocked in on two stops at once. The message shows the clashing punch's times; fix or remove that one first.",
      },
      {
        q: "Does the payroll lock cover pause time and visit clock times?",
        a: "Yes. On a locked day, a visit's pause minutes, its paid/unpaid choice and its clock-in/out times can't change, and neither can punches, shifts or payroll corrections.",
      },
      {
        q: "Can a crew go back and forth between two jobs without double-counting time?",
        a: "Yes. Pause the first stop, start the second, and when you go back tap Resume on the first. Starting a new job stops any other running stop automatically, but a stop that was paused is left alone because the crew is coming back to it. Tapping Resume on it pauses whatever else is running at that moment and adds a comment on that visit. A paused stop's pause time already stays out of its hours.",
      },
      {
        q: "Can I sort the Dispatch Board or the Waiting List by a column?",
        a: "Yes. Click a column header to sort A to Z, click again for Z to A, and a third time to return to the default order. On the Dispatch Board the default is the route order. Sorting only changes the display: it never changes the saved route order, and it is turned off while you are hand-ordering a route. Blank cells always sort to the bottom. On the Waiting List, sorting by Client puts a client's jobs together so duplicates are easy to spot.",
      },
      {
        q: "A storm crew worked past midnight. Which day is the 1am punch locked and paid on?",
        a: "The day the shift started.",
      },
      {
        q: "If I change \"Crew pauses are unpaid\", does it change past payroll?",
        a: "No. Each day keeps the setting it ended under; only days ended after the change follow the new setting.",
      },
      {
        q: "Does Payroll calculate overtime pay?",
        a: "No. It reports overtime hours; apply your overtime pay rate in your payroll system.",
      },
      {
        q: "Why are Labor Rate and Labor Cost blank in my Timesheet report?",
        a: "They need the Show Wage Burden permission (Payroll Access). The same applies to the Cost column in Resource Time Utilization.",
      },
      {
        q: "What labor rate do the Timesheet, Resource Time Utilization and job costing use?",
        a: "The crew member's burden rate if one is set; otherwise the employee's hourly rate plus the company labor burden. All three use the same rate.",
      },
      {
        q: "Does the KPI Scorecard's OT % use my overtime setting?",
        a: "Yes. It uses the rule in Settings → Organization → Overtime (weekly or daily limit), the same rule as the Payroll tab.",
      },
      {
        q: "Who gets texted when an automation sends to \"All contacts\"?",
        a: "Only contacts with \"Opted in to text messages\" ticked on their contact record. The client's own primary and billing phones follow the client's opt-in.",
      },
      {
        q: "A contact replied STOP. What happens?",
        a: "That contact's text opt-in is turned off and the number is blocked. If they reply START from their main phone, they're opted back in.",
      },
      {
        q: "Can I email a client marked \"OK to Email: No\"?",
        a: "Yes, for a one-off email you write yourself; the Email dialog shows a warning first. Automations and campaigns still skip them.",
      },
      {
        q: "How do I copy someone on every invoice and statement?",
        a: "Add them as a contact with type \"Billing\" and tick \"OK to email\". They're CC'd on every invoice and statement email, and you can remove them from a single invoice send in the Send dialog.",
      },
      {
        q: "Do imported clients and leads trigger my automations and Zapier?",
        a: "Only if you tick \"Run automations for imported records\" on the import preview. New leads fire Lead created and new active clients fire Client created.",
      },
      {
        q: "How do I remove a property a client no longer has?",
        a: "Archive it from the Properties list on the client's Details tab. It disappears from job and estimate pickers but keeps its history, and you can unarchive it any time.",
      },
      {
        q: "Why won't a property archive?",
        a: "It still has an unfinished job (scheduled, in progress or on hold), or it's the client's primary address. Finish or move the jobs first, or change the client's address.",
      },
      {
        q: "A client never paid their deposit, but the job is done and paid. Will they still be asked for it?",
        a: "No. Once the estimate's invoices have all been sent and paid in full, the deposit stops showing as due on the proposal link and in the client portal, and the link won't take it.",
      },
      {
        q: "How do I stop asking a client for a deposit?",
        a: "Open the accepted estimate and click Waive deposit under Deposit Required; you can add a reason. The client is no longer asked for it. Undo makes it due again.",
      },
      {
        q: "What if the client already paid the deposit when I want to waive it?",
        a: "There is nothing to waive once it's paid; Waive deposit only applies to an unpaid deposit. The paid deposit is held as an unapplied prepayment reserved for that estimate. When an invoice for the estimate leaves Draft (you save it as sent, print it or email it), the deposit is applied to it automatically, oldest first, up to what the invoice owes, and any leftover stays reserved for the estimate's next invoice. If the estimate is marked Lost with the deposit unused, a red banner prompts you to refund it (Accounting > Payments) or release it to general credit.",
      },
      {
        q: "A client's bank transfer for a deposit bounced. Will I find out even if they accepted in the portal?",
        a: "Yes. However the proposal was accepted, you get a Deposit failed notification, the client is emailed, it's logged on their timeline, and their proposal link re-opens so they can pay again.",
      },
      {
        q: "A client got charged the deposit twice. What happens to the second payment?",
        a: "It's added to the client's account as general credit, not tied to the estimate, and your admins are notified. Apply it to an invoice or refund it from Accounting → Payments.",
      },
      {
        q: "I emailed an invoice to the wrong person. Can I kill the link?",
        a: "Yes. Open the invoice and choose Revoke pay link from the ⋮ menu. Old links stop working right away, and the next email or PDF gets a new link.",
      },
      {
        q: "Do I need to revoke the link when I void an invoice?",
        a: "No. Voiding, merging, consolidating or deleting an invoice revokes its online links automatically.",
      },
      {
        q: "Can a client still download the proposal they accepted after the link's 30 days are up?",
        a: "Yes. An accepted proposal's link, including its PDF download, never expires.",
      },
      {
        q: "Why does the portal home show a price range on an estimate?",
        a: "It's a Good/Better/Best proposal. The range runs from the cheapest package to the most expensive, taken from the version the client was last sent.",
      },
      {
        q: "What happens to a project's billing milestones when I cancel it?",
        a: "Milestones that haven't been invoiced are removed, so nothing more can be billed. Invoiced milestones, invoices and purchase orders are kept.",
      },
      {
        q: "Can I get the removed milestones back if I reopen a canceled project?",
        a: "Yes. Clicking Reopen asks whether to bring back the milestones the cancel removed. Choose \"Yes, restore them\" to put them back, or \"No\" to reopen without them. Only the most recent cancel's milestones can be restored.",
      },
      {
        q: "The contract price changed while the project was canceled. What happens to restored milestones?",
        a: "The difference is spread across the restored milestones in proportion to their amounts, so the schedule covers the contract the same way it did before you canceled.",
      },
      {
        q: "Why can't I approve a change order or invoice a milestone on a canceled project?",
        a: "A canceled project takes no more scope or billing. Reopen the project first.",
      },
      {
        q: "Can I approve a change order on a completed project?",
        a: "Yes, but you'll be asked to confirm first, because the work has already been signed off.",
      },
      {
        q: "Can two people approve a change order and invoice a milestone on the same project at the same moment?",
        a: "Yes, safely. One waits for the other, so a milestone is never re-priced after it was billed or billed at an old amount.",
      },
      {
        q: "Does a rep paid \"when invoiced\" keep commission on an invoice we wrote off or gave a goodwill credit on?",
        a: "No. Commission is earned only on the part not settled by an AR write-off or account credit. If the statement was already created, the difference is taken back as an adjustment on the rep's next statement. Statements already created never change.",
      },
      {
        q: "What if we remove the write-off or credit afterwards?",
        a: "The rep's next statement gets the commission back as a positive adjustment.",
      },
      {
        q: "How do I put bullets or line breaks in an invoice line description?",
        a: "A line's Description on the invoice is a multi-line box. Press Enter for a new line, and start a line with - or * and a space to turn it into a bullet. Line breaks and bullets, including ones copied over from an estimate, carry through to the printed PDF instead of running together as one sentence.",
      },
      {
        q: "Where does the View & Pay button go in an invoice email, and what color is it?",
        a: "Wherever your Invoice Email template puts it. A button or link to the invoice in the template stays in place and is sent as a button in the invoice template's color (your company brand color if it has none). If the template has no invoice link, one View & Pay Invoice Online button is added at the bottom instead, so the email never shows two. A link inside a sentence stays a plain link. The send dialog's Preview tab shows what the client will get.",
      },
      {
        q: "Can I hide a line on an invoice without deleting it?",
        a: "Yes. Hover the line on the invoice and click the eye icon to hide it from the customer. Its amount rolls into the nearest visible line above it (or below, if none is above), so the printed rows still add up to the Subtotal. The line stays on the invoice with its amount, tax, visit and product links, so totals and accounting sync don't change, and the job and visit are untouched. It applies to the PDF, the emailed invoice and the online invoice page; your own screen still shows every line, dimmed. Put a dump run directly under the service it belongs to before hiding it (you can drag lines into order). Prefer this over deleting: deleting a visit's only line can make the visit look unbilled, and deleting a product line sends it back to pending. A locked invoice can't be changed until unlocked.",
      },
      {
        q: "Can I change the order of the lines on an invoice?",
        a: "Yes. On an unlocked invoice, drag a line by the grip handle on its left (on a phone or tablet, use the up and down arrows). The order saves immediately and is used everywhere the invoice shows: the PDF, the emailed invoice, the online invoice page and accounting sync. Reordering never changes amounts, tax or totals. If some lines are hidden, the order decides where their amounts land, because a hidden line rolls into the nearest visible line above it, so move a line to change which row absorbs it. You need permission to modify invoices; a locked or void invoice can't be reordered until unlocked, and new lines are added at the bottom. When invoices are merged, the primary invoice's lines stay first and each merged invoice's lines follow in the order selected.",
      },
      {
        q: "How do I show an estimate's sub-services or materials as their own rows on the invoice?",
        a: "On the estimate, click the On invoice button beside the sub-item's name (it reads Not on invoice until you turn it on). When the estimate is converted to a one-time, waiting-list or recurring job, the invoice lists that sub-item as its own row (quantity x rate) under the service, and the amount comes out of the service row so the total doesn't change. Sub-items left off stay inside the service price. The setting is captured at conversion, so changing it afterwards doesn't affect an existing job. To change it on a job later, open the job and click the On invoice / Not on invoice tag beside the sub-item; it applies to invoices created from then on. On a recurring job each visit's invoice lists the sub-item's per-visit share (its total divided by the line's visits); to charge a sub-item on every visit, set its Visits to the line's visits. Package jobs always bill one service line. You can still hide any invoice row with the eye icon.",
      },
      {
        q: "Can I edit a void invoice?",
        a: "No. A void invoice is read-only: its lines, amounts, dates, terms and notes can't be changed, and it shows nothing due. You can still print, lock or delete it. To bill the work again, use Duplicate as draft.",
      },
      {
        q: "Can I reopen a void invoice?",
        a: "No. Void is final: a void invoice can't be changed to Draft, Sent, Paid or any other status, and bulk Mark as Sent / Mark as Paid skip it. To bill the work again, open the void invoice and click Duplicate as draft.",
      },
      {
        q: "What does \"Duplicate as draft\" do?",
        a: "It creates a new draft for the same client with every line of the void invoice, dated today. It gets a number when you issue it, and the void invoice stays void. Visits, job materials and project milestones from the void invoice are linked to the new draft only if they haven't been billed on another invoice since. Anything billed elsewhere is copied as a plain line, so delete it if it isn't owed again.",
      },
      {
        q: "Why can't I duplicate a merged invoice?",
        a: "Its lines already live on the invoice it was merged into, so duplicating it would bill the work twice.",
      },
      {
        q: "When a payment split across several invoices is partly refunded, how is the refund divided?",
        a: "Unapplied credit on the payment is refunded first. The rest comes off the invoices in proportion to what each was paid, to the cent, so the amounts always add up to exactly the refund.",
      },
      {
        q: "Can a refund be recorded without refunding the card?",
        a: "No. Refunds are only recorded through the payment's Refund action, which refunds a card or bank payment in Stripe first.",
      },
      {
        q: "A parent account paid a sub-account's invoice and part of it was refunded. What does the sub-account's statement show?",
        a: "Only what is still paid. For example, a $100 payment with $30 refunded shows $70 \"Paid by parent account\" and $30 still owed. The refund is counted once.",
      },
      {
        q: "Does the account balance on an invoice account for credit the client already has?",
        a: "Yes. On templates that show the account balance, any unapplied payments, prepayments or credits appear as \"Credit on Account\" and are taken off the Account Balance. The payment stub's Amount Due never goes below $0.00.",
      },
      {
        q: "Can a sub-account's credit pay its parent's invoice?",
        a: "No. A parent account's credit can pay a sub-account's invoice, but not the other way round.",
      },
      {
        q: "If a payment is removed from an invoice, what status does the invoice go back to?",
        a: "If nothing is left paid on it, a Printed or Viewed invoice keeps that status; one that was Partial or Paid goes back to Sent.",
      },
      {
        q: "A visit completed while its period's draft invoice was being printed. Where did it go?",
        a: "Visits are only added to a period draft that is still an unlocked draft at that moment. If it was printed, sent or locked in the meantime, the visit starts a new draft for the period.",
      },
      {
        q: "Why can't a crew change a visit's clock times or snow depth?",
        a: "Times, breaks, hours and crew size are recorded only by the crew app's Start Job, Pause, Resume and Stop Job buttons, and snow depth only by the office. Billing uses these, so the office corrects them (Edit Job Times or Close Out).",
      },
      {
        q: "How is salt billed on snow jobs?",
        a: "The job's planned materials are the plan for every storm. The crew records what they used on each storm, that usage comes off inventory, and Snow Invoicing adds it to that storm's invoice at the planned price. It bills once, and voiding the invoice puts it back in the queue.",
      },
      {
        q: "What date does a snow invoice get?",
        a: "The day you generate it, in your company's time zone, with the due date from the client's terms. Each line keeps its storm's date.",
      },
      {
        q: "We plow and salt the same property on hourly jobs. Are we billing the time twice?",
        a: "No. When one crew's stop has more than one hourly job, each job bills its share of the time on site.",
      },
      {
        q: "A job is on two storms on the same day. Will finishing the first trip finish the second?",
        a: "No. Each storm is its own stop in the crew app.",
      },
      {
        q: "A crew has to go back to a property during a storm. How do I record and bill it?",
        a: "On the Snow Jobs board click Add push next to the client's name (or the crew taps 'Going back? Add another push' on the finished stop in the crew app). The return is its own visit (Push 2, Push 3...) with its own times, depth and crew, and a line on the client's timeline. Per Push and Hourly jobs bill every push. Per Event, Per Inch jobs bill the storm once on the deepest reading across all visits, so the return trip never bills separately. A flat Per Event job records it at no charge unless you choose Bill it.",
      },
      {
        q: "Why does a return trip or extra crew show $0 on a snow stop?",
        a: "The storm is one charge on a Per Event or Per Event, Per Inch job, carried by the first push of the lead crew, so return trips and extra crews are recorded but not billed. Hourly jobs bill each crew's own hours, and Per Push jobs bill every push. On a flat Per Event job you can click the push's No charge tag to make it Billed (before it is invoiced).",
      },
      {
        q: "How do I bill a snow depth range hourly?",
        a: "On the job's depth ranges, set a range's Bill as to Hourly and enter the hourly rate (and optional budgeted hours, which are planning only). It bills the hours on site (clock out minus clock in minus breaks) × the rate; the usual setup is an all-inclusive top range such as 6 inches and up. On a Per Push job each push is priced by its own depth and bills its own hours. On a Per Event, Per Inch job the storm's deepest reading picks the range once, and an hourly range bills the on-site hours of every visit on the storm — the first push, return trips and extra crews all count toward the one charge, which is still a single line on the invoice. Use Per Push when you want each trip as its own line.",
      },
      {
        q: "How do I undo Dispatch, export the snow board, or hide old storms?",
        a: "On the Snow Jobs board, tick stops and choose Actions > Cancel Dispatch to put dispatched stops back to Scheduled (stops the crew already started are left alone). Actions > Export Stops (CSV) downloads the stops currently shown after filters. To retire an old storm, open the status pill and choose Mark storm inactive; Show inactive next to the storm picker brings it back. Add Jobs also has a Service filter.",
      },
      {
        q: "What does the blue Invoiced badge on a Snow Jobs board stop do?",
        a: "A stop that is already on an invoice shows a blue Invoiced # badge beside the client name. Click it to open that invoice in a slide-over, the same view as the Invoices list, without leaving the board.",
      },
      {
        q: "Can one job have different invoice terms than its client, and can invoices show visit times?",
        a: "Yes. A job's Invoice Terms (Invoice Description tab) override the client's default terms for invoices made from that job, including Snow Invoicing; blank follows the client. An invoice bundling several snow jobs uses the override only if they all agree. Tick Show visit times on snow invoice lines on a service (Settings > Services) to append the visit's clocked start and end, like (7:05 AM - 8:40 AM), to its Snow Invoicing line.",
      },
      {
        q: "How do I bill a second salting?",
        a: "Add a push to the salt job and choose Bill it (flat Per Event salt jobs), then set the crew if another crew did it. It then bills as its own charge. On a Per Push or Hourly salt job every push already bills. On a contract with a salt cap, each salting counts as one application toward the cap, and ones past the cap bill as overage.",
      },
      {
        q: "Two trucks are needed at one snow stop. How do I add a second crew, and who bills?",
        a: "Tick the stop and use Assign crews... (selection bar or map panel), tick both crews, and click Set crews. The first crew ticked is the Lead and bills the storm; the other gets its own row tagged Extra crew with its own clock-in and hours. On Hourly jobs each crew bills its own hours on site; otherwise the extra crew is not billed.",
      },
      {
        q: "Crew B needs help, or can't make it to a snow stop. What can the crew do from the tablet?",
        a: "On a snow stop, Need help? Call in another crew gives the stop to the crew they pick straight away, even after clocking in. Before starting the stop, Can't make it? Hand off to another crew moves the stop to that crew's tablet and off theirs. Both log a line on the client's timeline and hand-offs show 'Handed off from ...' on the board. A stop with several crews has to be moved by the office, and these buttons are for snow stops only.",
      },
      {
        q: "The storm runs several days. How do I put stops on different days?",
        a: "Every stop has its own Date. In Add Jobs, tick the jobs for one day, pick the date and click Set date; repeat for each day. On the board click a stop's date, or tick several and use Move to date. Completed and cancelled stops don't move, and a stop a crew has clocked into can't change day. Filter by the Dates filter to work on one day; route order and Optimize Routes work per crew per day.",
      },
      {
        q: "I changed a snow stop's crew, but next storm it's back on the old crew. How do I make it stick?",
        a: "A plain crew change only applies to that storm. Tick Permanent beside the crew picker (selection bar or map panel) to also save the crew onto the Master Routes; the picker then lists each crew's routes, so you choose the crew and the route (for example Plowing or Salting) together. Next storm's Add Jobs then brings those stops in on that crew.",
      },
      {
        q: "Can I use the map on the Dispatch Board to select stops and change crews, dates or order?",
        a: "Yes. Click Map on the Dispatch Board: Select mode picks stops (the table follows) and offers Assign to crew, Move to date, Assign crews and Dispatch; Route order moves a stop later (left-click) or earlier (right-click) in its crew's route and needs Save Order; Draw area selects every stop inside a shape you outline. The same rules as the table's Actions menu apply.",
      },
      {
        q: "I set two filters under 'Select a Filter' but only one seems to apply. How do filters work?",
        a: "They stack. On the Dispatch Board, Waiting List, Estimates, Invoices, Payments, Tickets, Forms and Email Activity, each filter keeps its own value, switching tabs never clears the others, and a row must match all of them. The x beside a filter clears only that one. Crew, City, Zip, Service, Stage, Sales Rep, Category and similar filters are checklists you tick rather than type.",
      },
      {
        q: "A snow invoicing row says the depth 'isn't covered by any depth range or rate per inch'. What do I do?",
        a: "The visit's recorded depth falls outside every depth range on its job and no rate per inch is set, so it would bill $0.00. Add a depth range that covers it, or a rate per inch, on the snow job and the row prices. Close Out also no longer erases a depth or temperature already recorded when you leave the field blank.",
      },
      {
        q: "A job on the Jobs list shows a red 'overdue' badge, or a job with only old visits is missing. Why?",
        a: "The Active tab lists a job by its earliest pending visit inside the From/To window, so a job with visits next week stays listed even if it has an older unfinished visit; the red N overdue badge counts those earlier visits. A job whose only pending visits are before the window isn't listed; widen From to see it.",
      },
      {
        q: "Why can't I convert an estimate to a one-time job without a date?",
        a: "A one-time job with no date has no visit to dispatch, so it would sit on hold where crews and schedulers never see it. Pick a Scheduled Date, or convert it as a Waiting List job if it has no date yet. A recurring job only needs its Schedule; its date is an optional Start Date.",
      },
      {
        q: "How do I select every snow stop in an area?",
        a: "Open the Map on the Snow Jobs board, choose Draw area, click points around the area and click Select inside: exactly the stops in the shape become the selection (in the table too); Add to selection keeps your current picks as well. Then assign a crew, move a date or dispatch from the map panel. Or filter the table by zip or city and tick the header checkbox to select all shown.",
      },
      {
        q: "How do snow contract caps and overage work?",
        a: "On a Monthly Flat Rate snow contract you can cap inches (for example 60 or 80 a year), salt applications (for example 35), and optionally events and pushes, resetting each contract year or monthly. Work inside the cap is covered by the flat price; work beyond it bills as overage in Snow Invoicing at the overage price you set. Inches count once per storm on its deepest reading; each salting counts one application. The contract shows usage and a stop past its cap shows an Overage chip.",
      },
      {
        q: "How do I build or change snow Master Routes?",
        a: "Click Master Routes on the Snow Jobs board (also in Settings > Services > Snow Routes). Search for jobs by service, zip or distance, add them to a route, order the stops by dragging or with Group Stops / Optimize Route, and set the route's default crew. Snow jobs not on any route are flagged NEW. A job can be on only one route.",
      },
      {
        q: "What happens to storms outside a snow contract's dates?",
        a: "You choose on the contract. Don't service: the jobs aren't offered for those storms. Included in the flat rate: they're plowed and covered by the price. Bill per event: they're plowed and billed, with a Monthly Flat Rate job billing the contract's Price per storm. If no price is set, Snow Invoicing shows a warning instead of billing $0.",
      },
      {
        q: "Why can't I add jobs to a storm?",
        a: "The storm is marked Complete. Set it back to Working first. A storm also goes back to Working automatically if a visit is added to it.",
      },
      {
        q: "Why can't I change the snow depth on a visit?",
        a: "The visit is already on an invoice. Void the invoice first if the depth really needs to change.",
      },
      {
        q: "Why can't someone with \"View Jobs\" schedule or move visits?",
        a: "View Jobs is view-only. Scheduling, moving, re-crewing, dispatching, skipping, completing or deleting visits needs Dispatch Board, Waiting List, Manage Snow Dispatch or Add Job. A project job also accepts Add/Modify Projects. Cancelling a job or contract still cancels its untouched visits.",
      },
      {
        q: "Why are Qty and Rate greyed out on the visit sheet?",
        a: "A visit's quantity and rate are what it bills, so changing them needs the Change Visit Price & Quantity permission (Settings → Roles, under Scheduling Access). It's separate from Add/Modify Invoices, so you can let a scheduler re-price visits without giving them invoice access. Everything else on the sheet still saves.",
      },
      {
        q: "Why does my Complete button say the job still has open visits?",
        a: "A job can be marked Completed only when every visit is completed, skipped or cancelled. Finish, skip or cancel the open visits on the Visits tab first. After that, any job type — waiting list, snow and project included — can be completed.",
      },
      {
        q: "What does \"Needs Attention\" mean on the Jobs list?",
        a: "Every visit on that job was skipped or cancelled, so the work was never done. Reschedule it or cancel the job. It is not counted as Completed.",
      },
      {
        q: "How do I show or hide columns like Address, City, State and Zip on the Jobs list?",
        a: "Use the column chooser at the right of the Jobs toolbar. Client is always shown; State is off by default, and your choice is remembered. Address, City and Zip use the same fallback as the Dispatch Board: the job's own address, then the property's, then the client's service address, with billing only as a last resort. With Address switched off, the street address sits beside the client name.",
      },
      {
        q: "My bulk change said \"nothing was applied\". Why?",
        a: "Bulk changes are all-or-nothing. If any selected visit changed after you selected it (usually a crew clocked in), nothing is changed. Refresh the board and try again.",
      },
      {
        q: "Why can't I move a stop that two crews share?",
        a: "While any crew on a multi-crew stop is clocked in, the stop can't move to another day, because the move would take it off that crew's list mid-job. Have every crew clock out first.",
      },
      {
        q: "Do finished packages or removed services show on the Waiting List?",
        a: "No. Completed jobs and removed services aren't offered on the Waiting List or in Nearby.",
      },
      {
        q: "Why is someone missing from a crew on the Crew Board?",
        a: "The Crew Board shows people on their regular crew only on the weekdays that membership is scheduled for, the same as Team Assignment and the crew app. On other days, place them on a crew for that day.",
      },
      {
        q: "A crew tapped Start Day or End Day with no signal and it synced later. What time is recorded?",
        a: "The time they tapped, as long as it's within the last 48 hours. The same goes for marking someone in, out or not working, and for Skip.",
      },
      {
        q: "Our crew ended the day but forgot to tap Stop Job until the next morning. Is the night counted?",
        a: "No. The job's time stops when the crew ended the day.",
      },
      {
        q: "What happens if a crew starts a new job while another one is still running?",
        a: "The other job's time stops automatically when the new one starts, so nobody is clocked into two jobs at once. The office sees a comment on that visit saying so, and it stays in progress until someone taps Stop Job or the office marks it complete.",
      },
      {
        q: "If I move a job to another crew mid-day, what happens to the stop the first crew is working on?",
        a: "It stays with the first crew so they can finish it. Completed and skipped visits, visits dated before today and any visit already started keep the crew that had them. Only visits from today onward that haven't been started move to the new crew.",
      },
      {
        q: "The office completed a stop before the crew tapped Stop Job. Are the crew's notes lost?",
        a: "No. They're added to the visit's completion notes, and the crew's clocks close at the moment they tapped.",
      },
      {
        q: "How do I stop anyone changing hours after I've run payroll?",
        a: "An admin opens Report Center > Payroll and sets \"Lock payroll through\" to the last paid day. Shifts, punches and corrections on or before that date can't be changed by anyone (including the crew app) until an admin moves the lock back or unlocks it. Locked days show a Locked badge.",
      },
      {
        q: "Who can change the payroll lock date?",
        a: "Only admins, and only to a date before today. Every change is in the organization's change history.",
      },
      {
        q: "Why does the crew app show the right day even when a phone is set to a different time zone?",
        a: "\"Today\" always comes from your company's time zone in Settings, and the app checks it every time the schedule loads or the app is reopened.",
      },
      {
        q: "Why can't our crew clock in or upload photos after our subscription ended?",
        a: "A canceled or expired account is read-only, so the crew app shows a message instead of looking like the change saved.",
      },
      {
        q: "Can a crew login see what we charge for a job?",
        a: "Only each service's price on a stop, and only while \"Hide pricing from crew accounts\" is off. Job totals, labor and material costs and material prices are never available to a crew login, not even by querying the data directly. A crew login also can't change a visit's price or quantity.",
      },
      {
        q: "Why does a dashboard marked visible to crews show no job data to my crew?",
        a: "Reports built on jobs and visits include prices, so they return nothing to a crew login. Product and service reports return nothing either, since the catalogs carry costs and rates, and product or service names show blank on reports such as chemical applications and upsells.",
      },
      {
        q: "Why can't I change the price or quantity on some estimate lines?",
        a: "Those lines have already been converted to a job. The job is what gets billed now, so change the price there. Hours, cost, equipment and notes stay editable on the estimate.",
      },
      {
        q: "Why won't an estimate delete?",
        a: "It has a job, invoice, contract, payment, project or change order made from it, or its online deposit is still processing. Bank transfers take a few business days; delete it once the deposit clears or fails.",
      },
      {
        q: "What happens to follow-up emails when I delete an estimate?",
        a: "Its automation sequences stop right away, any of its messages waiting for approval are rejected, and its pending approval requests leave the approvers' queue.",
      },
      {
        q: "Why is no overhead added to some estimate line costs?",
        a: "Lines costed at your break-even rate already include overhead and labor burden in that rate, so nothing is added on top. Overhead applies to costs you enter yourself, and product sub-items get materials overhead.",
      },
      {
        q: "Is estimate equipment cost per visit?",
        a: "Yes. Enter what one visit uses; the line's equipment cost is that times its visits. A sub-item has its own Visits (default 1, charged once for the whole line); its total is Qty x Rate x Visits. Use 1 or the line's visits; any other number shows a warning because a sub-item can't be limited to some visits, so its price is spread across all of them.",
      },
      {
        q: "Why did the man-hour calculator's Adjust Cost change my line cost?",
        a: "It costs the line at exactly the rate you typed (hours × rate), even on square-foot lines. Type a cost to replace it, or 0 to go back to your break-even rate.",
      },
      {
        q: "Does Invoice from an estimate include sub-items?",
        a: "Yes. Each line's priced sub-items are part of its invoice line, so the invoice matches the estimate total.",
      },
      {
        q: "Can visits on an estimate line be a fraction?",
        a: "No. Visits is a whole number, 1 or more; a value like 2.5 is rounded when you leave the cell.",
      },
      {
        q: "Why does my flat line discount come back after I raise the quantity?",
        a: "A flat line discount keeps the amount you entered. If the line total drops below it, only the total's worth applies until the total goes back up.",
      },
      {
        q: "Why did my invoice reminder sequence stop?",
        a: "A sequence started by Invoice created, Invoice sent or Invoice past due ends on its own once the invoice is paid in full, voided or deleted. One started by Invoice paid only ends if the invoice is voided or deleted. The execution log shows the reason, e.g. \"invoice was paid in full\".",
      },
      {
        q: "Do estimate and ticket follow-ups keep running after the estimate is won or the ticket is closed?",
        a: "No. Estimate created, sent, expiring or no-response sequences stop when the estimate is won, lost or deleted. Ticket created, past due or reopened sequences stop when the ticket is closed or deleted. Won, lost and closed sequences only stop if the record is deleted.",
      },
      {
        q: "I approved a queued automation step and got \"Not sent\". What happened?",
        a: "Approving runs the same checks as an automatic send: the automation must still be on, the client must exist, the invoice, estimate, ticket or meeting must still apply, no stop condition can be met, and the step must still exist. Recipients who unsubscribed, bounced or replied STOP are dropped. If a check fails, the step is rejected automatically with the reason.",
      },
      {
        q: "Why did a step vanish from the automation approval queue?",
        a: "The queue only shows steps whose run is still going. Turning the automation or sequence off or deleting it, deleting the client, or the run ending on its own rejects its queued step automatically.",
      },
      {
        q: "Why is the campaign Send Now count lower than my segment size?",
        a: "It counts the emails that will actually go out. It leaves out Do Not Market clients, clients not OK to email, clients with no email, hard-bounced and opted-out addresses, and an address shared by several clients gets one copy.",
      },
      {
        q: "Does a 7-day automation Wait step shift by an hour when the clocks change?",
        a: "No. Days are counted on your company calendar, so a 7-day wait that starts at 9:00 AM resumes at 9:00 AM.",
      },
      {
        q: "Who can create, schedule or send email campaigns?",
        a: "Only people whose role has the campaign permissions: Add Campaign to create one, and Send/Launch Campaign to schedule or send it. Crew logins and roles without those permissions can't create or schedule campaigns, and only admins, managers or people with the Create/Modify Automation permission can change automation steps or decide a queued step.",
      },
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
        a: "The client tags, plus invoice tags ([invoicenumber], [invoicetotal], [invoicebalance], [invoiceduedate], [invoiceterms], [viewinvoiceonline], [paymentlink]) that fill in for automations started by an invoice trigger, and service tags. In a sequence started by a visit trigger, [visitdate] is that service day and [visitservices] every service the client has on it; [servicename], [servicedate] and [chemicalnotice] (the compact Notice of Treatment) read that day's visits. Otherwise [visitdate] and [visitservices] are blank and [servicename], [servicedate] and [chemicalnotice] read the client's last completed visit. [nextservicename] and [nextservicedate] are their next scheduled visit. For a day-before reminder, start the sequence with Visit is coming up (1 day before) and a text such as \"We'll be out on [visitdate] for [visitservices].\" A tag with no value is left blank.",
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
        a: "Yes. A client with a saved card has an Autopay switch on the portal Account page. Saving a card asks whether to use it for autopay (off by default), and removing the saved card turns autopay off. In Landscapt Settings > Client Portal, Allow Autopay stops clients turning it on (they can always turn it off, and autopay already running continues), and Allow Clients to Manage Payment Method stops them adding, updating or removing the saved card.",
      },
      {
        q: "Can I limit how much a client can pay online in one payment?",
        a: "Yes. In Landscapt Settings > Client Portal, set a Card Max Payment Amount and/or an ACH Max Payment Amount; blank means no limit. A client who tries to pay more by that method in one payment (or one prepayment) is told the limit and can pay a smaller amount or contact you. The limit is checked against the invoice balance before any card fee and before account credit is applied, and doesn't affect autopay or payments you record yourself.",
      },
      {
        q: "Who gets notified when a client submits a ticket in the portal?",
        a: "The ticket arrives open and unassigned. Staff get the usual new-ticket in-app notification and email (all admins and managers unless you picked recipients in notification settings). The client's sales rep is also emailed, or the portal Support Email when the client has no active rep. Turn on Email Support Email on new tickets in Settings > Client Portal to email the Support Email every time, in addition to the rep.",
      },
      {
        q: "Can I hide upcoming services or service history from the portal?",
        a: "Yes. In Landscapt Settings > Client Portal, turn off View Upcoming Services and/or View Service History. The hidden section disappears from the Services page and the portal Home page, and with both off the Services tab itself is removed.",
      },
      {
        q: "Where does the portal Welcome Message show, and can I upload a portal logo?",
        a: "The Welcome Message appears under the greeting on the portal Home page; leave it blank and nothing extra is shown. For the logo, Settings > Client Portal has an Upload logo button (PNG, JPG, WebP or GIF up to 2 MB) as well as a URL box, applied when you save. With no portal logo the portal uses the company logo from Settings > Branding.",
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
        a: "QuickBooks won't create a customer whose name already belongs to a vendor or employee, so Landscapt creates it as \"Name (acct #number)\" instead. Only if that name is taken too does the invoice get stuck with this message. Rename the Landscapt client (or link it to the existing QuickBooks customer), then edit and save the invoice to retry.",
      },
      {
        q: "How do I see what my crews need to load on the truck?",
        a: "On the Dispatch Board, click Load List next to Stats. It shows the Daily Load List for the board's day, chemicals with concentrate and mix volume and other materials, grouped by crew, with Print and a link to the full report. Anyone who can open the Dispatch Board can use it; no Report Center permission is needed. The Crew Board also shows each crew's load in a Load lane under Equipment, with a +N more link that opens the full Load List.",
      },
      {
        q: "How does my crew check off what they've loaded on the truck?",
        a: "In the Crew App (browser or iOS/Android), the Equipment today list and the Materials to load list above the stops each have a checkbox on every row. Tap a row when it is on the truck; tap again to undo. The header shows a count such as '3 of 5 loaded'. Equipment is whatever the office put on the crew on the Crew Board (or the crew's default equipment); materials are the pending, non-chemical products on the crew's dispatched stops, added up per product with the clients they're for. Chemicals aren't listed — they're preloaded in the chemical step on each stop. The checks reset every day, and on the native app they need a connection. The office sees them on the Crew Board: equipment shows a small green check (a green Loaded tag in TV mode), checked materials get a green check, and the Equipment and Load lane headers count 'on truck'.",
      },
      {
        q: "I added a product to a visit and it said saved, but it isn't there. Why?",
        a: "Adding a product takes two steps: pick the product, service and quantity on the new row, then click the green check at the far end of that row. Pressing the visit sheet's Save does not by itself add a row you left unconfirmed. In current versions Save also saves a filled-in Add Product row first, or tells you what is missing. The product is added to that visit, so it shows on that day's Load List and Crew Board and is billed with that visit's invoice (on recurring and package jobs once the crew marks it Used; one-time jobs bill planned materials at completion).",
      },
      {
        q: "Why doesn't a product show on the Load List?",
        a: "The Load List counts only materials that are still Pending on a job with a dispatched visit that day, and not chemicals (those are estimated separately). A product already marked Invoiced, Used, Used not billed or Not Used is treated as done and left off. A product added to one specific visit shows only on that visit's day; a job-level product shows on every day of the job until it is resolved. Products that came from an estimate's direct costs are saved as Used, not billed, so they don't appear either.",
      },
      {
        q: "How do I schedule a job or visit?",
        a: "Use the Scheduling section of the Landscapt left menu, not Settings. Scheduling > Dispatch Board is where you put a visit on a day and assign it to a crew; Scheduling > Waiting List is for jobs that only have a date range and no firm date yet, where each row has a Schedule button. Scheduling > Jobs lists every job. The Schedules page under Administration only holds the reusable recurrence patterns (weekly, bi-weekly, seasonal) that a recurring job's Schedule dropdown uses.",
      },
      {
        q: "How do I bill several properties together on one invoice for a parent account?",
        a: "Sub-accounts are separate clients, so their invoices can't be merged the usual way. On the Invoices list, tick the invoices from the sub-accounts and choose Actions > Merge / Consolidate Invoices, then Consolidate to Parent. It creates one new draft invoice on the parent account with each line tagged with its sub-account name in brackets (invoices stacked oldest first, each keeping its own line order), each line keeps the tax it was already charged, and the original invoices are voided and linked to the new one. It is blocked for locked invoices, invoices synced to QuickBooks, invoices with a bank payment still processing or an open dispute, and invoices where a sub-account has already paid something. A payment the parent itself made, such as one check for several properties, moves onto the new invoice.",
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
        a: "Add a Button block, type its label, and use the Button links to control under it. Invoice Email templates offer View & pay invoice online, which links each client to their own invoice; any template can use Custom URL (https://, mailto: or tel:). In a sent invoice email the invoice button is drawn in the color of the invoice template you send with (your company brand color if it has none), wherever you placed it. If an Invoice Email template has no invoice button or link, a View & Pay Invoice Online button is added at the bottom automatically, never both. The link works in the email. In an attached PDF the button is drawn but isn't clickable. See the Document & Email Templates guide.",
      },
      {
        q: "The test email from the template editor failed or looks like a PDF, not an invoice. Why?",
        a: "Send Test Email sends the template with sample data to the email address you are signed in with, with [TEST] at the start of the subject. If the template's Include PDF setting is on, the PDF attachment is the template rendered with sample values, not a real invoice. If the test fails with a message about the PDF attachment, turn off Include PDF in the template's settings to test without it.",
      },
      {
        q: "What is Equipment on an estimate line, and does the client see it?",
        a: "Equipment is an internal cost. Add machines under Administration > Services > Equipment (cost rate, optional charge rate, per hour, per day or flat), then expand an estimate line and choose + Add Equipment. Equipment is per visit: quantity (what one visit uses) times the row's charge rate, times the line's visits, counts against that line's margin. On each row the editable box is the charge rate (starting at the catalog charge rate, or the cost rate if none is set) and the catalog cost rate is shown beside it, read-only. The client never sees it on the proposal, PDF, portal or invoice, and it does not change the line price. A service's Equipment tab can pre-fill machines on every new line of that service.",
      },
      {
        q: "Can an automation follow up on waiting-list jobs that nobody has scheduled?",
        a: "Yes. In an automation's triggers, choose Waiting list window is ending (set how many days before the window closes; 3 if left blank) or Waiting list window passed (fires after the window closed, for windows that closed in the last 7 days). They are checked once a day in the morning Eastern time and only for jobs that are still waiting: not cancelled and with no scheduled visit. Each runs once per job, and the run stops before its next step once the job is scheduled, cancelled or deleted. No default automation is created for either.",
      },
      {
        q: "Who shows up when I type @ in a ticket comment?",
        a: "Typing @ lists the people you can mention, best name matches first, in a scrollable list. Deactivated users and the shared crew logins are left out because they can't be notified.",
      },
      {
        q: "What is on the ticket PDF, and can I search for a ticket from anywhere?",
        a: "The PDF button on a ticket opens a print view with the ticket number, subject, status and priority pills, a Ticket card (type, category, assignee, due date, created, closed), a Client card (type, source, phone, email, address), then notes, contributors and internal comments. @-mentions print as plain names. The Cmd+K search also finds tickets by number, subject or client name if your role can view tickets.",
      },
      {
        q: "How do I find a setting quickly?",
        a: "On any Settings page, click Search settings at the top of the left sidebar and type a word such as 'invoice numbering', 'time zone' or 'QuickBooks'. Pick a result to jump straight to that tab. Results only include settings your login can open.",
      },
      {
        q: "Where can I download the product overview PDFs?",
        a: "Go to Settings > Docs and look under Downloadable overviews for short PDF guides (dispatch and scheduling, estimating and job costing, invoicing and payments, snow, chemical tracking, payroll and time tracking, maintenance and purchasing, and a switching checklist). The same PDFs are linked from the public help page.",
      },
      {
        q: "What are sub-items on a service bundle or estimate line?",
        a: "A sub-item is a product or subservice attached to a bundle item or estimate line, with its own visits, quantity and rate (total = qty x rate x visits; visits default to 1, once for the whole line, or set it to the line's visits to charge it every visit). Add them with + Add sub-item in the bundle editor, where the same On estimate / On invoice buttons and an internal unit cost are available in the row (Settings > Estimates > Service Bundles); they come along when the bundle is applied. On an estimate, the On estimate / Hidden button beside a sub-item's name controls whether it is printed under the line for the client; the pencil dialog has the same two settings as Print on Estimate and Print on Invoice checkboxes (to rename a bundle sub-item or swap its product, delete it and add it again). On the PDF a hidden sub-item's amount is included in the line's total, and section subtotals include every priced sub-item, so they add up to the estimate total. When the estimate becomes a job, the office and the crew see each service's sub-items by name and quantity only, with no prices; by default they never bill separately and don't change inventory. On an estimate, the On invoice / Not on invoice button beside a sub-item lets you print it as its own row on the invoice for one-time, waiting-list and recurring jobs (its amount comes out of the service row, so the total never changes; on a recurring job every visit's invoice lists its per-visit share); package jobs keep a single service line.",
      },
      {
        q: "How do I add a service from my catalog as a sub-item on an estimate line?",
        a: "Expand the line, click + Add Product / Service, and set Type to Subservice. A Service picker lists your service catalog; choosing one fills in the name, rate (the service's default rate) and cost (its default budgeted cost), all still editable. Choose Product instead to pick from your product catalog. You can also type a custom name.",
      },
      {
        q: "The estimate total is higher than I expected after adding sub-items. Is labor being counted twice?",
        a: "Sub-items are added on top of the line's own Rate, and the line's TP, T.Cost and GM% include them. If the Rate already holds the full price for work you also entered as sub-items, it is counted twice. Fix it by lowering the Rate to cover only what the sub-items don't, for example the equipment charge, since equipment is never billed on its own. An amber pricing warning also shows under the line when the same catalog item appears twice.",
      },
      {
        q: "Where does the blue Cost on an estimate line come from?",
        a: "When the line has Budgeted Hours and the Cost box is blank, the Cost is calculated: budgeted hours times your Breakeven Labor Rate from the estimating settings. Typing a number in Cost replaces it. If the margin looks wrong, check that the breakeven rate in settings is right for your company.",
      },
      {
        q: "What do the amber pricing warnings under an estimate line mean?",
        a: "They are advisory and never block saving. They appear when the line's price is below its equipment charge (equipment isn't billed separately, so raise the line Rate), when an hourly subservice is priced under your breakeven labor rate, when the same catalog product or service is on the line twice, or when the line's costs exceed its price.",
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
        a: "Yes. In the document's Edit Settings (Estimate-type documents only), tick 'Set What The Client Sees For This Document' and choose visits, quantities, units, line prices, line totals, section subtotals, package visits, service name with description and the hide-$0 options. Those toggles are copied onto an estimate when it uses the document. The order, most specific first, is the estimate's own toggles, then the document's, then the service bundle's, then the org default. They are copied, so editing the document later does not change existing estimates or sent proposals.",
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
        a: "Open the service, go to its Chemicals tab and set Area measurement for chemical quantities to Parking Lot Sq. Ft. Without it the service uses the org's Default Area Measurement from Settings > Chemical Tracking (for example Turf Sq. Ft.). A treated area on the job service overrides both.",
      },
      {
        q: "How do I rename or delete an item in the Chemical Tracking lists?",
        a: "In Settings > Chemical Tracking, click the pencil to rename an application method, target, volume unit or area treated, and the X to delete one. The switch still turns an item off without removing it. An item already used on a rate or an application can't be deleted (turn it off instead); renaming is always safe because records point to the item, not its name. Area units can't be renamed because their name carries their scale (1,000 Sq Ft, 100 Linear Ft), so add a new one instead. New companies start with the standard application methods and areas treated already filled in.",
      },
      {
        q: "What happens if the chemical area field is blank, or the service isn't treating turf?",
        a: "The amount is sized from the first area that resolves: a treated area entered on the job service, else the service's own Area measurement for chemical quantities, else the default field in Settings > Chemical Tracking. If none gives a number for that property, no amount is estimated and the quantity is left to enter by hand. The same applies when auto-calculate quantity is off or a rate per linear foot meets a square-foot field. For non-turf work set the service's own field (for example Parking Lot Sq. Ft.) or enter a treated area on the job.",
      },
      {
        q: "How do I estimate a perimeter or barrier product that is labelled per linear foot?",
        a: "In Settings > Chemical Tracking add an area unit such as Linear Ft, 100 Linear Ft or 1,000 Linear Ft (new orgs already have all three) and use it on the product's Application Rate. Then open the service's Chemicals tab and set Area measurement for chemical quantities to a linear-foot field such as Linear Ft. Perimeter. A linear-foot rate is only sized from a linear-foot field and a square-foot rate only from an area field; when they don't match no amount is estimated and the Daily Load List and application panel say why.",
      },
      {
        q: "What are the lists in Settings > Chemical Tracking for?",
        a: "Application Methods (how it was applied: backpack sprayer, drop spreader), Targets (what it treats: grubs, broadleaf weeds), Volume Units (ounces, gallons, pounds, with the conversion the mix calculator uses), Area Units (Square Foot, 1,000 Sq Ft, Acre, Linear Ft, 100 and 1,000 Linear Ft) and Areas Treated (turf, mulch beds, hardscape, parking lot / pavement, perimeter). They feed the product's application rates, the application log, the compliance report and the client notice. Each header shows how many items it holds, the switch turns an item off without removing it, and the pencil and X rename and delete.",
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
        q: "How do I delete an estimate?",
        a: "Open the estimate and click Delete (the red button in the row of stage buttons), or tick one or more estimates in the Estimates list and choose Actions > Delete Selected. It asks you to confirm. You need the Edit Estimate permission. The estimate leaves your lists, its proposal link stops working, its follow-up sequences stop, any of its messages waiting for approval are rejected and its pending approval requests leave the approvers' queue; if it was made from a ticket, the ticket can be converted again. An estimate with a job, invoice, contract, payment, project or change order made from it can't be deleted until those are cancelled or deleted, and one whose online deposit is still processing can't be deleted until the deposit clears or fails. To just take an estimate out of your open pipeline, mark it Lost instead.",
      },
      {
        q: "How do I make estimate numbers continue from my old system?",
        a: "Go to Settings > Accounting > Estimate Numbering, enter the number the next estimate should have and click Set number. It never goes below the highest estimate number you already have, existing estimates keep their numbers, and invoices have their own Invoice Numbering card. Admins, managers and anyone with the Accounting or CRM settings permission can change it.",
      },
      {
        q: "Why does my estimate PDF show only the description and not the service name?",
        a: "A line with its own client-facing description prints just that description, so internal service names stay hidden. Turn on Service name with description in the estimate's Client View toggles (or the org default under Settings > Estimates > Client View) to print the name above the description on the PDF, emailed estimate, proposal page and client portal. A line with no description always prints its name.",
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
        a: "Sub-items from Apply bundle show under their lines straight away; expand a line to see them. If a bundle's items have no sub-items in the bundle editor, there is nothing to copy.",
      },
      {
        q: "What does the Mine / Everyone toggle on My Day do?",
        a: "My Day opens scoped to you. Mine shows open and pending tickets assigned to you or where you're a contributor (on-hold tickets stay off), estimates where you're the sales rep, and meetings assigned to you; Everyone shows the whole company's. A My Upcoming Meetings card lists your next seven days of meetings. The Quick Actions (Add Ticket, New Client, Estimate, Ticket, Invoice) open the quick-add dialog instead of just jumping to a list. Breadcrumbs across the top of list pages are clickable to jump back to the section.",
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
        q: "Why do parent accounts show before their sub-accounts when I search for a client?",
        a: "When you type in a client picker, parent and stand-alone accounts are listed first, then sub-accounts. This keeps a parent from being pushed off the list by dozens of sub-accounts with similar names, such as 'Cannon - 12 Oak St'.",
      },
      {
        q: "What is the Recent list in the global search?",
        a: "When you open the global search (Cmd/Ctrl+K) with nothing typed, it shows the last few clients, leads, invoices, estimates and tickets you opened or picked from search. The list is kept in your browser only, one per login, only shows record types your role can view, and drops records that were deleted.",
      },
      {
        q: "Why did saving a client's email show a \"looks like a typo\" warning?",
        a: "When a client, lead or billing email looks like a common slip (.con or .om instead of .com, gmial.com, hotmial.com and similar), Landscapt shows the corrected address and doesn't save yet. Fix it, or save again to keep it exactly as typed; it warns once per address per session. An address that is structurally invalid is refused outright.",
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
        a: "An unpaid invoice is overdue once its due day has passed; one on Due on Receipt terms with no due date goes overdue the day after its invoice date, and an invoice with no balance left is never overdue. About three days before an open estimate expires, its creator is reminded by email and in the bell (its sales rep when there is no creator); each has its own switch under Notifications. Contract expiry warnings go only for signed or active contracts, never for cancelled, expired or draft ones. A snow job whose contract has ended no longer shows on the Snow Jobs board, and its completed visits bill per visit.",
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
        a: "On the Crew App's My Schedule screen tap Edit Crew. Mark 'Not working' for someone who is out (they're skipped by Start Day and Start Job), tap Clock In for a late arrival, 'Left for the day' for someone leaving early, and Back if they return the same day (the time away comes off as an unpaid break). The office can fix anything afterward on Report Center > Payroll, or with Edit Job Times on the Dispatch Board, unless payroll is locked through that day.",
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
        a: "Landscapt > Reports > Payroll tab (admins and any role with the \"View & Edit Payroll Report\" permission, under Report Access in the role editor; other users don't see the tab). Pick a period (up to 62 days, with This week / Last week / Last 2 weeks shortcuts), expand an employee to see each day, and correct clock-in/out times, unpaid break minutes or hours, add extra hours (shop time, PTO) with a note, then Save. Export as Excel (totals + daily), CSV or PDF. Corrections only change the Payroll report; recorded shifts and Job Costing are untouched. Days on or before the 'Lock payroll through' date (set by an admin at the top of the tab) can't be corrected until an admin moves the lock. Amber 'check' badges mark days that were never ended, have an open job punch, or had no Start Day.",
      },
      {
        q: "Can two crews work the same job on the same day?",
        a: "Yes. Open the visit on the Dispatch Board (or the job's Visits table > Change date / crew) and use 'Crews on this stop' > 'Add another crew…'. Each crew gets its own visit, so it has its own row in its own column, its own stop in the Crew App, and clocks its own hours. The original visit is the Lead: it carries the revenue and creates the one invoice, the added crew's visit shows $0 and never invoices, and Job Costing adds up every crew's labor. A shared stop uses one contract visit, rescheduling one crew moves the others that haven't started, and a snow stop can take extra crews too from the Snow Jobs board (the lead carries the storm's charge; on Hourly jobs each crew bills its own hours).",
      },
      {
        q: "Can I put several crews on many visits at once from the Dispatch Board?",
        a: "Yes. Check the visits, then Actions > Re-assign Crew > Multiple crews… and tick the crews. The ticked crews become each stop's full crew list: the first crew you tick is the Lead (it bills the stop), the others are added as Shared, and any crew on the stop that you didn't tick is removed. With one stop selected the dialog opens with its current crews ticked, so you can untick one to remove it or tick the first one you want as Lead. Selecting one row of a shared stop covers the whole stop. A stop is skipped, with a message, if its Lead has already started; a crew that has already started stays on the stop; completed and cancelled visits are never changed, and snow stops take extra crews from the Snow Jobs board's Assign crews... button (the lead bills; Hourly extras bill their own hours).",
      },
      {
        q: "Why does the second crew on a shared stop show $0 and no Invoice button?",
        a: "The stop bills once, from the Lead visit, so the added crew's visit carries no revenue and can't be invoiced on its own — its hours still count in Job Costing and the job's labor. If you remove the Lead crew from the stop, billing passes to the next crew automatically.",
      },
      {
        q: "Should we report near misses, or only injuries?",
        a: "Report both. A near miss is an event that could have hurt someone but didn't, and the Injury / Near Miss form under Field has its own type for it. Near misses are tracked and reported separately and never reset Days Since Last Injury or the Accident Free Workdays KPI, so reporting them can't make your numbers look worse.",
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
        a: "Stage (Draft/Quote/Sent/Accepted/Lost/Invoiced) tracks where the estimate sits in the sales process. Approval Status (Not Required/Pending/Approved/Rejected) is a separate internal sign-off gate — an estimate can be stuck 'Pending' approval even though its stage already says 'Sent', which blocks it from actually going out. Once an Accepted estimate has been converted to a job, its pill reads Converted (the stage itself stays Accepted).",
      },
      {
        q: "Why can't I pick a client as a parent account?",
        a: "A commercial client can only be linked as a parent if it doesn't already have a parent of its own — the hierarchy is one level deep. If the client you want to use as a parent is itself a sub-account, unlink it from its current parent first.",
      },
      {
        q: "Where do I enter a property's zone measurements, like turf or mulch bed square footage?",
        a: "Use More → Aerial Measurement on the client: trace each turf, mulch bed, parking lot or hardscape area on the satellite map (Trace Area), cut out things like the house with Subtract Area, and measure fences or edging with Measure Distance. Totals are saved on the property, and for the client's own address they are also copied to the client's takeoff fields (Turf, Mulch Bed, Parking Lot, Gross). You can also type the client-level totals on the Edit Client dialog's Custom Fields tab. Either way they feed the estimating engine's production-rate calculations. For a client with several properties, type each property's measurements in the Add/Edit Property dialog (Measurements), or trace them with Aerial Measurement; an estimate for a property defaults production-rate quantities from that property, and a blank value stays blank instead of using another address's numbers.",
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
      {
        q: "How do I merge two duplicate clients?",
        a: "Open either client, then More > Merge Clients. Search for the duplicate, choose which record to keep, review what will move (jobs, visits, invoices, payments, estimates, contracts, properties, contacts, tickets, timeline and more), type MERGE and confirm. Everything moves to the kept client, empty fields are filled from the duplicate, and the duplicate is deleted. It can't be undone. You need the Allow Delete permission for clients (admins always can).",
      },
      {
        q: "Why does Landscapt warn me that a client already exists when I add one?",
        a: "When the new client's or lead's email or phone matches an existing client, you'll see the match(es) with a link before anything is created. Open the existing one, or choose Create anyway if it really is a different customer.",
      },
      {
        q: "Why can't I void an invoice that was already emailed or printed?",
        a: "You can. Voiding works on sent and printed (locked) invoices; an earlier bug blocked it for invoices created from visits and has been fixed. Void is still blocked while payments are applied: refund or unapply them first.",
      },
      {
        q: "Which price does a visit bill if I changed its Rate or Qty on the Dispatch Board?",
        a: "The visit's own Rate x Qty, the same amount the board's Amt column and Job Costing show. Without one, it bills the service's rate. Changing a visit's Rate or Qty needs the Change Visit Price & Quantity permission.",
      },
      {
        q: "Why did a client get two invoices for the same week or month?",
        a: "Weekly and monthly batch invoices are split by sales rep, PO number and payment terms. If a client has jobs under two reps, two PO numbers or two different terms (say Net 30 and Due on Receipt), each gets its own invoice for the period, so commission, the PO and the due date on the invoice stay correct.",
      },
      {
        q: "What does the 'Daily' invoice frequency do?",
        a: "It puts all of a client's visits completed for the same service day on one invoice. 'Upon completion' invoices each visit separately.",
      },
      {
        q: "What date does an invoice for one visit get?",
        a: "An invoice for a single visit is dated the day it is created, and its due date counts from that day. Each line still shows the visit's service date. Weekly and monthly batch invoices are dated the last day of their period.",
      },
      {
        q: "Why didn't the mulch I planned on a recurring job get billed with the last mow?",
        a: "On recurring and package jobs, a completed visit bills only the materials the crew recorded as used. Materials the office planned stay planned until the crew records them on the visit that uses them. One-time and waiting-list jobs still bill their planned materials when completed.",
      },
      {
        q: "Why is there no Invoice button on a contract, project or snow visit?",
        a: "That work is billed elsewhere: contract visits by the contract's invoice, project jobs by their milestones, and snow by snow billing. The Invoice buttons are hidden for that work, and the system refuses to invoice it separately so it isn't billed twice.",
      },
      {
        q: "What happens when I remove a service from a recurring job?",
        a: "Its upcoming, not-yet-started visits are removed. If the service already has history (completed, skipped or in-progress visits, or materials), it's marked Stopped instead of deleted, so that history keeps its service. Stopped services no longer schedule or bill, and they're left out of the job's value.",
      },
      {
        q: "What does 'Keep existing visits' do when I change a schedule in Settings > Schedules?",
        a: "Visits already on the calendar stay as they are, and the new schedule only starts after the last of them, so no week gets two visits. Choose 'Update visits' to move the not-yet-started visits to the new days instead.",
      },
      {
        q: "How do I see which customers are on a schedule?",
        a: "Open the schedule in Settings > Schedules and click its Customers tab. It lists every client with an active job on that schedule (completed and cancelled jobs are left out), with job number, services, address, city and zip. Use the Filter box to narrow the list and Export CSV to download what is shown. A job with no address of its own shows its property's address, then the client's service address, then the billing address.",
      },
      {
        q: "What happens if I mark a recurring or package job Completed?",
        a: "You'll be asked to remove its upcoming visits, the same as cancelling. Visits that are started, completed or invoiced stay. Setting the job back to an active status regenerates its visits.",
      },
      {
        q: "How do I end a recurring job on a certain date or change when it starts?",
        a: "Open the job's settings and change the Start Date or End Date. You'll see a preview of the visits that will be added or removed before it's saved.",
      },
      {
        q: "A job is sold for 30 visits. Do skipped visits count?",
        a: "No. Only scheduled, dispatched, in-progress and completed visits count toward a visit cap. Skipped, cancelled and deleted visits are made up at the end.",
      },
      {
        q: "How do I limit a recurring service to a set number of visits?",
        a: "In Add Job, a recurring job shows a Visits box under each service: enter the total visits for that service, or leave it blank to repeat on the schedule until the End Date. To change it later, open the job and Edit the service line (Visits). It must be a whole number of 1 or more. Skipped and cancelled visits are made up, so the cap counts real visits only.",
      },
      {
        q: "How do I enter (add, create) a new job?",
        a: "Go to Jobs and click Add Job. Pick the Job Type (One Time, Recurring, Package, Project, Waiting List or Snow), choose the client (and the property if they have more than one), then fill in that type's fields: schedule and Start Recurring for a recurring job, a Job Date for a one-time job, a date range for a waiting-list job. Add the services (and products), assign a crew and crew size, add notes, and save. To start from a quote instead, open the accepted estimate and use Convert to Job. Snow jobs can only be created from Add Job.",
      },
      {
        q: "Can I add my own payment method like Venmo, and who is allowed to?",
        a: "Yes. Add Venmo, Zelle, gift cards or anything else under Settings > Accounting > Payment Methods. You need the Accounting settings permission, which the seeded Accounting role has and admins always have. Your methods then appear when recording a payment and on the Payments page under their own name, can be reported on by Custom Method Name, and count as Other wherever the built-in methods are grouped. They count as collected money like any other real payment; only AR write-offs and applied account credit are excluded.",
      },
      {
        q: "Why can't I set a client back to Lead?",
        a: "An account that has been a client, or has jobs or invoices, can't go back to Lead or Lost. Leads exist before the first sale. Use Inactive or Cancelled for a former customer.",
      },
      {
        q: "What happens when I cancel a lead or close it as lost?",
        a: "A lead is closed as Lost, not Cancelled, so it doesn't count as a lost customer. You'll be asked whether to mark its open estimates as Lost too, so they leave the sales pipeline. Cancelling a client asks the same about its open estimates.",
      },
      {
        q: "Does setting a client Inactive stop their visits?",
        a: "New visits stop being generated, and you'll be asked whether to cancel the upcoming visits already on the calendar, the same as Cancel.",
      },
      {
        q: "Who can cancel, reactivate or convert a client?",
        a: "Cancelling, deactivating or reactivating a client needs the Activate/Deactivate or Allow Delete client permission. Converting or closing a lead needs the lead Convert/Close (or Allow Delete) permission. The system checks this however the change is made.",
      },
      {
        q: "Does a client's Primary property follow the client's address?",
        a: "Yes. Changing the client's service address updates the Primary property, and changing the Primary property's address updates the client (and billing, when billing is the same as service).",
      },
      {
        q: "Which text replies opt a client out of texts?",
        a: "Replying STOP, STOPALL, UNSUBSCRIBE, OPTOUT / OPT OUT, REVOKE, CANCEL, END or QUIT opts that number out, and short phrases like \"stop please\" or \"unsubscribe me\" count too. A longer message that contains STOP, STOPALL, UNSUBSCRIBE, OPT OUT or REVOKE also opts the number out, and its ticket notes the word so you can re-confirm with the client. CANCEL, END and QUIT only count as the whole reply, so \"cancel my Tuesday visit\" doesn't opt anyone out. Only the texter can opt back in, by replying START or UNSTOP. A plain \"yes\" doesn't re-subscribe anyone.",
      },
      {
        q: "Why does a client show \"Texts blocked for\" a number?",
        a: "That number opted out of your texts (it replied STOP or similar) or the carrier reported it as blocked. Texts to that number are skipped until the texter replies START.",
      },
      {
        q: "Does a picture a client texts us show up?",
        a: "Yes. Photos texted to your number are saved on the client's timeline and attached to a text ticket, even when the message has no words.",
      },
      {
        q: "How are texts counted toward our monthly allowance?",
        a: "By segment, the same way the carrier bills them: one segment is 160 plain characters, or 70 if the message has emoji or special characters. The send-text box shows how many segments a message will use.",
      },
      {
        q: "How long does a proposal link stay open?",
        a: "An unsigned link stays open at least until the proposal's Valid Until date. Once the client accepts, the link stays viewable, read-only, so they can see what they signed and pay a deposit that is still due.",
      },
      {
        q: "A client said they'd pay the deposit by check. Does the estimate show it as collected?",
        a: "No. A promise shows as an amber \"Client says they'll pay by check\" badge. Collected shows only when money actually arrives, either a card or bank payment through the proposal or a payment you record.",
      },
      {
        q: "What happens to a proposal deposit after it's paid?",
        a: "It's reserved for that estimate's job, project or contract, and only applies to those invoices, not to other invoices like maintenance autopay. If the estimate is later marked Lost, the estimate shows a banner to refund the deposit or release it to general credit.",
      },
      {
        q: "Can a client accept without paying the deposit?",
        a: "Yes, deposits are optional. If they skip it, the accepted proposal and the portal show the deposit as due with a pay button, and the sales rep and staff are notified that it was accepted without a deposit.",
      },
      {
        q: "Why can't anyone change the signature on an accepted proposal?",
        a: "Once a client accepts, the name, signature, time and IP address are locked so the record can't be altered. The link also records which version was signed.",
      },
      {
        q: "What happens when I convert an add-on estimate into an existing project?",
        a: "It's added to the project as an approved change order: the contract and cost estimate go up by the add-on's amounts. Its milestones bill against the add-on's own total, not the whole project contract.",
      },
      {
        q: "Does the WIP report include labor?",
        a: "Yes. Cost to Date is materials and subcontracts, plus labor (crew hours on the project's visits and any manual hours, times the project's labor rate), plus the estimate's overhead share. That matches how the project's cost estimate was built.",
      },
      {
        q: "How do I add a vendor while entering a project cost?",
        a: "On the project's cost entry dialog (Other Costs / Subcontracts tab, Add Cost Entry), open the Vendor picker and choose Add New Vendor at the bottom of the list. Fill in the vendor and save; it is selected on the cost entry automatically. It needs Equipt write access. Enter a negative amount for a vendor credit — hover the Amount label for the reminder.",
      },
      {
        q: "Why can't I delete a project?",
        a: "A project that has invoices, open purchase orders or invoiced milestones can't be deleted. Use Cancel instead: it removes the project's unbilled milestones and asks whether to cancel its upcoming visits.",
      },
      {
        q: "Can a property manager pay several properties' invoices at once?",
        a: "Yes. In the portal, or when staff take a payment, the parent account can pay its own and its sub-accounts' invoices in one payment, and the amount is applied to each invoice. Autopay still runs per account.",
      },
      {
        q: "A customer opened the pay page twice. Can they be charged twice?",
        a: "No. An open payment form is reused if nothing changed and cancelled when the invoice is paid, voided, merged or its amount changes, so an old form can't charge again.",
      },
      {
        q: "Why can't I merge two clients right now?",
        a: "Merge waits while the duplicate has a card or bank payment still processing, so the payment records correctly. Try again once it has gone through.",
      },
      {
        q: "Why did my selected rows clear?",
        a: "On Invoices, Estimates, Tickets and Contracts, changing the tab, search or a filter clears the selection, so a bulk action never touches rows you can no longer see.",
      },
    ],
  },
  {
    label: "Users & Settings",
    items: [
      {
        q: "Two crews would get the same crew login email. What happens?",
        a: "The account is still created. If the generated @crew.landscapt.com address is already taken (\"Mow 1\" and \"Mow-1\", say), a short suffix such as -2 is added. The success screen shows the address to sign in with.",
      },
      {
        q: "Can a crew login see other users' emails, roles or employee details?",
        a: "No. A crew login sees only its own user record. Other users' email addresses and roles, employees' HR details and sales meetings are office-only.",
      },
      {
        q: "Can support staff upload files while helping in our account?",
        a: "Yes. When Landscapt support is signed in to your company to help, attachments they upload are saved in your company's files, the same as yours.",
      },
      {
        q: "Can another company see or open our uploaded files?",
        a: "No. Every company's attachments, logos, thumbnails and document images are kept in its own storage folder, and one company can't browse another's files or open its attachments. Images in the emails and PDFs you send still show for the people you send them to.",
      },
      {
        q: "Why can't I set a card processing fee above 4%?",
        a: "Landscapt caps the card surcharge at 4%. Card networks cap surcharges at 3% and some states ban them, so keep your rate lawful where you operate.",
      },
      {
        q: "Our office admin can't change the tax rate or card fee anymore. Why?",
        a: "Tax rate, card processing fee and ACH settings need the Accounting Settings permission. Give their role that permission, or have an Admin make the change. Company info and client defaults still work with Company Settings or CRM Settings.",
      },
      {
        q: "I typed a real email for a crew login and the crew can't sign in.",
        a: "A real email address has to be confirmed first: we send a confirmation email to it, and the login works once someone opens it and confirms. Leave the email blank to get an auto-generated crew address that works right away.",
      },
      {
        q: "What happens to an admin's API keys when I change them to a different role?",
        a: "Landscapt asks. The confirmation lists the API keys they created and the apps they connected, with revoke checked by default. Anything you keep keeps working until you revoke it under Settings → Integrations.",
      },
      {
        q: "Why are phone numbers and addresses blank on the Employees page for some of my team?",
        a: "Employee contact details show only to Admins and to roles with Edit Employee, Manage Employees or View Employee Information. Everyone sees names, and everyone sees their own details.",
      },
      {
        q: "Who can see and manage form submissions?",
        a: "You need View/Submit Forms to read submissions and mark them read, and Edit Forms to build forms, change a submission's status or delete it. Crew logins and Equipt-only logins can't see forms. Deleted submissions are hidden, never erased.",
      },
      {
        q: "Do public forms on my website still work without a login?",
        a: "Yes. Anyone with the link can fill out a published form; the permission rules only apply to your team inside the app.",
      },
      {
        q: "We're on the Equipt plan. Why can't we add a client?",
        a: "Each plan includes specific products. On the Equipt plan you can view Landscapt records but not create or change them, and on Starter the same applies to Equipt records. Vendors, products, requisitions, purchase orders and projects are shared and always editable. Growth and Enterprise include both.",
      },
      {
        q: "Can I link a login from another company to one of my employees?",
        a: "No. An employee record or crew can only be linked to a login in your own organization, and client portal logins can't be linked either.",
      },
      {
        q: "Does PTO count toward overtime?",
        a: "No. On the Payroll tab, enter paid time off in the PTO column. It's paid and counted as Regular hours, but it never counts toward the overtime limit. Extra hours (shop time and other worked time) do count toward overtime.",
      },
      {
        q: "What's the difference between Extra and PTO on the Payroll tab?",
        a: "Extra is worked time that isn't on the clock, such as shop time, and counts toward overtime. PTO is paid time off: it's paid as Regular hours and never counts toward overtime. Both appear in the CSV, Excel and PDF exports.",
      },
      {
        q: "Someone forgot to clock in, or we use paper time sheets. How do I add their time to Payroll?",
        a: "Go to Reports > Payroll and click Add time entry. Pick the employee and date, enter start and end times (plus any unpaid break minutes) or just the total hours, add a note and click Add entry. It counts for payroll only: no job punches are created, so Job Costing doesn't change. It can't be saved on a locked day, and if the person already has that day recorded it corrects that day instead.",
      },
      {
        q: "The crew leader clocked in someone who never worked. Can I remove that day from Payroll?",
        a: "Yes. In the Payroll detail, click the trash button on that person's day and confirm. It removes the day clock, the job punches and any correction for that date, so the hours and labor cost also come off the jobs and Job Costing. It can't be undone from the report and isn't available on a locked day.",
      },
      {
        q: "How do crews record lunch between jobs, and how does payroll deduct it?",
        a: "When no job is running, the crew taps Start Lunch under the day card and End Lunch when they're back; it starts and ends lunch for everyone on the clock. While a stop is in progress the button is off, so use Take a Break on the job instead. The lunch minutes become each person's Lunch deduction in Report Center > Payroll, which the office can change on the day row. Lunch is taken off in addition to min off, so don't enter the same time in both. A lunch left running ends with End Day or when someone is clocked out early, and counts as at most 4 hours. The daily Excel and CSV export has a Lunch Deducted (min) column.",
      },
      {
        q: "Who can create invoice pay links?",
        a: "Admins and anyone whose role has Email Invoices or Add/Modify Invoices. People who can only view invoices see existing links, and crew logins never see them.",
      },
      {
        q: "Is there a limit on portal tickets?",
        a: "Yes. Up to 10 tickets per account in any 10 minutes, a subject of up to 200 characters and a description of up to 5,000.",
      },
      {
        q: "Who can change crew punches in Edit Job Times?",
        a: "Admins and anyone whose role has the Dispatch Board or View & Edit Payroll Report permission. Others can see punches but not change them.",
      },
      {
        q: "How is overtime calculated?",
        a: "An admin chooses the rule in Settings → Organization → Overtime: hours over a weekly limit (default 40, Monday–Sunday weeks) or over a daily limit (default 8). Only worked hours count toward the limit; PTO is paid as Regular and never becomes overtime. The Payroll tab and its exports show Regular and OT hours for each person.",
      },
      {
        q: "Why was my crew move refused?",
        a: "Moving someone between crews, or marking who's working, needs the Teams, Dispatch Board or Payroll permission, so that their running job time on the old crew can be closed. Ask an admin for one of those.",
      },
      {
        q: "Why can't I edit a client's contacts or properties?",
        a: "Changing an account, including its contacts, properties and parent link, needs the Clients \"Allow Edit\" permission (Leads \"Allow Edit\" for leads). Ask an admin to add it to your role.",
      },
      {
        q: "Why can't I see client balances?",
        a: "Balances (the table column, the filter, sub-accounts, the merge screen) need the \"View Client Balance\" permission.",
      },
      {
        q: "Who can waive a deposit?",
        a: "Anyone with the Edit estimates or Add/modify payments permission.",
      },
      {
        q: "Who can change a visit's price or quantity?",
        a: "Roles with Change Visit Price & Quantity (Settings → Roles, Scheduling Access). Starter roles that schedule or invoice have it ticked; untick it on any role that shouldn't re-price visits. Admins always can.",
      },
      {
        q: "Will I be reminded before my trial ends?",
        a: "Yes. Your account admins get an email about a week before the trial ends, and again the day before.",
      },
      {
        q: "Why does it say \"Ask an account admin to subscribe\"?",
        a: "Only admins can open Settings → Subscription. Ask an admin to choose a plan or resubscribe.",
      },
      {
        q: "Can I send invoices while my account is read-only?",
        a: "You can email invoices that were already sent or printed, and account statements, so you can keep collecting what you're owed. Draft invoices can't be sent. Estimates, chemical notices, ticket emails and document test emails are blocked until you subscribe.",
      },
      {
        q: "My crew was on the clock when our subscription ended. Can they finish?",
        a: "For the first 24 hours after the account becomes read-only, the crew can still tap End Day to close their shifts. They can't start new days or jobs.",
      },
      {
        q: "Why can't I set up my own texting number?",
        a: "It's part of the paid SMS add-on, which isn't available during the free trial. An admin can add it in Settings → Subscription, and then you can finish setup.",
      },
      {
        q: "What happens to my texting number if I cancel or remove SMS?",
        a: "The number is released and the campaign is closed, so you stop paying for them, and texts stop sending. Your approved business registration is kept. After you add SMS again, Continue Setup gets you a new number. The old number can't be recovered.",
      },
      {
        q: "I changed our company tax rate. Do existing clients change?",
        a: "Each client keeps its own rate. After you save a new rate, you're asked whether to also move the clients still at the old rate (for example, clients added while the rate was 0%). Tax-exempt clients and existing invoices never change.",
      },
      {
        q: "Why can't I add an add-on?",
        a: "If your subscription is canceled or has ended, resubscribe to a plan first, then add add-ons.",
      },
      {
        q: "Why does an invite say the email is attached to an earlier free-trial account?",
        a: "That person started their own trial, which ended without a subscription. Contact support@landscapt.com to move their login to your team, or invite them with a different email.",
      },
      {
        q: "Which permissions do the starter roles include?",
        a: "Owner and Operations Manager have every permission, including warranties, commissions and the payroll report. Office Admin also gets warranties and the payroll report. Sales / Account Mgr gets warranties and View My Own Commissions. Every starter role that schedules or invoices also gets Change Visit Price & Quantity.",
      },
      {
        q: "Why did my Zap's \"Create Job\" step used to fail after \"Create Client\"?",
        a: "Create Client makes a lead, and Create Job now converts that lead to a client first, just like the Convert button: the client gets today as its client-since date, a timeline note, and your \"Lead converted to client\" automations run once. A lead that was closed as lost is still refused; reopen it in the app first.",
      },
      {
        q: "What does a 409 error from the API or Zapier mean?",
        a: "The request broke one of your account's rules, such as creating a job for a closed-lost lead or setting a former client back to a lead. The error message says which rule. Only a 500 means a server problem that's worth retrying.",
      },
      {
        q: "How do I retry an API create without making duplicates?",
        a: "Send an Idempotency-Key header (for example a UUID) with each create. Retrying with the same key and the same request within 24 hours returns the first result instead of creating again; a different request with the same key is rejected (422). In MCP, pass idempotencyKey to any create tool. In Zapier, map a unique value from your trigger into the header on a Webhooks or custom request step.",
      },
      {
        q: "Two of my clients have the same name. Will QuickBooks merge them?",
        a: "No. A QuickBooks customer is linked to only one client. The second client gets its own customer named with its account number, for example \"John Smith (acct #1042)\".",
      },
      {
        q: "QuickBooks says my client's customer is inactive. What do I do?",
        a: "Make the customer active again in QuickBooks, or link the client to a different customer from its QuickBooks section, then retry. The automatic sync won't keep retrying it until you do.",
      },
      {
        q: "After merging two clients, why do old invoices still show the old customer in QuickBooks?",
        a: "Invoices already in QuickBooks stay on the customer they were created under, and their payments go to that same customer, because QuickBooks doesn't allow moving a paid invoice to another customer. New invoices go to the surviving client's customer.",
      },
      {
        q: "Why does PATCH /jobs/{id} with scheduledDate or rateCents return 400?",
        a: "scheduledDate only reschedules a job with a single visit that hasn't been dispatched, started or completed (the visit moves with it); reschedule jobs with several visits visit by visit in the app. rateCents only works for a job with one service line.",
      },
      {
        q: "Do the Zapier triggers send the same fields I mapped when I set up the Zap?",
        a: "Yes. Live (instant) trigger deliveries carry the same record fields as the sample Zapier shows during setup, plus the trigger type and client id.",
      },
      {
        q: "Where did some menu items go — what is the 'More' row in the sidebar?",
        a: "To keep the Landscapt sidebar short, less-used items sit under a collapsed More row at the bottom of their group: Requisitions, Contracts, Snow Invoicing and Commissions (Accounting), and Services, Products, Schedules, Packages and Documents (Administration). Invoices, Payments and Purchase Orders stay visible. The CRM and Scheduling groups are always fully visible. Click More to expand it; it opens by itself when you are on one of those pages. Commission plans and assignments now live in Settings > Commissions.",
      },
      {
        q: "What's the best way to use warranties?",
        a: "There are two kinds. Client warranties (Landscapt, Scheduling > Warranties): set up Types once for what you offer (for example Retaining wall — 60 months), then add a warranty from the client, project or job. On a project that isn't finished, leave the start date blank — it begins automatically the day the project is marked Complete. Log any problem as a Warranty damage case so claims count against the warranty, Renew once when it is nearly up (or Void it if cancelled), and keep the sales rep's expiry reminder (sent 30 days before the end) turned on so you can offer a renewal. Equipment warranties (Equipt): open the asset, click Edit, and fill the Warranty section with an end date or a coverage period; the Equipt > Reports > Warranties tab shows what is active, expiring within 90 days, or expired. Details are in the Warranties guide and the Asset Performance guide.",
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
        a: "Most are enforced on the server, so a role without them is refused even through another route. That covers creating or changing invoices and invoice lines, estimates and their lines, contracts, jobs (setting a job to Cancelled needs the Cancel permission), tickets, campaigns (creating one needs Add, scheduling and sending need Send; other edits need Edit), automations, document templates, packages, teams and running reports. The full list by permission is in the Users & Roles guide. Also enforced: changing a client's Office Notes needs View Notes; changing the stored card or turning autopay on needs View Credit Card #'s plus Add/Modify Payments; changing a client balance directly needs View Balance plus Add/Modify Credits. Still hide-only: View Notes, View Credit Card #'s, View Balance, View Billing and Export Lists decide what the screen shows, but a login that queries the data directly could still read it, and exports are built in the browser from rows already loaded. Admins always pass.",
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
        a: "Your trial ends at the end of the last day, on your company's own clock. If you haven't subscribed, the account becomes read-only for 90 days. You can view, search and export everything, and email invoices you already sent plus account statements, but you can't add or change anything. After 90 days the app is locked until you subscribe. Your data is kept either way. Choosing a plan restores full access straight away.",
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
        q: "How do I turn a vehicle's fault code into a work order?",
        a: "Open the vehicle in Equipt > Vehicles, go to the Telematics tab and find the Fault Codes card. For a confirmed or permanent code, click Create work order (you need permission to edit work orders). The work order number then replaces the button. Pending codes can't raise work until the vehicle confirms them. To do it automatically, add an Equipt automation with the Vehicle Fault Code trigger; it fires once for each new confirmed code (optionally only when the check-engine light is on), and codes already present when Samsara was first connected don't fire.",
      },
      {
        q: "Why is the Telematics tab missing or empty on a vehicle?",
        a: "The tab only appears when Samsara is connected (an admin adds the API key under Settings > Integrations). If it is there but empty, it tells you why: the vehicle isn't linked to Samsara (set its Samsara Vehicle ID on the Details tab, or name it exactly as it appears in Samsara and reopen the tab), or nothing has been pulled yet (use Try again). A stat the vehicle doesn't report shows Not reported.",
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
        a: "Yes. Editing a sent invoice (lines, tax, number, date, terms) updates the same QuickBooks invoice about two seconds after you stop, and voiding it voids it in QuickBooks. Void is final in both, so to bill the work again use Duplicate as draft on the void invoice; the new invoice syncs as a new QuickBooks invoice. Changes made in QuickBooks are never pulled back.",
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
      {
        q: "What happens when I deactivate a user?",
        a: "They can't sign in. Their employee record is deactivated too, so they leave rosters and assignment lists, and reactivating either one restores both. If they created API keys, the dialog lists them with 'Revoke these keys' checked, and report emails they scheduled are paused until an admin takes them over.",
      },
      {
        q: "Which reporting features need the Advanced Reporting add-on?",
        a: "Building your own reports (My Reports and New Analysis), Custom Dashboards (including dashboards shown to crews), the Graphics Library, and scheduled report emails. Advanced Reporting is included on Enterprise and during your free trial, and is an add-on on Starter and Growth: an admin adds it in Settings > Subscription. Without it, those tabs show what the add-on includes instead, and scheduled emails aren't sent. Every pre-built report in the Report Center, the built-in Sales Overview, A/R Overview and Operations Dashboard dashboards (as shipped; changing or copying them needs the add-on), the Dashboard tab, the KPI Scorecard, the Company Report and the job costing reports are on every plan. Nothing you built is deleted if you don't have the add-on; it all comes back, and schedules start sending again, once it's added.",
      },
      {
        q: "What ready-made graphics are in the Graphics Library?",
        a: "Besides the basic panels, the Graphics Library has monthly trends and breakdowns by topic. Job Costing covers revenue per field labor hour, labor % of revenue, revenue vs. labor cost, revenue and revenue per man-hour by service, biggest hour overruns and drive time by crew. Sales covers invoiced revenue by month, won vs. lost estimates, estimate win rate, sales by rep, rep goal vs. actual this month and field upsells by outcome. Accounts Receivable covers AR aging, average days to pay and cash collected by month. Contracts & Retention covers active contracts and their base monthly value, new contracts, contracts ending soonest, and clients added and lost by month. Operations has open tickets by category. Click Add to Dashboard on any of them. Average Days to Pay counts days from the invoice date to the date it was fully paid, and a prepayment counts as day 0.",
      },
      {
        q: "Can I filter the Visits Report by job type or by several services?",
        a: "Yes. In Report Center, the Visits Report has a Job Type filter (Recurring, One Time, Waiting List, Package, Snow, Project) and a Services filter where you can tick one or several services; a visit is kept if it includes any of them. Job Type also shows as a column.",
      },
      {
        q: "Why doesn't Backlog Services show visits for a job I cancelled?",
        a: "Backlog Services lists visits still in Scheduled or Dispatched status on or before the cutoff, but leaves out visits that belong to a job that is cancelled, completed, skipped or on hold. Cancelling a job only clears its future visits, so an older leftover visit would otherwise look like work you still owe.",
      },
      {
        q: "A scheduled report says 'creator deactivated'. How do I start it again?",
        a: "In Report Center > Scheduled, an admin chooses Take over & resume. The schedule then runs under the admin's name. The deactivated person's email is removed from its recipients.",
      },
      {
        q: "I invited someone who's already on the team. What happens?",
        a: "Nothing is sent. Landscapt tells you they're already an active member, and their role isn't changed. Change it on the Users page instead.",
      },
      {
        q: "What does a new company start with already filled in?",
        a: "Estimate stages, starter roles, 11 ticket categories, the property takeoff fields, the standard chemical volume and area units, chemical Application Methods and Areas Treated, nine cancellation reasons and eight contact types. Not filled in, because they differ by company: Targets, Client Sources, Tags, Discounts, Custom fields and Other Charges (Settings > Accounting > Other Charges has an Add common charges button). Companies that already existed keep the lists they have.",
      },
      {
        q: "What does the Account Settings permission do?",
        a: "It lets a role open Master Account Settings without being an admin. The role gets the Organization, Branding, Subscription and Integrations tabs: company details, the plan and add-ons, and Zapier. The Users tab and API keys stay admin-only. Changing the tax rate or card fee also needs Accounting Settings.",
      },
      {
        q: "Who is notified when a client asks for changes on an estimate?",
        a: "Active admins and managers, plus the estimate's salesperson even if they aren't an admin or manager. Each person gets a bell notification and an email, and each has its own switch under Settings > Notifications (Estimate Change Requested). Turning yours off only silences you.",
      },
      {
        q: "Do estimate accepted, declined and deposit-failed notifications go to everyone or only the salesperson?",
        a: "They go to the recipients chosen in Settings > Notifications (all admins and managers unless an admin narrows it) plus the estimate's salesperson. Only admins see the recipient pickers. Your own switch only silences them for you.",
      },
      {
        q: "How do I rename a ticket category, cancellation reason, tag or other Settings list item?",
        a: "Click the pencil next to the item, type the new name and press Enter. Existing records follow the new name: tickets and the client portal's category picker, clients' cancellation reasons and sources, estimates' won and lost reasons and sources, services' categories, clients' tags and contacts' types. The Uncategorized and Upsell ticket categories can't be renamed, and payment methods can't be renamed here. Automation rules and forms that quote the old name as text aren't rewritten, so update those by hand.",
      },
      {
        q: "Why are Settings lists in alphabetical order?",
        a: "Ticket categories, cancellation reasons, client sources, tags, contact types, won and lost reasons and service categories always sort A to Z, in Settings and in every dropdown that uses them, so newly added items land in the right place.",
      },
      {
        q: "How do I group tags into categories?",
        a: "In Settings > Tags each tag has a Category box. Type a new category or pick an existing one, or set it when you add the tag. The Add Tag list on a client and the bulk tag dialog then show tags under their category headings, with uncategorized tags last.",
      },
      {
        q: "Can I save a discount with no amount, to type the amount each time?",
        a: "Yes. A saved discount can be 0% or $0. Picking it on an invoice or estimate fills the discount with 0 for you to overwrite, which suits entries like Price Match or Donation / Giveaway.",
      },
      {
        q: "Why does the Dispatch Board map ask for a Google Maps key when route optimization already works?",
        a: "Route optimization, address checks and geocoding use Landscapt's own Google key for plans that include them. Maps drawn in your browser (the Dispatch Board map, Aerial Measurement, the snow board and the master route builder) use the key saved in Settings > Integrations > Google Maps. Create a key limited to the Maps JavaScript API and your site address, then paste it there and run the test button.",
      },
      {
        q: "Why can't I change the last admin's role?",
        a: "Every company needs at least one active admin. Promote someone else to admin first, then change or deactivate the other admin.",
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
