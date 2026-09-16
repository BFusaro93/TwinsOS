import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // Session Replay isn't wired up — flip these above 0 if you want it.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
