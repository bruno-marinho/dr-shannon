import { NextResponse } from "next/server";
import { generateSpecialization } from "@/lib/anthropic";
import type { Paper } from "@/lib/types";

// Stage 3 of the client-orchestrated pipeline: synthesize Dr. Shannon's
// specialization blurb from the assembled corpus. A separate serverless
// call (rather than part of api/research) so each function stays well
// inside the Hobby-plan timeout — and so the UI can show this stage
// happening, per the transparency requirement.
export async function POST(request: Request) {
  const { researchQuestion, papers } = (await request.json()) as {
    researchQuestion?: string;
    papers?: Paper[];
  };

  if (!researchQuestion || !papers || papers.length === 0) {
    return NextResponse.json(
      { error: "A research question and a non-empty corpus are required." },
      { status: 400 },
    );
  }

  const specialization = await generateSpecialization(researchQuestion, papers);
  return NextResponse.json({ specialization });
}
