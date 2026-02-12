import { NextResponse } from "next/server";
import { dummyProducts } from "@/data/products";

export async function GET() {
  // TODO: Replace with actual backend call
  await new Promise((resolve) => setTimeout(resolve, 400));
  return NextResponse.json(dummyProducts);
}
