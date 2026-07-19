import type { Paper } from "@/lib/types";

// Simple term-overlap scoring — deliberately not semantic/embedding-based
// (out of scope for this MVP). Splits each search string into words and
// counts how many times they appear in the title (weighted higher, since
// title matches are a stronger relevance signal) and abstract.
function scorePaper(paper: Paper, terms: string[]): number {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();

  return terms.reduce((score, term) => {
    const titleMatches = title.split(term).length - 1;
    const abstractMatches = abstract.split(term).length - 1;
    return score + titleMatches * 3 + abstractMatches;
  }, 0);
}

function uniqueTerms(searchStrings: string[]): string[] {
  const words = searchStrings.flatMap((s) => s.toLowerCase().split(/\s+/));
  return [...new Set(words)].filter((w) => w.length > 2);
}

// Ranks candidate papers by relevance to the search strings and returns
// the top `limit`, deduplicated by arxivId (the same paper can surface
// from more than one OR'd search string).
export function rankByRelevance(papers: Paper[], searchStrings: string[], limit = 10): Paper[] {
  const terms = uniqueTerms(searchStrings);

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
