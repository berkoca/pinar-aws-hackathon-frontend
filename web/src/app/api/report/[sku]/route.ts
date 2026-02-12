import { NextResponse } from "next/server";

const REPORTS_BASE = "http://10.214.214.82:8000/reports";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  try {
    const res = await fetch(`${REPORTS_BASE}/${sku}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json(null, { status: res.status });
    const json = await res.json();
    // Response is wrapped in { data: { ... } }
    return NextResponse.json(json.data ?? json);
  } catch {
    return NextResponse.json(null, { status: 504 });
  }
}
