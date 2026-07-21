"use client";

import { useState } from "react";
import { ProblemInput } from "@/components/ProblemInput";
import { PaperList } from "@/components/PaperList";
import { ChatPanel } from "@/components/ChatPanel";
import { DR_SHANNON_BIO, STAGE_ERRORS } from "@/lib/prompts";
import type { Corpus, ReadingNote } from "@/lib/types";

// How many papers Dr. Shannon reads at once. Bounded to stay polite to
// arXiv (each read fetches one paper from arxiv.org) while keeping the
// whole reading stage around 40-60s for a 10-paper corpus.
const READ_CONCURRENCY = 4;

// The pipeline runs as a small client-side state machine. Each phase maps
// to exactly one UI state — including its own visible failure state — so
// no stage can ever fail silently. research and specialize are retryable
// on their own; reading degrades per-paper and never hard-fails.
type Phase =
  | { name: "idle" }
  | { name: "researching" }
  | { name: "research_error" }
  | { name: "reading"; done: number; total: number }
  | { name: "specializing" }
  | { name: "specialize_error" }
  | { name: "ready" };

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  // The current problem, kept so the research stage can be retried as-is.
  const [problem, setProblem] = useState("");

  const busy =
    phase.name === "researching" ||
    phase.name === "reading" ||
    phase.name === "specializing";

  // Stage 1 — research. On failure, surface a retryable error rather than
  // letting a thrown request vanish (the production silent-failure bug).
  async function runResearch(p: string) {
    setPhase({ name: "researching" });
    setCorpus(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem: p }),
      });
      if (!res.ok) throw new Error("research failed");
      const researched = (await res.json()) as Corpus;
      setCorpus(researched);
      if (researched.papers.length === 0) {
        setPhase({ name: "ready" });
        return;
      }
      await runReads(researched);
    } catch {
      setPhase({ name: "research_error" });
    }
  }

  // Stage 2 — reading. One api/read per paper, bounded concurrency, live
  // progress. A failed read degrades to an abstract-only note in character,
  // so a single bad paper never sinks the stage; then reading flows
  // straight into specialization.
  async function runReads(base: Corpus) {
    const papers = base.papers;
    setPhase({ name: "reading", done: 0, total: papers.length });

    const notes: ReadingNote[] = new Array(papers.length);
    let done = 0;
    let next = 0;
    async function worker() {
      while (next < papers.length) {
        const i = next++;
        try {
          const res = await fetch("/api/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paper: papers[i] }),
          });
          if (!res.ok) throw new Error("read failed");
          notes[i] = (await res.json()) as ReadingNote;
        } catch {
          notes[i] = {
            arxivId: papers[i].arxivId,
            source: "abstract",
            notes: `Only the abstract made it into my notes for this one — the paper resisted extraction. What it claims: ${papers[i].abstract}`,
          };
        }
        done++;
        setPhase({ name: "reading", done, total: papers.length });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(READ_CONCURRENCY, papers.length) }, worker),
    );

    const read = { ...base, readingNotes: notes };
    setCorpus(read);
    await runSpecialize(read);
  }

  // Stage 3 — specialization. Retryable on its own: the reading notes
  // already exist in `corpus`, so a failure here re-runs just this call.
  async function runSpecialize(base: Corpus) {
    setPhase({ name: "specializing" });
    try {
      const res = await fetch("/api/specialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchQuestion: base.plan.researchQuestion,
          corpus: base.papers.map((p, i) => ({
            title: p.title,
            notes: base.readingNotes![i].notes,
          })),
        }),
      });
      if (!res.ok) throw new Error("specialize failed");
      const { specialization } = (await res.json()) as { specialization: string };
      setCorpus({ ...base, specialization });
      setPhase({ name: "ready" });
    } catch {
      setPhase({ name: "specialize_error" });
    }
  }

  function handleSubmit(p: string) {
    setProblem(p);
    runResearch(p);
  }

  // Chat speaks from the reading notes, so it is available as soon as they
  // exist — even if the (cosmetic) specialization blurb failed.
  const chatReady = corpus?.readingNotes && corpus.readingNotes.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Dr. Shannon</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{DR_SHANNON_BIO}</p>
      </header>

      <ProblemInput disabled={busy} onSubmit={handleSubmit} />

      {phase.name === "researching" && (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          Turning your problem into a research question and searching arXiv...
        </p>
      )}

      {phase.name === "research_error" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-600 dark:text-red-400">{STAGE_ERRORS.research}</p>
          <button
            onClick={() => runResearch(problem)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
          >
            Run it again
          </button>
        </div>
      )}

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

                {phase.name === "reading" && (
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                    Reading the papers — properly, not just the abstracts. {phase.done} of{" "}
                    {phase.total} done...
                  </p>
                )}

                {phase.name === "specializing" && (
                  <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
                    Going back through my notes and working out what they make me qualified to
                    say...
                  </p>
                )}

                {phase.name === "specialize_error" && (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-sm text-red-600 dark:text-red-400">
                      {STAGE_ERRORS.specialize}
                    </p>
                    <button
                      onClick={() => runSpecialize(corpus)}
                      className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium dark:border-zinc-700"
                    >
                      Try that step again
                    </button>
                  </div>
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

              {chatReady && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-lg font-medium">Chat with Dr. Shannon</h2>
                  <ChatPanel
                    researchQuestion={corpus.plan.researchQuestion}
                    papers={corpus.papers}
                    readingNotes={corpus.readingNotes!}
                  />
                </section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
