import Link from "next/link";
import { Inbox, Link2, Send, Settings2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: Inbox },
  { href: "/dashboard/new", label: "New Send", icon: Send },
  { href: "/dashboard/jobs", label: "Jobs", icon: Link2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

export function AppShell({
  children,
  currentPath,
}: {
  children: React.ReactNode;
  currentPath: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-5 lg:px-8">
      <header className="mb-5 flex flex-col gap-4 rounded-[1.75rem] border border-black/10 bg-[var(--panel)] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.06)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/"
            className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--muted)]"
          >
            Remarkable Send
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
            Basic content to PDF to reMarkable flow
          </h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = currentPath === href;
            return (
              <Button
                key={href}
                asChild
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn(
                  active
                    ? "bg-neutral-900 text-white [&_svg]:text-white"
                    : "bg-white text-neutral-700 [&_svg]:text-neutral-700",
                )}
              >
                <Link href={href}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </Button>
            );
          })}
        </nav>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
