"use client";

import { useRef, useState } from "react";
import { STAGE_ERRORS } from "@/lib/prompts";
import type { ChatMessage, Paper, ReadingNote } from "@/lib/types";

// Chat grounded in Dr. Shannon's reading notes. The corpus context (paper
// titles, links, and his notes) is sent with every turn — the API is
// stateless and the notes are what he speaks from.
export function ChatPanel({
  researchQuestion,
  papers,
  readingNotes,
}: {
  researchQuestion: string;
  papers: Paper[];
  readingNotes: ReadingNote[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    // Add an empty assistant turn to stream into.
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setSending(true);

    // Replaces the streaming assistant turn's content as tokens arrive.
    const setAssistant = (content: string) =>
      setMessages([...history, { role: "assistant", content }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          researchQuestion,
          corpus: papers.map((p, i) => ({
            title: p.title,
            link: p.link,
            notes: readingNotes[i].notes,
          })),
        }),
      });

      if (!res.ok || !res.body) {
        setAssistant(STAGE_ERRORS.chat);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setAssistant(acc);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
      // A stream that closed with nothing (mid-flight failure) still owes
      // the user an honest line rather than an empty bubble.
      if (!acc.trim()) setAssistant(STAGE_ERRORS.chat);
    } catch {
      setAssistant(STAGE_ERRORS.chat);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div ref={scrollRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "max-w-[85%] self-end rounded-2xl rounded-br-sm bg-zinc-950 px-3.5 py-2 text-sm text-white dark:bg-zinc-50 dark:text-zinc-950"
                : "max-w-[90%] self-start whitespace-pre-line rounded-2xl rounded-bl-sm bg-zinc-100 px-3.5 py-2 text-sm leading-6 dark:bg-zinc-800"
            }
          >
            {m.content ? (
              m.content
            ) : (
              <span className="inline-block animate-pulse text-zinc-400">reading my notes…</span>
            )}
          </div>
        ))}
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
          placeholder="Ask Dr. Shannon about the papers he read..."
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
