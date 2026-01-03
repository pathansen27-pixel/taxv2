import { NextRequest, NextResponse } from "next/server";

const USA_BASE = "https://api.usaspending.gov/api/v2";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // You can pass through a USAspending "spending_by_award" or "spending_by_transaction" payload.
  // Recommended: use /search/spending_by_award/ or /search/spending_by_transaction/ depending on UI.
  const endpoint = String(body?.endpoint || "search/spending_by_award/").replace(/^\//, "");

  const payload = body?.payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "payload is required" }, { status: 400 });
  }

  const url = `${USA_BASE}/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return NextResponse.json({ upstreamStatus: res.status, data });
}
