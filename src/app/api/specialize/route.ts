import { NextResponse } from "next/server";
import { generateSpecialization } from "@/lib/anthropic";

// Stage 4 of the client-orchestrated pipeline: synthesize Dr. Shannon's
// specialization blurb from his own reading notes (produced by the
// per-paper api/read calls). A separate serverless call so the UI can
// show this stage happening, per the transparency requirement.
export async function POST(request: Request) {
  const { researchQuestion, corpus } = (await request.json()) as {
    researchQuestion?: string;
    corpus?: { title: string; notes: string }[];
  };

  if (!researchQuestion || !corpus || corpus.length === 0) {
    return NextResponse.json(
      { error: "A research question and non-empty reading notes are required." },
      { status: 400 },
    );
  }

  const specialization = await generateSpecialization(researchQuestion, corpus);
  return NextResponse.json({ specialization });
}
