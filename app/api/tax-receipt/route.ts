import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
};

type BreakdownItem = {
  code: string;
  name: string;
  share: number;
  amount: number;
};

type VoteItem = {
  date: string;
  chamber: "house" | "senate";
  billId?: string;
  billTitle?: string;
  position: "Yea" | "Nay" | "Not Voting" | "Present";
};

type Representative = {
  id: string;
  name: string;
  chamber: "house" | "senate";
  party: string;
  state?: string;
  district?: string;
  source: "real" | "fallback";
  votes: VoteItem[];
};

function estimateTax(income: number): number {
  const standardDeduction = 14000;
  const taxable = Math.max(0, income - standardDeduction);
  const rate = 0.18;
  return Math.round(taxable * rate);
}

function bucketIncome(income: number): string {
  if (income < 35000) return "0-35k";
  if (income < 60000) return "35k-60k";
  if (income < 100000) return "60k-100k";
  return "100k+";
}

const BUDGET_SHARES: Array<{ code: string; name: string; share: number }> = [
  { code: "650", name: "Social Security", share: 0.24 },
  { code: "570", name: "Medicare", share: 0.15 },
  { code: "551", name: "Health (incl. Medicaid)", share: 0.15 },
  { code: "050", name: "National Defense", share: 0.13 },
  { code: "600", name: "Income Security / Safety Net", share: 0.11 },
  { code: "901", name: "Net Interest on the Debt", share: 0.10 },
  { code: "700", name: "Veterans’ Benefits", share: 0.05 },
  { code: "999", name: "Everything Else", share: 0.07 }
];

function buildBreakdown(estimatedTax: number): BreakdownItem[] {
  const total = BUDGET_SHARES.reduce((sum, b) => sum + b.share, 0);

  return BUDGET_SHARES.map((b) => {
    const s = b.share / total;
    return {
      code: b.code,
      name: b.name,
      share: Math.round(s * 10000) / 10000,
      amount: Math.round(estimatedTax * s * 100) / 100
    };
  });
}

async function getRepsForZip(zip: string): Promise<{
  reps: Representative[];
  repsSource: "real" | "fallback";
  repsError?: string;
}> {
  const token = (process.env.FIVECALLS_TOKEN || "").trim();

  if (!token) {
    return {
      reps: [
        {
          id: "H001",
          name: "Rep Example",
          chamber: "house",
          party: "D",
          source: "fallback",
          votes: []
        }
      ],
      repsSource: "fallback",
      repsError:
        "Missing FIVECALLS_TOKEN on server (Vercel env var). Add it to Production and redeploy."
    };
  }

  const url = `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Token ${token}`
    },
    cache: "no-store"
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      reps: [
        {
          id: "H001",
          name: "Rep Example",
          chamber: "house",
          party: "D",
          source: "fallback",
          votes: []
        }
      ],
      repsSource: "fallback",
      repsError: `FiveCalls failed: ${resp.status} ${resp.statusText}${
        text ? ` | ${text.slice(0, 200)}` : ""
      }`
    };
  }

  const data = await resp.json();

  const reps: Representative[] = (data?.representatives || [])
    .map((r: any) => {
      const chamber =
        (r?.chamber || r?.office || "").toLowerCase().includes("senate")
          ? "senate"
          : "house";

      return {
        id: String(r?.bioguide_id || r?.id || "").trim(),
        name: String(r?.name || "").trim(),
        chamber,
        party: String(r?.party || "").trim(),
        state: r?.state ? String(r.state) : undefined,
        district: r?.district ? String(r.district) : undefined,
        source: "real",
        votes: []
      };
    })
    .filter((x: Representative) => x.name);

  if (!reps.length) {
    return {
      reps: [
        {
          id: "H001",
          name: "Rep Example",
          chamber: "house",
          party: "D",
          source: "fallback",
          votes: []
        }
      ],
      repsSource: "fallback",
      repsError: "FiveCalls returned no representatives for that ZIP/address."
    };
  }

  return { reps, repsSource: "real" };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;
  const income = Number(body.income);
  const zip = String(body.zip || "").trim();

  if (!income || !zip) {
    return NextResponse.json(
      { error: "income and zip are required" },
      { status: 400 }
    );
  }

  const estimatedTax = estimateTax(income);
  const incomeBucket = bucketIncome(income);
  const breakdown = buildBreakdown(estimatedTax);

  const { reps, repsSource, repsError } = await getRepsForZip(zip);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    representatives: reps,
    repsSource,
    repsError
  });
}
