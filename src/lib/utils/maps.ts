/**
 * Opens an address in the device's default maps app rather than always
 * Apple Maps — on Android, `maps.apple.com` just opens a browser tab (it's
 * not the installed app), and `geo:` is the URI scheme that lets the OS
 * hand off to whichever maps app the user has set as default.
 */
export function openInMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  const url = isIOS
    ? `https://maps.apple.com/?q=${encoded}`
    : isAndroid
      ? `geo:0,0?q=${encoded}`
      : `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  window.open(url, "_blank");
}
