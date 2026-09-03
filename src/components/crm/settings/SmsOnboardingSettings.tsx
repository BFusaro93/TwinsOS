"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useSmsRegistration,
  useSaveSmsBusinessInfo,
  useAdvanceSmsProvisioning,
  useCheckSmsStatus,
  type SmsRegistrationBusinessInfo,
  type SmsRegistrationStatus,
} from "@/lib/hooks/use-sms-onboarding";

const EDITABLE_STATUSES: SmsRegistrationStatus[] = ["not_started", "profile_rejected", "brand_rejected", "campaign_rejected"];

const STATUS_LABEL: Record<SmsRegistrationStatus, string> = {
  not_started: "Not started",
  subaccount_created: "Twilio subaccount created",
  profile_submitted: "Business profile under review",
  profile_approved: "Business profile approved",
  profile_rejected: "Business profile rejected",
  brand_submitted: "Brand registration under review",
  brand_approved: "Brand approved",
  brand_rejected: "Brand rejected",
  number_provisioned: "Phone number provisioned",
  campaign_submitted: "Campaign under review",
  campaign_approved: "Campaign approved",
  campaign_rejected: "Campaign rejected",
  complete: "Live — texting from your own number",
};

const EMPTY_FORM: SmsRegistrationBusinessInfo = {
  legal_business_name: "",
  ein: "",
  business_type: "llc",
  business_industry: "",
  business_website: "",
  business_address: { street: "", city: "", region: "", postal_code: "", iso_country: "US" },
  business_regions_of_operation: "usa_only",
  contact_first_name: "",
  contact_last_name: "",
  contact_email: "",
  contact_phone: "",
  support_email: "",
  support_phone: "",
  opt_in_website_url: "",
  opt_in_checkbox_label:
    "I agree to receive text messages about my service appointments and account, including appointment reminders, crew arrival notices, and job status updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, HELP for help.",
  verbal_opt_in_script:
    "Hi, this is [staff name]. Would you like to receive text message updates about your appointments and account? If you agree, we'll send you texts such as appointment reminders, crew arrival notices, and account updates. Message frequency varies. Msg & data rates may apply. You can reply STOP at any time to cancel, or HELP for help.",
};

