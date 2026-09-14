/**
 * Keeps a Radix Dialog that hosts Stripe Elements from dismissing itself
 * mid-payment (F-07).
 *
 * Symptom: in Collect Payment, with a card fully entered, pressing "Charge $X"
 * closed the whole dialog and issued no PaymentIntent confirmation at all — no
 * request, no error, no toast. Same for clicking the collapsed Payment Element
 * accordion row ("Card" / "US bank account"), which could only be expanded from
 * the keyboard, and for Stripe's own ACH "manual bank details" submit button.
 *
 * Mechanism: a modal `Dialog.Content` has exactly two dismissal paths — Escape,
 * and `pointerDownOutside` (`DialogContentModal` calls `preventDefault()` on
 * `onFocusOutside` itself, so focus moves cannot close it). Radix decides
 * "outside" negatively: `usePointerDownOutside` listens for `pointerdown` on
 * the document and treats the event as outside unless React's synthetic
 * `onPointerDownCapture` fired on the layer first. Stripe Elements live in a
 * cross-origin iframe and re-layout (the accordion collapses/expands, the
 * frame is resized) while the pointer is down, so the pointerdown that Radix
 * sees can have a target that is no longer in the dialog's DOM — detached, or
 * resolved against the shifted layout — and Radix dismisses. Because the
 * dialog unmounts before `click`, our own "Charge" handler never runs, which is
 * why nothing was sent.
 *
 * The guard refuses to treat an interaction as an outside click when it comes
 * from (or during focus in) a Stripe frame, or when the target cannot be
 * resolved in the live document. Escape, Cancel and the X close button are
 * untouched, so the dialog is still dismissible.
 */

/**
 * Structural shape of Radix's `PointerDownOutsideEvent` / `FocusOutsideEvent`
 * (both are `CustomEvent<{ originalEvent: Event }>`), declared here so this
 * module doesn't have to depend on the transitive
 * `@radix-ui/react-dismissable-layer` package for its types.
 */
type OutsideInteractionEvent = {
  detail: { originalEvent: Event };
  preventDefault: () => void;
};

/**
 * Stripe's element frames: `iframe[name^="__privateStripeFrame"]` plus the
 * `.__PrivateStripeElement` / `.StripeElement` wrappers stripe.js injects
 * around them.
 */
const STRIPE_NODE_SELECTOR =
  'iframe[name^="__privateStripe"], iframe[src*="js.stripe.com"], iframe[src*="stripe.network"], .__PrivateStripeElement, .StripeElement';

function isStripeNode(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return !!el?.closest(STRIPE_NODE_SELECTOR);
}

/** True while keyboard focus sits inside one of Stripe's cross-origin frames. */
function stripeFrameHasFocus(): boolean {
  const active = document.activeElement;
  if (!active || active.tagName !== "IFRAME") return false;
  const frame = active as HTMLIFrameElement;
  if (frame.name.startsWith("__privateStripe")) return true;
  try {
    const host = new URL(frame.src, window.location.href).hostname;
    return host === "stripe.com" || host.endsWith(".stripe.com") || host.endsWith(".stripe.network");
  } catch {
    return false;
  }
}

/**
 * Use as both `onPointerDownOutside` and `onInteractOutside` on any
 * `DialogContent` that mounts `<Elements>`.
 *
 * Note the deliberate consequence of the focus check: while a Stripe field is
 * focused, the first click on the dim overlay no longer closes the dialog (it
 * blurs the frame; a second click closes it). Losing a keystroke-perfect card
 * entry to an accidental overlay click is the worse outcome of the two.
 */
export function guardStripeDialogDismiss(event: OutsideInteractionEvent): void {
  const target = event.detail.originalEvent.target;
  const node = target instanceof Node ? target : null;

  // No resolvable target, or a target that was detached from the document
  // during the interaction (Stripe re-laying out its frame under the pointer):
  // we cannot tell that this was outside the dialog, so don't dismiss.
  if (!node || !node.isConnected) {
    event.preventDefault();
    return;
  }
  if (isStripeNode(node) || stripeFrameHasFocus()) {
    event.preventDefault();
  }
}

/**
 * Reserves enough room for an expanded Payment Element so the dialog does not
 * resize under the pointer when Stripe's accordion opens (the trigger for the
 * dismissal above, rather than only its symptom). Roughly the height of the
 * expanded card form; the collapsed accordion simply leaves whitespace below.
 */
export const STRIPE_ELEMENT_MIN_HEIGHT = "min-h-[17rem]";
