"use client";

import { useState } from "react";
import { ProblemInput } from "@/components/ProblemInput";
import { PaperList } from "@/components/PaperList";
import { ChatPanel } from "@/components/ChatPanel";
import { PipelineStatus, type Phase } from "@/components/PipelineStatus";
import { DR_SHANNON_BIO, skimNote, thinCorpusNote } from "@/lib/prompts";
import type { Corpus, ReadingNote } from "@/lib/types";

// A corpus with fewer than this many papers gets a "the frontier is thin
// here" line — the same threshold the specialization prompt treats as small.
const THIN_CORPUS = 5;

// A consistent section wrapper: a quiet uppercase eyebrow over its content,
// so the page reads like a structured document rather than a stack of divs.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [corpus, setCorpus] = useState<Corpus | null>(null);
  // The current problem, kept so the research stage can be retried as-is.
  const [problem, setProblem] = useState("");
  // Session note cache, keyed by arXiv ID: papers Dr. Shannon has opened in
  // full for some question. Lifted here so the corpus badges light up as
  // the conversation opens papers. A paper is never re-read once cached.
  const [openedNotes, setOpenedNotes] = useState<Record<string, ReadingNote>>({});

  const busy = phase.name === "researching" || phase.name === "specializing";

  // Stage 1 — research (translate + arXiv search). On failure, a retryable
  // error rather than a silently-swallowed request.
  async function runResearch(p: string) {
    setPhase({ name: "researching" });
    setCorpus(null);
    setOpenedNotes({});
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
      await runSpecialize(researched);
    } catch {
      setPhase({ name: "research_error" });
    }
  }

  // Stage 2 — skim. Synthesize the first-impressions blurb from the
  // ABSTRACTS (no paper is read in full here; that happens on demand in
  // chat). Retryable on its own.
  async function runSpecialize(base: Corpus) {
    setPhase({ name: "specializing" });
    try {
      const res = await fetch("/api/specialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchQuestion: base.plan.researchQuestion,
          corpus: base.papers.map((p) => ({ title: p.title, abstract: p.abstract })),
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

  // A paper Dr. Shannon opened during chat — cache it (never overwrite; a
  // paper is read once per session) so its badge lights up in the corpus.
  function addNote(arxivId: string, note: ReadingNote) {
    setOpenedNotes((cur) => (cur[arxivId] ? cur : { ...cur, [arxivId]: note }));
  }

  // Chat works from abstracts + on-demand reads, so it opens once the
  // corpus exists and the skim has settled (succeeded, or failed but
  // retryable — the papers are there either way).
  const chatReady =
    corpus &&
    corpus.papers.length > 0 &&
    (phase.name === "ready" || phase.name === "specialize_error");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Dr. Shannon</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{DR_SHANNON_BIO}</p>
      </header>

      <ProblemInput disabled={busy} onSubmit={handleSubmit} />

      <PipelineStatus
        phase={phase}
        onRetryResearch={() => runResearch(problem)}
        onRetrySpecialize={() => corpus && runSpecialize(corpus)}
      />

      {corpus && (
        <>
          <Section title="Research question">
            <p className="text-sm leading-6 text-zinc-700 dark:text-zinc-200">
              {corpus.plan.researchQuestion}
            </p>
            <p className="text-sm italic leading-6 text-zinc-500 dark:text-zinc-400">
              {corpus.plan.rationale}
            </p>
          </Section>

          <Section title="Search trail">
            <ol className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              {corpus.attempts.map((attempt, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  {attempt.shannonComment && (
                    <span className="italic text-zinc-500 dark:text-zinc-400">
                      “{attempt.shannonComment}”
                    </span>
                  )}
                  <span>
                    <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                      {attempt.searchString}
                    </code>{" "}
                    <span className="text-zinc-400">→</span> {attempt.resultCount} result
                    {attempt.resultCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          {corpus.papers.length === 0 ? (
            <Section title="Corpus">
              <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Even the broadest search found nothing on arXiv — the problem may sit outside
                the corpus&apos;s strengths. Try rephrasing toward the technical side of it.
              </p>
            </Section>
          ) : (
            <>
              {corpus.specialization && (
                <Section title="This session's specialization">
                  <p className="whitespace-pre-line text-sm leading-6 text-zinc-700 dark:text-zinc-200">
                    {corpus.specialization}
                  </p>
                </Section>
              )}

              <Section title={`Corpus · ${corpus.papers.length} papers`}>
                {corpus.papers.length < THIN_CORPUS && (
                  <p className="text-sm italic leading-6 text-amber-700 dark:text-amber-400">
                    {thinCorpusNote(corpus.papers.length)}
                  </p>
                )}
                {phase.name === "ready" && (
                  <p className="text-sm italic leading-6 text-zinc-500 dark:text-zinc-400">
                    {skimNote(corpus.papers.length)}
                  </p>
                )}
                <PaperList papers={corpus.papers} openedNotes={openedNotes} />
              </Section>

              {chatReady && (
                <Section title="Chat with Dr. Shannon">
                  <ChatPanel
                    researchQuestion={corpus.plan.researchQuestion}
                    papers={corpus.papers}
                    openedNotes={openedNotes}
                    onOpenNote={addNote}
                  />
                </Section>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
