"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function ConnectForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/remarkable/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Unable to connect.");
      }
      setCode("");
      setMessage("reMarkable connected successfully.");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to connect.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDisconnect() {
    setIsPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/remarkable/disconnect", {
        method: "POST",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Unable to disconnect.");
      }
      setMessage("reMarkable connection removed.");
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Unable to disconnect.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect reMarkable</CardTitle>
        <CardDescription>
          This MVP stores a single reMarkable connection locally on the server.
          For a real multi-user deployment, add product auth and move this state
          into Convex.
        </CardDescription>
      </CardHeader>
      <CardContent>
      <div className="mb-4 rounded-[1.25rem] border border-black/10 bg-[var(--panel)] p-4">
        <p className="text-sm leading-6 text-neutral-700">
          Get the 8-character code from reMarkable first, then paste it here.
        </p>
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link
              href="https://my.remarkable.com/device/browser/connect"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open reMarkable connect page
            </Link>
          </Button>
        </div>
      </div>
      <form className="space-y-4" onSubmit={handleConnect}>
        <label className="block text-sm font-medium text-neutral-800">
          One-time code
          <Input
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value.replace(/\s+/g, "").toLowerCase(),
              )
            }
            placeholder="abcdefgh"
            maxLength={8}
            className="mt-2"
          />
        </label>
        {message ? (
          <p className="text-sm font-medium text-[var(--success)]">{message}</p>
        ) : null}
        {error ? (
          <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Connecting..." : connected ? "Refresh Connection" : "Connect"}
          </Button>
          {connected ? (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </form>
      </CardContent>
    </Card>
  );
}
