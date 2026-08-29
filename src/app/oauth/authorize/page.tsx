import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/api/auth";
import { API_SCOPE_RESOURCES } from "@/lib/api/scopes";
import { ConsentForm } from "@/components/oauth/ConsentForm";

/**
 * OAuth 2.1 authorization endpoint's user-facing half (the metadata's
 * authorization_endpoint, see src/app/.well-known/oauth-authorization-server).
 * A plain page, not an /api/ route, so the app's existing auth middleware
 * redirects a signed-out visitor to /login and back here automatically --
 * same as any other authenticated page. The actual code issuance (the
 * "approve" submit) posts to /api/mcp/oauth/authorize below.
 */
export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const responseType = get("response_type");
  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const codeChallenge = get("code_challenge");
  const codeChallengeMethod = get("code_challenge_method") ?? "S256";
  const state = get("state");

  if (responseType !== "code" || !clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== "S256") {
    return <ErrorScreen message="This authorization request is missing required parameters or uses an unsupported response type." />;
  }

  const db = adminClient();
  const { data: client } = await db
    .from("oauth_clients")
    .select("client_id, client_name, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) {
    return <ErrorScreen message="Unknown client. This app hasn't registered with this server." />;
  }
  const registeredRedirectUris = (client.redirect_uris as string[]) ?? [];
  if (!registeredRedirectUris.includes(redirectUri)) {
    return <ErrorScreen message="The redirect URL for this request doesn't match what this client registered." />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Middleware should have already redirected signed-out visitors to
    // /login before this page ever renders; this is just a defensive
    // fallback (e.g. a session that expired between middleware and here).
    return <ErrorScreen message="You need to be signed in to approve this connection. Please refresh and sign in." />;
  }

  const { data: profile } = await supabase.from("profiles").select("org_id, name").eq("id", user.id).single();
  if (!profile) {
    return <ErrorScreen message="Couldn't load your account. Please try again." />;
  }
  const { data: org } = await supabase.from("organizations").select("name").eq("id", profile.org_id).single();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
      <div className="w-full rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Connect {client.client_name}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {client.client_name} wants to access <span className="font-medium text-slate-700">{org?.name ?? "your organization"}</span>
          {profile.name ? ` as ${profile.name}` : ""}. Choose what it can access below.
        </p>

        <ConsentForm
          clientId={clientId}
          redirectUri={redirectUri}
          codeChallenge={codeChallenge}
          codeChallengeMethod={codeChallengeMethod}
          state={state}
          resources={API_SCOPE_RESOURCES}
        />
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-4">
      <div className="w-full rounded-lg border border-red-200 bg-red-50 p-6">
        <h1 className="text-lg font-semibold text-red-800">Can&apos;t authorize this request</h1>
        <p className="mt-1 text-sm text-red-700">{message}</p>
      </div>
    </div>
  );
}
