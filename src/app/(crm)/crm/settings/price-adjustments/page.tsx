import { redirect } from "next/navigation";

/**
 * Price Adjustments moved onto the Services & Pricing page as a tab rather
 * than carrying its own Administration nav entry — it is a seldom-used tool
 * and belongs next to the catalog bulk-price dialog it pairs with. Kept as a
 * redirect so any link or bookmark to the old standalone route still lands
 * somewhere useful.
 */
export default function PriceAdjustmentsRedirect() {
  redirect("/crm/settings/services");
}
