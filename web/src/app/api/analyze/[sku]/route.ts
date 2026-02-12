import { NextResponse } from "next/server";

const ANALYZE_URL = "http://10.214.214.82:8000/analyze";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  try {
    const res = await fetch(ANALYZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "Analysis timed out" }, { status: 504 });
  }
}
