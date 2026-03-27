import { readState } from "@/lib/state";
import { formatDate, truncate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function JobsPage() {
  const state = await readState();

  return (
    <Card>
      <CardHeader>
      <CardTitle>Jobs</CardTitle>
      <CardDescription>
        Persisted send history for the current single-user instance.
      </CardDescription>
      </CardHeader>

      <CardContent>
      <div className="overflow-hidden rounded-[1.25rem] border border-black/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white text-neutral-700">
            {state.jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  No jobs yet.
                </TableCell>
              </TableRow>
            ) : (
              state.jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium text-neutral-950">
                    {job.title}
                  </TableCell>
                  <TableCell className="uppercase tracking-[0.12em] text-xs">
                    {job.sourceType}
                  </TableCell>
                  <TableCell>
                    <Badge variant={job.status === "failed" ? "danger" : job.status === "uploaded" ? "success" : "muted"}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(job.updatedAt)}</TableCell>
                  <TableCell className="text-[var(--danger)]">
                    {job.error ? truncate(job.error, 80) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </CardContent>
    </Card>
  );
}
