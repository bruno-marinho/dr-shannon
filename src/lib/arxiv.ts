import { XMLParser } from "fast-xml-parser";
import type { Paper } from "@/lib/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";

// arXiv asks API clients to send a descriptive User-Agent and to keep the
// request rate modest. Anonymous/default clients get throttled harder, so
// identify ourselves.
const ARXIV_HEADERS = {
  "User-Agent": "Dr-Shannon/1.0 (+https://dr-shannon.vercel.app) research-assistant demo",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetches from arXiv with one polite retry on rate-limit / transient
// errors (429 Too Many Requests, 503 Service Unavailable), honoring the
// Retry-After header when arXiv sends one. arXiv rate-limits by request
// rate, so retrying immediately makes a 429 worse — we wait first.
async function fetchArxiv(url: URL): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: ARXIV_HEADERS,
      signal: AbortSignal.timeout(15000),
    });
    if ((res.status !== 429 && res.status !== 503) || attempt >= 1) {
      return res;
    }
    // Back off before the single retry. Respect Retry-After if present,
    // otherwise use arXiv's suggested ~3s spacing; cap so we never approach
    // the function timeout.
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter : 3, 5) * 1000);
  }
}

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

  // arXiv can be slow or rate-limit under load; fetchArxiv adds a timeout
  // and one polite backoff-retry on 429/503. A failure here surfaces as a
  // stage error the user can retry, not a silent hang.
  const res = await fetchArxiv(url);
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status}`);
  }

  const xml = await res.text();
  const feed = parser.parse(xml)?.feed;
  const entries: ArxivEntry[] = toArray(feed?.entry);

  return entries.map(parseEntry);
}
