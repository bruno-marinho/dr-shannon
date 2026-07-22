import type { Paper, ReadingNote } from "@/lib/types";

// A small badge showing HOW Dr. Shannon read each paper — full text vs.
// abstract only. This is a transparency signal, not decoration: the claim
// "he read the papers" is only honest if the exceptions are visible.
function SourceBadge({ source }: { source: ReadingNote["source"] }) {
  const label = source === "abstract" ? "abstract only" : "read in full";
  const styles =
    source === "abstract"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}>{label}</span>
  );
}

export function PaperList({
  papers,
  openedNotes,
}: {
  papers: Paper[];
  // Session note cache, keyed by arXiv ID. A paper gets a badge once
  // Dr. Shannon has opened it for some question — so the badges light up
  // over the conversation, showing exactly which papers he has read.
  openedNotes?: Record<string, ReadingNote>;
}) {
  return (
    <ol className="flex flex-col gap-3">
      {papers.map((paper, i) => {
        const note = openedNotes?.[paper.arxivId];
        return (
          <li
            key={paper.arxivId}
            className="rounded-lg border border-zinc-200 bg-white/60 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium leading-snug">
                <span className="text-zinc-400">[{i + 1}]</span>{" "}
                <a
                  href={paper.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500 dark:decoration-zinc-600"
                >
                  {paper.title}
                </a>
              </p>
              {note && <SourceBadge source={note.source} />}
            </div>
            <p className="mt-1 text-zinc-500 dark:text-zinc-400">
              {paper.authors.join(", ")} · {paper.publishedDate}
            </p>
            <p className="mt-2 leading-6 text-zinc-600 dark:text-zinc-300">{paper.abstract}</p>
          </li>
        );
      })}
    </ol>
  );
}
