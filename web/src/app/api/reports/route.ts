import { NextResponse } from "next/server";

const REPORTS_URL = "http://34.214.244.193:8000/reports";

export async function GET() {
  try {
    const res = await fetch(REPORTS_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return NextResponse.json([], { status: res.status });
    const json = await res.json();
    return NextResponse.json(json.data ?? json);
  } catch {
    return NextResponse.json([], { status: 504 });
  }
}
