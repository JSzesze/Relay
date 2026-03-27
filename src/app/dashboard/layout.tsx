import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const headerList = await headers();
  const currentPath = headerList.get("x-current-path") ?? "/dashboard";

  return <AppShell currentPath={currentPath}>{children}</AppShell>;
}
