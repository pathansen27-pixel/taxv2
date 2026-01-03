import { NextRequest, NextResponse } from "next/server";

const USA_BASE = "https://api.usaspending.gov/api/v2";

type RiskFlag = {
  kind: string;
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Record<string, any>;
};

function pctChange(prev: number, next: number): number {
  if (prev === 0) return next === 0 ? 0 : 999;
  return ((next - prev) / prev) * 100;
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Minimal inputs
  const agencyId = String(body?.agencyId || "").trim(); // optional
  const naics = String(body?.naics || "").trim();       // optional
  const psc = String(body?.psc || "").trim();           // optional
  const fy = Number(body?.fiscalYear || new Date().getUTCFullYear());

  if (!agencyId && !naics && !psc) {
    return NextResponse.json(
      { error: "Provide at least one of agencyId, naics, psc" },
      { status: 400 }
    );
  }

  // Pull spending by award for two windows to detect spikes
  const mkFilters = (year: number) => {
    const filters: any = {
      time_period: [{ start_date: `${year}-01-01`, end_date: `${year}-12-31` }]
    };

    // USAspending uses agency filter structures that can be expanded later
    if (agencyId) {
      filters.agencies = [{ type: "awarding", tier: "toptier", name: agencyId }];
    }
    if (naics) filters.naics_codes = [naics];
    if (psc) filters.psc_codes = [psc];

    return filters;
  };

  const payloadThis = {
    filters: mkFilters(fy),
    group: "recipient_parent_name",
    subawards: false,
    page: 1,
    limit: 100,
    order: "desc",
    sort: "aggregated_amount"
  };

  const payloadPrev = {
    ...payloadThis,
    filters: mkFilters(fy - 1)
  };

  const [resThis, resPrev] = await Promise.all([
    fetch(`${USA_BASE}/search/spending_by_award/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadThis)
    }),
    fetch(`${USA_BASE}/search/spending_by_award/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadPrev)
    })
  ]);

  const dataThis = await resThis.json();
  const dataPrev = await resPrev.json();

  const rowsThis: any[] = Array.isArray(dataThis?.results) ? dataThis.results : [];
  const rowsPrev: any[] = Array.isArray(dataPrev?.results) ? dataPrev.results : [];

  const prevMap = new Map<string, number>();
  rowsPrev.forEach((r) => {
    const k = String(r?.recipient_parent_name || "Unknown");
    const amt = Number(r?.aggregated_amount || 0);
    prevMap.set(k, amt);
  });

  // Compute flags
  const flags: RiskFlag[] = [];

  // 1) Concentration risk: top 1 share of top 10
  const top10 = rowsThis.slice(0, 10);
  const sumTop10 = top10.reduce((a, r) => a + Number(r?.aggregated_amount || 0), 0);
  const top1 = top10[0] ? Number(top10[0]?.aggregated_amount || 0) : 0;
  if (sumTop10 > 0) {
    const share = (top1 / sumTop10) * 100;
    if (share >= 60) {
      flags.push({
        kind: "vendor_concentration",
        severity: "high",
        description: "Top recipient represents a very large share of the top 10 spend for the selected filter.",
        evidence: { top1, sumTop10, sharePct: Math.round(share * 10) / 10, topRecipient: top10[0]?.recipient_parent_name }
      });
    } else if (share >= 40) {
      flags.push({
        kind: "vendor_concentration",
        severity: "medium",
        description: "Top recipient represents a large share of the top 10 spend for the selected filter.",
        evidence: { top1, sumTop10, sharePct: Math.round(share * 10) / 10, topRecipient: top10[0]?.recipient_parent_name }
      });
    }
  }

  // 2) Sudden growth: recipients with big YoY jump
  rowsThis.slice(0, 50).forEach((r) => {
    const name = String(r?.recipient_parent_name || "Unknown");
    const amt = Number(r?.aggregated_amount || 0);
    const prev = prevMap.get(name) || 0;
    const chg = pctChange(prev, amt);

    if (amt >= 5_000_000 && chg >= 300) {
      flags.push({
        kind: "sudden_growth",
        severity: "high",
        description: "Recipient spend increased sharply year over year within the selected filter.",
        evidence: { recipient: name, prev, current: amt, pctChange: Math.round(chg) }
      });
    } else if (amt >= 2_000_000 && chg >= 150) {
      flags.push({
        kind: "sudden_growth",
        severity: "medium",
        description: "Recipient spend increased materially year over year within the selected filter.",
        evidence: { recipient: name, prev, current: amt, pctChange: Math.round(chg) }
      });
    }
  });

  // 3) Year end clustering proxy: requires transaction view, so we provide a to do hint
  flags.push({
    kind: "year_end_clustering",
    severity: "low",
    description: "To detect year end award clustering, use spending_by_transaction with award dates grouped by month.",
    evidence: { recommendedEndpoint: "search/spending_by_transaction/" }
  });

  return NextResponse.json({
    upstreamStatus: { thisYear: resThis.status, prevYear: resPrev.status },
    context: { agencyId: agencyId || null, naics: naics || null, psc: psc || null, fiscalYear: fy },
    flags,
    topRecipientsThisYear: rowsThis.slice(0, 25)
  });
}
