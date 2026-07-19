import { XMLParser } from "fast-xml-parser";
import type { Paper } from "@/lib/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

// arXiv's Lucene-backed search only accepts dates as YYYYMMDDHHMM (12
// digits, no separators) inside a submittedDate:[from TO to] range clause.
function formatArxivDate(isoDate: string, endOfDay: boolean): string {
  const digits = isoDate.replaceAll("-", "");
  return `${digits}${endOfDay ? "2359" : "0000"}`;
}

// Combines the search strings with OR (any one matching is a candidate)
// and ANDs in the submitted-date range. Each search string is quoted as a
// phrase against the "all fields" index — arXiv's query language requires
// uppercase AND/OR/ANDNOT and rejects unquoted multi-word terms.
function buildSearchQuery(
  searchStrings: string[],
  dateRange: { from: string; to: string },
): string {
  const terms = searchStrings.map((s) => `all:"${s}"`).join(" OR ");
  const from = formatArxivDate(dateRange.from, false);
  const to = formatArxivDate(dateRange.to, true);
  return `(${terms}) AND submittedDate:[${from} TO ${to}]`;
}

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  published: string;
  author?: { name: string } | { name: string }[];
  link?: { "@_href": string; "@_rel": string; "@_type"?: string } | { "@_href": string; "@_rel": string; "@_type"?: string }[];
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseEntry(entry: ArxivEntry): Paper {
  // entry.id looks like "http://arxiv.org/abs/2301.01234v2" — strip the
  // version suffix so re-runs of the same paper collapse to one arxivId.
  const arxivId = entry.id.replace(/^.*\/abs\//, "").replace(/v\d+$/, "");
  const links = toArray(entry.link);
  const absLink =
    links.find((l) => l["@_rel"] === "alternate")?.["@_href"] ?? `https://arxiv.org/abs/${arxivId}`;

  return {
    arxivId,
    title: entry.title.replace(/\s+/g, " ").trim(),
    authors: toArray(entry.author).map((a) => a.name),
    abstract: entry.summary.replace(/\s+/g, " ").trim(),
    link: absLink,
    publishedDate: entry.published.slice(0, 10),
  };
}

const parser = new XMLParser({ ignoreAttributes: false });

// Searches arXiv for the given search strings within a date range and
// returns raw candidate papers (unranked, unfiltered — see lib/relevance.ts
// for turning this into the final top-10). Returns an empty array, not an
// error, when arXiv has nothing in range: an over-narrow query is an
// expected outcome the caller needs to handle, not a failure.
export async function searchArxiv(
  searchStrings: string[],
  dateRange: { from: string; to: string },
  maxResults = 30,
): Promise<Paper[]> {
  const searchQuery = buildSearchQuery(searchStrings, dateRange);
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", searchQuery);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "relevance");
  url.searchParams.set("sortOrder", "descending");

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}`);
  }

  const xml = await res.text();
  const feed = parser.parse(xml)?.feed;
  const entries: ArxivEntry[] = toArray(feed?.entry);

  return entries.map(parseEntry);
}
