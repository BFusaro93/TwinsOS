# Landscapt Crew: App Store listing and demo login

Copy these into App Store Connect (App Store tab for version 1.0, App Privacy, and App Review Information).
Character limits are Apple's. Nothing here contains a password; the demo login's password goes only into App Store Connect.

## 1. Listing text

| Field | Limit | Text |
|---|---|---|
| **Name** | 30 | `Landscapt Crew` |
| **Subtitle** | 30 | `Crew schedule & time tracking` |
| **Promotional text** | 170 | `Your day's stops, clock in and out, job notes and photos in one place, and it keeps working when you lose signal.` |
| **Keywords** | 100 | `landscaping,field service,time clock,lawn care,snow plow,dispatch,job photos,scheduling,route` |
| **Primary category** | | Business |
| **Secondary category** | | Productivity |
| **Support URL** | | `https://landscapt.com/contact` |
| **Marketing URL** | | `https://landscapt.com` |
| **Privacy policy URL** | | `https://landscapt.com/legal/privacy` (see section 4: add a mobile app paragraph first) |
| **Copyright** | | `2026 Landscapt, LLC` once the account is converted; until then `2026 Brandon Fusaro` |
| **What's New (1.0)** | | `First release of Landscapt Crew.` |

### Description (1,417 of 4,000 characters)

```
Landscapt Crew is the field app for crews at landscaping, lawn care, snow and other field service companies that run on Landscapt.

Open the app and see today's stops in route order, with the client, address, services due and any notes from the office. Tap a stop to work it:

• Clock in and out of each stop, take breaks, and record drive time between jobs
• Read the job notes and confirm you've seen them before you start
• Add before and after photos that stay attached to the visit
• Log chemical applications and the materials you used
• Request materials from the office, and suggest extra work you spot on a property
• Send notes back to the office, and add a late note after a job is done
• Start and end the crew's day, and mark who is late, out or leaving early
• Call in another crew or hand a stop off during snow events
• Switch between English and Spanish, including translating the office's notes

It keeps working when your signal doesn't. Clock-ins, notes and photos are saved on your phone and sent automatically when you're back online, with a clear indicator of what has and hasn't synced.

From the home screen you can also open your company's dashboards and field forms, already signed in.

Landscapt Crew is for employees of companies that use Landscapt. Your employer creates your login, so there is nothing to sign up for in the app. If you don't have a login, ask your supervisor or office.
```

Notes:
- Every feature above exists in the build. Don't add claims (GPS tracking, route optimization in the app, payments) that the app doesn't do.
- The app does not use GPS. Drive time is a timer the crew starts and stops.

## 2. Screenshots

Apple needs one iPhone set. Use the **6.9-inch** size, **1320 x 2868** px (iPhone Pro Max simulators capture exactly this), 3 to 10 images. The app is iPhone-only, so no iPad screenshots are needed.

Suggested order and captions (add captions in an image editor or leave them off):

1. **Home cards** (My Schedule, Dashboards, Field): "Everything for the day in one place"
2. **Schedule** with a mix of stops and the progress bar: "Today's stops in route order"
3. **A stop**: notes box, services, Clock In: "Clock in, take breaks, stop the job"
4. **A stop with sub-services ticked and a photo section**: "Photos and checklists on every visit"
5. **Edit crew** screen: "Start the day and manage who's on the clock"
6. **Spanish version of the schedule**: "English and Spanish"

Take them from a build with clean, realistic demo data (see section 3), not from a real customer's data. Never show real client names, addresses or phone numbers in a screenshot.

## 3. Demo login for App Review

Apple signs in to your app and tries it. It must work on any day, for several days.

### Create the account (in the sandbox org, not a real company)
Use the sandbox organization "Landscapt Lawn & Landscape" (the one that is not Twins Lawn Service).
1. Team → Crews → create a crew named **App Review Crew** (or use an existing sandbox crew) and add one or two sandbox employees to it.
2. Create the crew's login (Team → Crews → Linked Login → create login). **Leave the email blank** so Landscapt generates one. A real email would need a confirmation click that the reviewer can't do.
3. Set a password you'll paste into App Store Connect. Don't reuse a real password. Don't commit it anywhere.

### Make sure the schedule is never empty
The crew only sees **dispatched** visits for **today**, so a one-off job from last week shows nothing. Create jobs that keep producing visits, then confirm today shows stops:
- 3 to 4 **recurring jobs** on the demo crew, together covering **every weekday** (and weekends if review might fall on one), each with at least one service.
- Dispatch the visits (or use whatever auto-dispatch setting the sandbox org has).
- Make them varied: one stop with two services, one with Job Notes and a job comment, one with sub-services, one with a client who has a property address. Avoid a stop with no address (it reads "No address on file").
- Check it the morning of submission, and again before you expect review to start.

