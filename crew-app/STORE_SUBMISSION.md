# Landscapt Crew: store submission checklist

Seller: **Landscapt, LLC**. App: **Landscapt Crew**. Bundle ID / package: `com.landscapt.crew`.
Production API: `https://landscapt.com`. Production Supabase and API values live in `eas.json`
(`production` profile); `crew-app/.env` is gitignored and never reaches cloud builds.

## 0. Gather the LLC facts
Apple, Google and D&B compare these against each other, so they must match character for character.
- [ ] **Exact legal name** as on the formation documents, e.g. `Landscapt, LLC` (check the comma and "LLC").
- [ ] **Formation document:** articles of organization / certificate of formation.
- [ ] **EIN letter:** IRS CP575 or a 147C letter.
- [ ] **Physical street address** (no PO box), identical everywhere.
- [ ] **Public business phone** that someone answers. Apple and Google both call or text it.
- [ ] **Domain emails on landscapt.com:** a public support address (e.g. `support@landscapt.com`) and a shared mailbox for the Apple ID and Google account. Not a personal address; the accounts outlive any one person.
- [ ] **Authorized person:** the enrolling person must be able to legally bind the LLC (owner, member or officer).

## 1. D-U-N-S number (start first; it is the long pole)
- [ ] Check whether Landscapt, LLC already has one: `developer.apple.com/enroll/duns-lookup`.
- [ ] If not, request it free at dnb.com ("Get a D-U-N-S number"). A few business days to a few weeks.
- [ ] Confirm the D&B record's name and address match step 0 exactly; fix mismatches with D&B. A mismatch is the most common enrollment failure.

## 2. Apple Developer Program (organization, $99/yr)
- [ ] Apple ID on the shared company email, with two-factor authentication.
- [ ] Enroll at `developer.apple.com/programs/enroll` as a **Company/Organization** with the D-U-N-S number (the Apple Developer app on an iPhone is often smoother).
- [ ] Expect a verification call or email from Apple; answer on the business phone.
- [ ] Accept the agreements in App Store Connect.
- [ ] Create the app record: bundle ID `com.landscapt.crew`, name "Landscapt Crew", primary language English, a unique SKU (e.g. `landscapt-crew-ios`).
- [ ] Create an **App Store Connect API key** (Users and Access, Integrations) so EAS can submit builds.

## 3. Google Play Console (organization, $25 one time)
- [ ] Sign up at `play.google.com/console` as an **organization** (not personal) with the D-U-N-S number and the same company details. Organization accounts are exempt from the 12-tester / 14-day closed-testing rule, which applies to personal accounts. Confirm on the enrollment screens.
- [ ] Verify the developer email and phone by one-time code; both are shown publicly on the listing.
- [ ] Complete identity and organization verification (formation document or EIN letter if asked).
- [ ] **Create the app inside the organization account first**, package `com.landscapt.crew`. Never create it in a personal account, even temporarily: the testing requirement follows the app if it is transferred later.
- [ ] Later, create a **service account** with a JSON key so EAS can submit. The very first upload must be done by hand in the Play Console.

## 4. Store listing material
- [ ] **Privacy policy URL:** `https://landscapt.com/legal/privacy`. Confirm it names Landscapt, LLC and covers the crew app, photos, push tokens and device data.
- [ ] **Terms and support:** `/legal/terms`, plus a support URL and email.
- [ ] **Description and keywords;** category: Business.
- [ ] **Icons:** 1024x1024 with no transparency (iOS), 512x512 (Play).
- [ ] **Screenshots:** iPhone 6.9-inch set; Play phone screenshots (at least 2) and a 1024x500 feature graphic.
- [ ] **Age rating** questionnaires on both stores (expected: low).
- [ ] **Privacy disclosures** (Apple App Privacy, Google Data safety). Declare what the app actually collects: email and name (login), photos taken in the app, notes and messages, device and push token. Not collected: location or microphone. Not used for tracking. Data sent over HTTPS.
- [ ] **Review login for Apple:** a dedicated demo crew account in the sandbox org (never a real crew member's). Put the email, password and a short note in App Review Information, e.g. "Crew accounts are created by company admins. Use this demo login." Keep its password stable and its data populated.
- [ ] **Account deletion:** both stores want it when an app supports account creation. Crew accounts are admin-provisioned; say so in the review notes and give a support email for deletion requests.

## 5. Build and test on real devices (do not skip)
- [ ] `npx eas-cli login`, then from `crew-app/`: `npx eas-cli build --platform all --profile production`. Let EAS create the iOS certificates and the Android keystore.
- [ ] **Push notifications:** iOS: let EAS create the APNs key. Android: needs a Firebase project, an FCM credential uploaded to EAS, and a `google-services.json` referenced in `app.json` (not set up yet).
- [ ] Install on a real iPhone (TestFlight) and a real Android phone and log in with a **production** crew account. Everything so far was tested against the TEST Supabase project.
- [ ] Check on both: login, schedule, clock in/out, Suggest work with a photo, chemical confirmation, push-notification tap-to-open (the simulator could not test this), and airplane-mode queueing.

## 6. Submit
- [ ] iOS: `eas submit -p ios`; in App Store Connect attach the build, fill in the listing, submit for review (typically 1 to 3 days).
- [ ] Android: upload the first `.aab` by hand to production in the Play Console, completing the content, ads and data-safety forms (typically a few days up to about a week). Later releases can use `eas submit -p android`.
- [ ] First-time rejections are common and usually small; the review message says why. Fix and resubmit.

## Suggested order
1. Steps 0 and 1 now.
2. Steps 2 and 3 in parallel once D-U-N-S lands.
3. Step 4 while waiting.
4. Steps 5 and 6 once the accounts are approved.

## Known open items
- 20 Expo packages are a few patch versions behind for SDK 57 (`npx expo install --check`); update before the first store build and retest the crew flows.
- Android push needs the Firebase / `google-services.json` setup above.
- Push tap-to-open and real token-expiry refresh have only been verified by code review.
