import { ConnectForm } from "@/components/connect-form";
import { readState } from "@/lib/state";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const state = await readState();

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <ConnectForm connected={Boolean(state.connection)} />

      <Card className="bg-[var(--panel)]">
        <CardHeader>
          <CardTitle>Current connection</CardTitle>
        </CardHeader>
        <CardContent>
        {state.connection ? (
          <dl className="mt-5 grid gap-4 text-sm">
            <div className="rounded-[1.25rem] border border-black/10 bg-white/85 p-4">
              <dt className="font-medium text-[var(--muted)]">Connected at</dt>
              <dd className="mt-1 text-neutral-950">
                {formatDate(state.connection.connectedAt)}
              </dd>
            </div>
            <div className="rounded-[1.25rem] border border-black/10 bg-white/85 p-4">
              <dt className="font-medium text-[var(--muted)]">User token updated</dt>
              <dd className="mt-1 text-neutral-950">
                {formatDate(state.connection.userTokenUpdatedAt)}
              </dd>
            </div>
            <div className="rounded-[1.25rem] border border-black/10 bg-white/85 p-4">
              <dt className="font-medium text-[var(--muted)]">Upload host</dt>
              <dd className="mt-1 break-all text-neutral-950">
                {state.connection.tectonicHost ?? "https://internal.cloud.remarkable.com"}
              </dd>
            </div>
          </dl>
        ) : (
          <CardDescription>
            No reMarkable connection stored yet. Generate the one-time code from
            your reMarkable account page and enter it here.
          </CardDescription>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
