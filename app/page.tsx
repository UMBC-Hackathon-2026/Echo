"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, asApiError } from "@/lib/client/api";

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const dto = await api.createSession();
      router.push(`/session/${dto.sessionId}`);
    } catch (e) {
      setError(asApiError(e).error === "network" ? "Could not reach the server." : "Could not start a session.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 p-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">The Inverse Tutor</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          If you truly understand something, can you teach it well enough for someone else to use it? Teach a simulated
          learner about recursion, watch it take an assessment, and trace each answer back to your own words.
        </p>
      </div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="rounded-full bg-zinc-900 px-6 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {busy ? "Starting…" : "Start teaching recursion"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p className="max-w-xl text-xs text-zinc-500">
        The learner is a simulation; its answers come only from the verified teaching record, and its score reflects the
        explanation, not your own mastery.
      </p>
    </main>
  );
}
