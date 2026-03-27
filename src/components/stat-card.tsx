import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <Card className="rounded-[1.5rem]">
      <CardContent className="p-5">
        <div className="text-sm font-medium text-[var(--muted)]">{label}</div>
        <div className="mt-3 text-3xl font-semibold text-neutral-950">{value}</div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{hint}</p>
      </CardContent>
    </Card>
  );
}
