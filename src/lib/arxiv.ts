import { XMLParser } from "fast-xml-parser";
import type { Paper } from "@/lib/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

// arXiv's Lucene-backed search only accepts dates as YYYYMMDDHHMM (12
// digits, no separators) inside a submittedDate:[from TO to] range clause.
function formatArxivDate(isoDate: string, endOfDay: boolean): string {
  const digits = isoDate.replaceAll("-", "");
  return `${digits}${endOfDay ? "2359" : "0000"}`;
}

// A search string is a flat boolean expression of short terms joined by
// uppercase AND/OR (the format contract enforced by the prompt in
// prompts.ts). Split it into just the terms, e.g. for relevance scoring.
export function termsOf(searchString: string): string[] {
  return searchString
    .split(/\s+(?:AND|OR)\s+/)
    .map((t) => t.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

// Turns one flat search string ("hallucination detection AND customer
// support") into arXiv query syntax: each term becomes a quoted phrase
// against the all-fields index, operators pass through. arXiv requires
// uppercase AND/OR and rejects unquoted multi-word terms.
function fieldedExpression(searchString: string): string {
  return searchString
    .split(/\s+(AND|OR)\s+/)
    .map((part) =>
      part === "AND" || part === "OR" ? part : `all:"${part.trim().replace(/^"|"$/g, "")}"`,
    )
    .join(" ");
}

function buildSearchQuery(
  searchString: string,
  categories: string[],
  dateRange: { from: string; to: string },
): string {
  const clauses = [`(${fieldedExpression(searchString)})`];

  if (categories.length > 0) {
    clauses.push(`(${categories.map((c) => `cat:${c}`).join(" OR ")})`);
  }

  const from = formatArxivDate(dateRange.from, false);
  const to = formatArxivDate(dateRange.to, true);
  clauses.push(`submittedDate:[${from} TO ${to}]`);

  return clauses.join(" AND ");
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

// Runs ONE rung of the search ladder: a single search string, scoped by
// category and date range. Returns raw candidates (unranked — see
// lib/relevance.ts). Returns an empty array, not an error, when nothing
// matches: a too-narrow rung is an expected outcome the caller handles by
// falling through to the next, broader rung.
export async function searchArxiv(
  searchString: string,
  categories: string[],
  dateRange: { from: string; to: string },
  maxResults = 30,
): Promise<Paper[]> {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", buildSearchQuery(searchString, categories, dateRange));
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", "relevance");
  url.searchParams.set("sortOrder", "descending");

  // arXiv can be slow under load; give it room before aborting. A timeout
  // here surfaces as a stage error the user can retry, not a silent hang.
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}`);
  }

  const xml = await res.text();
  const feed = parser.parse(xml)?.feed;
  const entries: ArxivEntry[] = toArray(feed?.entry);

  return entries.map(parseEntry);
}
