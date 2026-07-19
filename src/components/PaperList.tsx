import type { Paper } from "@/lib/types";

export function PaperList({ papers }: { papers: Paper[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {papers.map((paper, i) => (
        <li
          key={paper.arxivId}
          className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
        >
          <p className="font-medium">
            [{i + 1}]{" "}
            <a href={paper.link} target="_blank" rel="noopener noreferrer" className="underline">
              {paper.title}
            </a>
          </p>
          <p className="text-zinc-500 dark:text-zinc-400">
            {paper.authors.join(", ")} · {paper.publishedDate}
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-300">{paper.abstract}</p>
        </li>
      ))}
    </ol>
  );
}
