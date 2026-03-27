import Link from "next/link";
import { readState } from "@/lib/state";
import { formatDate } from "@/lib/utils";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const state = await readState();
  const uploadedJobs = state.jobs.filter((job) => job.status === "uploaded");
  const failedJobs = state.jobs.filter((job) => job.status === "failed");
  const latestJob = state.jobs[0];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Connection"
          value={state.connection ? "Connected" : "Missing"}
          hint={
            state.connection
              ? `Updated ${formatDate(state.connection.userTokenUpdatedAt)}`
              : "Open settings and add the 8-character code."
          }
        />
        <StatCard
          label="Successful Sends"
          value={uploadedJobs.length}
          hint="Completed uploads pushed to reMarkable."
        />
        <StatCard
          label="Failed Sends"
          value={failedJobs.length}
          hint="Failures are persisted so you can retry them later."
        />
      </section>

      <Card className="bg-[var(--panel)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Current shape</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              This version is intentionally single-user. It persists tokens and
              jobs in a local file on the server. If you want multi-user next,
              add product auth and move state into Convex.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/dashboard/new">New Send</Link>
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest job</CardTitle>
        </CardHeader>
        <CardContent>
        {latestJob ? (
          <div className="rounded-[1.25rem] border border-black/10 bg-[var(--panel)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-neutral-950">
                  {latestJob.title}
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  {latestJob.sourceType} • created {formatDate(latestJob.createdAt)}
                </p>
              </div>
              <Badge>{latestJob.status}</Badge>
            </div>
            {latestJob.error ? (
              <p className="mt-4 text-sm font-medium text-[var(--danger)]">
                {latestJob.error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm leading-6 text-neutral-600">
            No jobs yet. Start with a markdown send or upload a PDF.
          </p>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
