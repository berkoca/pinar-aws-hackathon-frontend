import { NextResponse } from "next/server";

const ORDER_URL = "http://34.214.244.193:8000/order";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  try {
    const res = await fetch(`${ORDER_URL}/${sku}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json(json, { status: res.status });
    return NextResponse.json(json);
  } catch {
    return NextResponse.json({ error: "Order request timed out" }, { status: 504 });
  }
}
