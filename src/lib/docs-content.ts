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
        summary: "Understand the two core modules and how they work together.",
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
            step: "How the modules connect",
            detail:
              "The two modules share Vendors (same table, both can use it) and Parts inventory (replenished via PO → Receiving → Parts stock). A Work Order can spawn a Purchase Requisition when parts are needed, and automation rules can bridge meter readings to work order creation.",
          },
          {
            step: "Recommended setup order",
            detail:
              "1) Go to Settings > Users and invite your team. 2) Configure Approval Flows for Requisitions and POs. 3) Add your vendors. 4) Build the Products catalog. 5) Add your assets and vehicles. 6) Add spare parts and link them to assets. 7) Create PM Schedules. 8) Set up Automations for meter-based maintenance.",
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
              "When you create a Maintenance Part in the catalog, you can link it to a Part in the CMMS Parts inventory. This creates the connection so receiving that product updates the correct part's stock level.",
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
              "Go to CMMS > PM Schedules and click '+ New PM Schedule'. Link it to an asset, give it a name (e.g., 'Monthly Blade Inspection'), and set the frequency.",
          },
          {
            step: "Frequency options",
            detail:
              "Schedules can repeat daily, weekly, bi-weekly, monthly, quarterly, semi-annually, or annually. Set the start date and the system calculates the next due date automatically.",
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
              "Go to CMMS > Parts and click '+ New Part'. Enter the part name, part number, unit of measure, minimum stock level, and current quantity on hand.",
          },
          {
            step: "Linking to assets",
            detail:
              "In the part detail, use the Assets tab to link which assets use this part. This is many-to-many — a single part can serve multiple assets.",
          },
          {
            step: "Replenishing stock",
            detail:
              "Create a Purchase Requisition using the Maintenance Part product that corresponds to this part. When the PO is received in Purchasing > Receiving, the quantity on hand increments automatically. Never adjust quantity manually outside of receiving.",
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
            step: "Self-approval is blocked",
            detail:
              "The system prevents the requester from approving their own submission, even if they have an approver role. A different user must always approve.",
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
        summary: "Vendors are shared across Purchasing and Maintenance.",
        icon: Boxes,
        steps: [
          {
            step: "Shared vendor directory",
            detail:
              "Vendors live in a single shared table. A vendor can supply both landscape materials (used on POs) and maintenance parts/services (used on work orders). There is no module-specific vendor list.",
          },
          {
            step: "Adding a vendor",
            detail:
              "Go to Vendors in the sidebar. Click '+ New Vendor'. Enter name, contact name, email, phone, and address. Vendors are immediately available on all Requisition and PO forms.",
          },
          {
            step: "Vendor history",
            detail:
              "Open a vendor to see all POs issued to them, total spend, and contact history. Use this for vendor performance reviews and negotiations.",
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
        a: "Approval workflows require a different user to approve. If you submitted the requisition, the system routes it to the next approver configured in Settings > Approval Flows.",
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
