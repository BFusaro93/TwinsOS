"use client";

import { useRef } from "react";
import { Trash2, Upload } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { BrandColorPicker, SettingRow } from "@/components/settings/settings-ui";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";

// Logo and accent color used on printed purchase orders and across the
// sidebar. Shared by the master account hub, Equipt settings, and (via the
// same underlying store) Landscapt's sidebar.
export function BrandingTab() {
  const { logoDataUrl, setLogoDataUrl, brandColor, setBrandColor } = useSettingsStore();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();
  const logoInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/company-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("thumbnails")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
      setLogoDataUrl(data.publicUrl);
      updateOrgSettings({ customizations: { logoDataUrl: data.publicUrl } });
    } catch {
      // Fall back to base64 if storage fails
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        setLogoDataUrl(result);
        updateOrgSettings({ customizations: { logoDataUrl: result } });
      };
      reader.readAsDataURL(file);
    }
  }

  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Branding</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Logo and accent color used on printed purchase orders and both product sidebars
        </p>
      </div>
      <Separator />
      <div className="px-6">
        {/* Logo upload */}
        <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">Company Logo</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Displayed in the sidebar and on printed POs. Recommended: PNG or SVG with transparent
              background.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-64 md:shrink-0">
            {logoDataUrl ? (
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-40 items-center justify-center rounded-md border bg-slate-50 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoDataUrl}
                    alt="Company logo"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" /> Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-red-500 hover:text-red-600"
                    onClick={() => { setLogoDataUrl(null); updateOrgSettings({ customizations: { logoDataUrl: null } }); }}
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => logoInputRef.current?.click()}
                className="flex h-20 w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 transition-colors hover:border-brand-400 hover:text-brand-500"
              >
                <Upload className="h-5 w-5" />
                <span className="text-xs font-medium">Upload logo</span>
              </button>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
          </div>
        </div>
        <Separator />
        {/* Brand Color */}
        <SettingRow
          label="Accent Color"
          description="Used on printed PO and WO PDFs"
        >
          <BrandColorPicker
            color={brandColor}
            onChange={(c) => { setBrandColor(c); updateOrgSettings({ brandColor: c }); }}
          />
        </SettingRow>
      </div>
    </div>
  );
}
