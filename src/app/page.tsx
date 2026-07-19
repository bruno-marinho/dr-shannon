"use client";

import { useState } from "react";
import { ProblemInput } from "@/components/ProblemInput";
import { PipelineStatus } from "@/components/PipelineStatus";
import { PaperList } from "@/components/PaperList";
import { ChatPanel } from "@/components/ChatPanel";
import { DR_SHANNON_BIO } from "@/lib/prompts";
import type { Corpus } from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [specializing, setSpecializing] = useState(false);
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Client-orchestrated pipeline: each stage is its own fast serverless
  // call (Hobby-plan timeout), which is also what makes the stage-by-stage
  // status display truthful rather than decorative.
  async function handleSubmit(problem: string) {
    setLoading(true);
    setError(null);
    setCorpus(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      const researched = data as Corpus;
      setCorpus(researched);
      setLoading(false);

      if (researched.papers.length > 0) {
        setSpecializing(true);
        try {
          const specRes = await fetch("/api/specialize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              researchQuestion: researched.plan.researchQuestion,
              papers: researched.papers,
            }),
          });
          const specData = await specRes.json();
          if (specRes.ok) {
            setCorpus({ ...researched, specialization: specData.specialization });
          }
        } finally {
          setSpecializing(false);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Dr. Shannon</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{DR_SHANNON_BIO}</p>
      </header>

      <ProblemInput disabled={loading || specializing} onSubmit={handleSubmit} />

      {loading && <PipelineStatus />}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {corpus && (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Research question</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {corpus.plan.researchQuestion}
            </p>
            <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
              {corpus.plan.rationale}
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">Search trail</h2>
            <ol className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
              {corpus.attempts.map((attempt, i) => (
                <li key={i} className="flex flex-col">
                  {attempt.shannonComment && (
                    <span className="italic text-zinc-500 dark:text-zinc-400">
                      “{attempt.shannonComment}”
                    </span>
                  )}
                  <span>
                    <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
                      {attempt.searchString}
                    </code>{" "}
                    → {attempt.resultCount} result{attempt.resultCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {corpus.papers.length === 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-lg font-medium">Corpus</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">
                Even the broadest search found nothing on arXiv — the problem may sit outside
                the corpus&apos;s strengths. Try rephrasing toward the technical side of it.
              </p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-medium">This session&apos;s specialization</h2>
                {specializing && (
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                    Reading through {corpus.papers.length} abstracts and working out what they
                    make me qualified to say...
                  </p>
                )}
                {corpus.specialization && (
                  <p className="whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {corpus.specialization}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-medium">Corpus</h2>
                <PaperList papers={corpus.papers} />
              </section>

              <section className="flex flex-col gap-2">
                <h2 className="text-lg font-medium">Chat with Dr. Shannon</h2>
                <ChatPanel corpus={corpus} />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
