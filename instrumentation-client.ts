import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Session Replay isn't wired up — flip these above 0 if you want it.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Off under `next dev`: local debugging (dev:test, probes, half-finished
  // work) was raising "regression" alerts on real issues like LANDSCAPT-4.
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NODE_ENV !== "development",
  // A tab left open across a deploy asks webpack for a module id that only exists in the old
  // build, so webpack's own require throws "Cannot read properties of undefined (reading
  // 'call')". chunk-load-recovery.ts already reloads that tab, so the event is noise (it fired
  // right after the 2026-11-17 deploys). Dropped only when the throwing frame is webpack's
  // runtime chunk, so the same TypeError from app code still reports.
  beforeSend(event) {
    const stale = event.exception?.values?.some(
      (v) =>
        /reading 'call'|evaluating '\w+\[\w+\]\.call'/.test(v.value ?? "") &&
        v.stacktrace?.frames?.some((f) => /\/_next\/static\/chunks\/webpack-/.test(f.filename ?? "")),
    );
    return stale ? null : event;
  },
  ignoreErrors: [
    // Microsoft Outlook SafeLinks / Defender link scanners open emailed links in
    // an embedded CefSharp browser whose own bridge rejects with this string.
    // Not our code — see getsentry/sentry-javascript#3440.
    /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
    // Safari/Chrome web extensions (password managers, content blockers) throw
    // this unhandled rejection from their injected scripts when their tab goes
    // away. Nothing in our code calls runtime.sendMessage.
    /Invalid call to runtime\.sendMessage\(\)\. Tab not found/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