export function SmsOnboardingSettings() {
  const { data: registration, isLoading } = useSmsRegistration();
  const saveInfo = useSaveSmsBusinessInfo();
  const advance = useAdvanceSmsProvisioning();
  const checkStatus = useCheckSmsStatus();

  const [form, setForm] = useState<SmsRegistrationBusinessInfo>(EMPTY_FORM);

  useEffect(() => {
    if (!registration) return;
    setForm((prev) => ({ ...prev, ...registration, business_address: registration.business_address ?? prev.business_address }));
  }, [registration]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const status = registration?.status ?? "not_started";
  const isEditable = EDITABLE_STATUSES.includes(status);
  const failureReason = registration?.twilio_brand_failure_reason || registration?.twilio_campaign_failure_reason;

  async function handleSave() {
    try {
      await saveInfo.mutateAsync(form);
      toast.success("Business info saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleAdvance() {
    try {
      const result = await advance.mutateAsync();
      toast.success(`Advanced to: ${STATUS_LABEL[result.status as SmsRegistrationStatus] ?? result.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Provisioning step failed");
    }
  }

  async function handleCheckStatus() {
    try {
      const result = await checkStatus.mutateAsync();
      toast.success(`Status: ${STATUS_LABEL[result.status as SmsRegistrationStatus] ?? result.status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status check failed");
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Your own texting number</h3>
        <p className="mt-1 text-sm text-slate-500">
          Register your own business with carriers so appointment reminders and updates come from your own phone
          number instead of a shared one. This is a one-time setup that Twilio reviews — approval can take anywhere
          from a few hours to a few days.{" "}
          <a href="/settings/support/sms-onboarding-guide" className="text-green-700 underline hover:text-green-800">
            See the full guide
          </a>{" "}
          for wording that gets approved on the first try.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
        <Badge variant={status === "complete" ? "default" : status.endsWith("rejected") ? "destructive" : "secondary"}>
          {STATUS_LABEL[status]}
        </Badge>
        {registration?.twilio_phone_number && (
          <span className="text-sm text-slate-600">Your number: {registration.twilio_phone_number}</span>
        )}
        <div className="ml-auto flex gap-2">
          {["profile_submitted", "brand_submitted", "campaign_submitted"].includes(status) && (
            <Button size="sm" variant="outline" onClick={handleCheckStatus} disabled={checkStatus.isPending}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checkStatus.isPending ? "animate-spin" : ""}`} />
              Check status
            </Button>
          )}
          {!isEditable && status !== "complete" && !["profile_submitted", "brand_submitted", "campaign_submitted"].includes(status) && (
            <Button size="sm" onClick={handleAdvance} disabled={advance.isPending}>
              {advance.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Continue setup
            </Button>
          )}
        </div>
      </div>

      {failureReason && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Twilio&apos;s last review notes:</p>
          <p className="mt-1 whitespace-pre-wrap font-mono text-xs">{failureReason}</p>
          <p className="mt-2">Fix the relevant fields below and save to resubmit.</p>
        </div>
      )}

      <fieldset disabled={!isEditable} className="space-y-6 disabled:opacity-60">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Legal business name</Label>
            <Input
              value={form.legal_business_name}
              onChange={(e) => setForm({ ...form, legal_business_name: e.target.value })}
            />
          </div>
          <div>
            <Label>EIN</Label>
            <Input value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} />
          </div>
          <div>
            <Label>Business type</Label>
            <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v as SmsRegistrationBusinessInfo["business_type"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sole_proprietorship">Sole proprietorship</SelectItem>
                <SelectItem value="partnership">Partnership</SelectItem>
                <SelectItem value="llc">LLC</SelectItem>
                <SelectItem value="corporation">Corporation</SelectItem>
                <SelectItem value="nonprofit">Nonprofit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Industry</Label>
            <Input
              value={form.business_industry}
              onChange={(e) => setForm({ ...form, business_industry: e.target.value })}
              placeholder="Landscaping"
            />
          </div>
          <div>
            <Label>Website</Label>
            <Input
              value={form.business_website}
              onChange={(e) => setForm({ ...form, business_website: e.target.value })}
              placeholder="https://yourcompany.com"
            />
          </div>
          <div>
            <Label>Regions of operation</Label>
            <Select
              value={form.business_regions_of_operation}
              onValueChange={(v) => setForm({ ...form, business_regions_of_operation: v as SmsRegistrationBusinessInfo["business_regions_of_operation"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usa_only">USA only</SelectItem>
                <SelectItem value="usa_and_canada">USA and Canada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Business address</Label>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <Input
              placeholder="Street"
              value={form.business_address.street}
              onChange={(e) => setForm({ ...form, business_address: { ...form.business_address, street: e.target.value } })}
            />
            <Input
              placeholder="City"
              value={form.business_address.city}
              onChange={(e) => setForm({ ...form, business_address: { ...form.business_address, city: e.target.value } })}
            />
            <Input
              placeholder="State"
              value={form.business_address.region}
              onChange={(e) => setForm({ ...form, business_address: { ...form.business_address, region: e.target.value } })}
            />
            <Input
              placeholder="Zip"
              value={form.business_address.postal_code}
              onChange={(e) => setForm({ ...form, business_address: { ...form.business_address, postal_code: e.target.value } })}
            />
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Authorized representative</Label>
          <p className="text-xs text-slate-500">The person Twilio/carriers can contact about this registration.</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <Input
              placeholder="First name"
              value={form.contact_first_name}
              onChange={(e) => setForm({ ...form, contact_first_name: e.target.value })}
            />
            <Input
              placeholder="Last name"
              value={form.contact_last_name}
              onChange={(e) => setForm({ ...form, contact_last_name: e.target.value })}
            />
            <Input
              placeholder="Email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            />
            <Input
              placeholder="Phone"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Support email (shown in HELP replies)</Label>
            <Input value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} />
          </div>
          <div>
            <Label>Support phone</Label>
            <Input value={form.support_phone} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} />
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div>
            <Label className="text-sm font-medium">How customers consent — Method 1: website form</Label>
            <p className="text-xs text-slate-500">
              The page where prospects/clients submit their info with an unchecked-by-default SMS opt-in checkbox.
            </p>
            <Input
              className="mt-2"
              placeholder="https://yourcompany.com/contact"
              value={form.opt_in_website_url}
              onChange={(e) => setForm({ ...form, opt_in_website_url: e.target.value })}
            />
            <Textarea
              className="mt-2"
              rows={3}
              value={form.opt_in_checkbox_label}
              onChange={(e) => setForm({ ...form, opt_in_checkbox_label: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-sm font-medium">How customers consent — Method 2: verbal opt-in script</Label>
            <p className="text-xs text-slate-500">Exact wording staff read aloud when a client calls in.</p>
            <Textarea
              className="mt-2"
              rows={4}
              value={form.verbal_opt_in_script}
              onChange={(e) => setForm({ ...form, verbal_opt_in_script: e.target.value })}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saveInfo.isPending}>
          {saveInfo.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </fieldset>
    </div>
  );
}
