import { NextRequest, NextResponse } from "next/server";
import { dummyPredictions } from "@/data/dummy";

export async function POST(req: NextRequest) {
  const { product_ids } = (await req.json()) as { product_ids: string[] };

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  // TODO: Replace with actual backend call
  const results = dummyPredictions.filter((p) =>
    product_ids.includes(p.product_id)
  );

  return NextResponse.json(results);
}
