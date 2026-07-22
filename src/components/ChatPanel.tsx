"use client";

import { useRef, useState } from "react";
import { STAGE_ERRORS } from "@/lib/prompts";
import type { ChatMessage, Paper, ReadingNote } from "@/lib/types";

// A chat turn. Assistant turns carry the on-demand reading flow: which
// papers Dr. Shannon decided to open (decision), a live phase, and the
// streamed answer (content).
interface Turn {
  role: "user" | "assistant";
  content: string;
  decision?: string;
  opening?: string[];
  phase?: "triaging" | "reading" | "answering" | "done" | "error";
}

// On-demand reading chat. For each question: triage the abstracts to pick
// 1-3 papers, show the reading decision, read the uncached picks in full
// (caching by arXiv ID via onOpenNote), then stream a consulting answer
// grounded in the opened papers' notes.
export function ChatPanel({
  researchQuestion,
  papers,
  openedNotes,
  onOpenNote,
}: {
  researchQuestion: string;
  papers: Paper[];
  // Session note cache, keyed by arXiv ID — a paper read once is never
  // re-read this session.
  openedNotes: Record<string, ReadingNote>;
  onOpenNote: (arxivId: string, note: ReadingNote) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const abstracts = () => papers.map((p) => ({ title: p.title, abstract: p.abstract }));

  // Patch the in-flight assistant turn (always the last turn).
  function patchAssistant(patch: Partial<Turn>) {
    setTurns((cur) => {
      const copy = [...cur];
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch };
      return copy;
    });
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }

  async function send() {
    const question = input.trim();
    if (!question || sending) return;

    // Conversation history for the API calls (user text + prior answers).
    const history: ChatMessage[] = [
      ...turns.map((t) => ({ role: t.role, content: t.content })),
      { role: "user", content: question },
    ];

    setTurns((cur) => [
      ...cur,
      { role: "user", content: question },
      { role: "assistant", content: "", phase: "triaging" },
    ]);
    setInput("");
    setSending(true);

    try {
      // 1. Triage — which papers to open, and why (shown before the answer).
      const triageRes = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, corpus: abstracts() }),
      });
      if (!triageRes.ok) throw new Error("triage failed");
      const { paperNumbers, readingDecision } = (await triageRes.json()) as {
        paperNumbers: number[];
        readingDecision: string;
      };

      patchAssistant({
        decision: readingDecision,
        opening: paperNumbers.map((n) => `[${n}]`),
        phase: paperNumbers.length > 0 ? "reading" : "answering",
      });

      // 2. Read the picked papers not already in the session cache. Start
      // from the current cache and merge in what we read, so the answer
      // call sees fresh notes even before React state settles.
      const localNotes: Record<string, ReadingNote> = { ...openedNotes };
      const toRead = paperNumbers
        .map((n) => papers[n - 1])
        .filter((p): p is Paper => !!p && !localNotes[p.arxivId]);

      await Promise.all(
        toRead.map(async (paper) => {
          let note: ReadingNote;
          try {
            const res = await fetch("/api/read", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paper }),
            });
            if (!res.ok) throw new Error("read failed");
            note = (await res.json()) as ReadingNote;
          } catch {
            note = {
              arxivId: paper.arxivId,
              source: "abstract",
              notes: `Only the abstract made it into my notes for this one — the paper resisted extraction. What it claims: ${paper.abstract}`,
            };
          }
          localNotes[paper.arxivId] = note;
          onOpenNote(paper.arxivId, note); // lift to the corpus badges
        }),
      );

      // 3. Answer — stream a consulting reply grounded in the opened notes.
      patchAssistant({ phase: "answering" });
      const corpus = papers.map((p) => {
        const n = localNotes[p.arxivId];
        return n
          ? { title: p.title, link: p.link, opened: true, text: n.notes }
          : { title: p.title, link: p.link, opened: false, text: p.abstract };
      });

      const ansRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, researchQuestion, corpus }),
      });
      if (!ansRes.ok || !ansRes.body) {
        patchAssistant({ content: STAGE_ERRORS.chat, phase: "error" });
        return;
      }

      const reader = ansRes.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        patchAssistant({ content: acc });
      }
      if (!acc.trim()) patchAssistant({ content: STAGE_ERRORS.chat, phase: "error" });
      else patchAssistant({ phase: "done" });
    } catch {
      patchAssistant({ content: STAGE_ERRORS.chat, phase: "error" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={scrollRef} className="flex max-h-[32rem] flex-col gap-4 overflow-y-auto">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div
              key={i}
              className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-zinc-950 px-3.5 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-950"
            >
              {turn.content}
            </div>
          ) : (
            <div key={i} className="flex max-w-[92%] flex-col gap-2 self-start">
              {turn.phase === "triaging" && (
                <span className="animate-pulse text-xs italic text-zinc-400">
                  Deciding which papers to open…
                </span>
              )}

              {turn.decision && (
                <div className="rounded-lg border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 text-xs italic leading-5 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  {turn.decision}
                  {turn.phase === "reading" && (
                    <span className="animate-pulse"> — opening {turn.opening?.join(", ")}…</span>
                  )}
                </div>
              )}

              {(turn.content || turn.phase === "answering") && (
                <div className="whitespace-pre-line rounded-2xl rounded-bl-sm bg-zinc-100 px-3.5 py-2 text-sm leading-6 dark:bg-zinc-800">
                  {turn.content || (
                    <span className="animate-pulse text-zinc-400">reading my notes…</span>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          placeholder="Ask Dr. Shannon — he'll open the papers your question needs..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Send
        </button>
      </form>
    </div>
  );
}
