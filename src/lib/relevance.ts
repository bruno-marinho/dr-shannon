import { termsOf } from "@/lib/arxiv";
import type { Paper } from "@/lib/types";

// Simple term-overlap scoring — deliberately not semantic/embedding-based
// (out of scope for this MVP). Splits the search string into its boolean
// terms, then into words, and counts how many times they appear in the
// title (weighted higher, since title matches are a stronger relevance
// signal) and abstract.
function scorePaper(paper: Paper, words: string[]): number {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();

  return words.reduce((score, word) => {
    const titleMatches = title.split(word).length - 1;
    const abstractMatches = abstract.split(word).length - 1;
    return score + titleMatches * 3 + abstractMatches;
  }, 0);
}

function uniqueWords(searchString: string): string[] {
  const words = termsOf(searchString).flatMap((t) => t.toLowerCase().split(/\s+/));
  return [...new Set(words)].filter((w) => w.length > 2);
}

// Ranks candidate papers by relevance to the search string and returns
// the top `limit`, deduplicated by arxivId.
export function rankByRelevance(papers: Paper[], searchString: string, limit = 10): Paper[] {
  const terms = uniqueWords(searchString);

  const seen = new Set<string>();
  const deduped = papers.filter((p) => {
    if (seen.has(p.arxivId)) return false;
    seen.add(p.arxivId);
    return true;
  });

  return deduped
    .map((paper) => ({ paper, score: scorePaper(paper, terms) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ paper }) => paper);
}
