import Link from "next/link";
import type { ComponentType } from "react";
import { ArrowRight, FileText, Link2, NotebookPen, Send } from "lucide-react";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-16 lg:px-10">
      <section className="grid gap-10 rounded-[2rem] border border-black/10 bg-[var(--panel)] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.08)] lg:grid-cols-[1.2fr_0.8fr] lg:p-12">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-sm font-medium text-neutral-700">
            <NotebookPen className="h-4 w-4" />
            Next.js MVP for sending content to reMarkable
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-neutral-950 sm:text-6xl">
              Convert content, make a PDF, push it to reMarkable.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-neutral-600">
              This first implementation starts as a single-user web app. It can
              connect a reMarkable account, normalize markdown and HTML, fetch a
              URL, generate a basic PDF, and upload it through the current
              reMarkable auth flow.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard/new"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center justify-center rounded-full border border-black/10 px-6 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-black/5"
            >
              Connect reMarkable
            </Link>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <FeatureCard
            icon={Link2}
            title="URL input"
            description="Fetch a page, pull out readable text, generate a PDF, and upload it."
          />
          <FeatureCard
            icon={FileText}
            title="Markdown friendly"
            description="Paste markdown or HTML directly. The app normalizes it before rendering."
          />
          <FeatureCard
            icon={Send}
            title="Real upload client"
            description="The reMarkable register, token refresh, and PDF upload code runs on the server."
          />
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-black/10 bg-white/80 p-5">
      <div className="mb-3 inline-flex rounded-2xl bg-[var(--accent)]/15 p-3 text-[var(--accent)]">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
    </div>
  );
}
