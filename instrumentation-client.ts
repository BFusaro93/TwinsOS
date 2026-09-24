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
  ignoreErrors: [
    // Microsoft Outlook SafeLinks / Defender link scanners open emailed links in
    // an embedded CefSharp browser whose own bridge rejects with this string.
    // Not our code — see getsentry/sentry-javascript#3440.
    /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
