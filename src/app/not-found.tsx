import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-800">Page not found</h2>
      <p className="text-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        href="/dashboard"
        className="text-sm text-blue-600 underline underline-offset-4 hover:text-blue-800"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