If this proves unreliable, say so: the more robust fix is a small nightly job that resets the demo crew's day. Ask me and I'll build it.

### Review notes (paste into "App Review Information → Notes")
```
Landscapt Crew is the field app for employees of companies that use Landscapt (field service and landscaping software). It is for crews, not the public, so accounts are created by the employer's administrator; there is no sign-up in the app.

Demo login:
  Username: <PASTE THE GENERATED LOGIN EMAIL>
  Password: <PASTE PASSWORD>

How to try it:
1. Sign in. You land on three cards: My Schedule, Dashboards and Field.
2. Tap My Schedule to see today's stops. Tap a stop, tap "I've read the notes", then Clock In. Take a break, add a photo, add a note, then Clock Out.
3. The clock-in, notes and photos work without a signal and sync when the device is back online.
4. Dashboards and Field open the company's web pages inside the app, already signed in. The app's core functionality (schedule, time tracking, notes, photos, materials, offline sync) is native.

Notes:
- The app uses the camera and photo library for job photos, and notifications for new job assignments. It does not use location.
- To delete an account, the employer's administrator removes the login, or the user can request it at support@landscapt.com.
- If the schedule looks empty, pull down to refresh. Contact us at the number below and we'll fix it right away.
```

### App Review contact
Name, phone and email of a person who will answer during the review (a reviewer's question left unanswered can mean a rejection). Use a real phone number you will pick up.

## 4. App Privacy ("nutrition label") answers

Apple asks what the app collects, whether it's linked to the user, and whether it's used for tracking. From what the app does today:

| Data type | Collected? | Why | Linked to user | Tracking |
|---|---|---|---|---|
| Contact info: **email address**, **name** | Yes | Sign-in and showing who did the work | Yes | No |
| User content: **photos**, **other user content** (notes, comments, suggestions, chemical and material records) | Yes | The app's functionality | Yes | No |
| Identifiers: **user ID**, **device ID** (the push notification token) | Yes | App functionality (notifications) | Yes | No |
| Other data: **time punches and work hours** | Yes | App functionality (payroll and job costing for the employer) | Yes | No |
| Location | **No** | The app does not use location | | |
| Usage data, diagnostics, contacts, financial, health | **No** | There is no analytics or crash SDK in the app | | |

Tracking: **No.** Third-party advertising: **No.**

Verify this against the final build before you submit. If we later add analytics, crash reporting or location, this has to change.

### Privacy policy gap to fix first
`/legal/privacy` is a general policy. It doesn't mention the mobile app, photos, push notifications or the device token. Apple expects the policy to cover what the app collects. Suggested paragraph to add under "Information We Collect":

> **Landscapt Crew mobile app.** When your employer gives you a login for the Landscapt Crew app, we process your name, work email and login; the time punches, notes, photos and records you enter while doing field work; and a device token used to send you job notifications. This is Customer Data held on your employer's behalf and is used only to provide the app. The app does not use your location and does not use any advertising or cross-app tracking. Photos are taken or chosen by you and uploaded to your employer's account.

Ask me to add it to the page if you'd like (it's a legal document, so have whoever signs off on your policy read it).

## 5. Other App Store Connect answers

- **Age rating:** answer **None / No** to everything (no violence, gambling, mature content, user-generated content shared with the public, or web access to unfiltered content). Result is **4+**.
- **Export compliance:** already answered. The app uses standard encryption only and declares it in its config, so Apple won't ask again.
- **Content rights:** you own or have rights to everything in the app.
- **Pricing:** Free. **Availability:** choose countries. If you leave the **EU out**, you don't need the EU trader declaration (the yellow banner in App Store Connect). If you include the EU, declare **trader status** (as a business) with a public address, phone and email, best done after the account conversion.
- **Advertising identifier (IDFA):** No.
- **Sign in with Apple:** not needed; the app has no third-party social login.
- **Account deletion:** there's no in-app sign-up, so say that the employer's administrator removes logins (the review notes above say this).

## 6. Order of work

1. File the Apple request to convert the account to an organization (do this today; it's the slowest step).
2. Add the mobile app paragraph to the privacy policy.
3. Create the demo crew, login and recurring jobs, then confirm a stop shows today.
4. Take the screenshots from clean demo data.
5. Fill in the listing and privacy answers above, add the demo login to the review notes, and add the build.
6. Submit for review once the conversion is done, or decide to ship under the Individual name.
