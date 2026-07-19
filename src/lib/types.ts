export interface Paper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  link: string;
  publishedDate: string;
}

export interface ResearchPlan {
  researchQuestion: string;
  searchStrings: string[];
  dateRange: { from: string; to: string };
}

export interface Corpus {
  plan: ResearchPlan;
  papers: Paper[];
  specialization: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
