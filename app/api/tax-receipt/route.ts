import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
};

function estimateTax(income: number): number {
  // Rough estimator for now
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

type BreakdownItem = {
  code: string;
  name: string;
  share: number; // normalized (sums to 1)
  amount: number;
};

type VoteItem = {
  date: string;
  chamber: "house" | "senate";
  billId?: string;
  billTitle?: string;
  description?: string;
  position: "Yea" | "Nay" | "Not Voting" | "Present";
  rollCall?: string;
  result?: string;
};

type Representative = {
  id: string; // bioguide preferred
  name: string;
  chamber: "house" | "senate";
  party: string;
  state?: string;
  district?: string;
  source: "real" | "fallback";
  votes: VoteItem[];
};

// Budget categories (shares will be normalized to 1.00)
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
  const shareSum = BUDGET_SHARES.reduce((acc, x) => acc + x.share, 0);
  const normalized = BUDGET_SHARES.map((x) => ({
    ...x,
    share: x.share / shareSum
  }));

  return normalized.map((item) => ({
    code: item.code,
    name: item.name,
    share: Math.round(item.share * 10000) / 10000,
    amount: Math.round(estimatedTax * item.share * 100) / 100
  }));
}

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const token = process.env.FIVECALLS_TOKEN;

  // If token not set, return fallback so UI still works
  if (!token) {
    return [
      {
        id: "H001",
        name: "Rep Example",
        chamber: "house",
        party: "D",
        source: "fallback",
        votes: []
      },
      {
        id: "S001",
        name: "Senator One",
        chamber: "senate",
        party: "R",
        source: "fallback",
        votes: []
      },
      {
        id: "S002",
        name: "Senator Two",
        chamber: "senate",
        party: "D",
        source: "fallback",
        votes: []
      }
    ];
  }

  // FiveCalls reps-by-address endpoint (ZIP works as an address string)
  const url = `https://api.5calls.org/v1/representatives?address=${encodeURIComponent(zip)}`;

  const resp = await fetch(url, {
    headers: {
      // Some deployments accept Authorization, some accept X-API-Key.
      // Sending both is safe.
      Authorization: `Token ${token}`,
      "X-API-Key": token
    },
    cache: "no-store"
  });

  if (!resp.ok) {
    return [
      {
        id: "H001",
        name: "Rep Example",
        chamber: "house",
        party: "D",
        source: "fallback",
        votes: []
      }
    ];
  }

  const data = await resp.json();

  const reps: Representative[] = (data?.representatives || [])
    .map((r: any) => {
      const chamber =
        (r?.chamber || r?.office || "").toLowerCase().includes("senate")
          ? "senate"
          : "house";

      const bioguide =
        r?.bioguide_id || r?.bioguideId || r?.bioguide || r?.id || "";

      return {
        id: String(bioguide || "").trim(),
        name: String(r?.name || "").trim(),
        chamber,
        party: String(r?.party || "").trim(),
        state: r?.state ? String(r.state) : undefined,
        district: r?.district ? String(r.district) : undefined,
        source: "real",
        votes: []
      };
    })
    .filter((r: Representative) => r.name);

  return reps.length
    ? reps
    : [
        {
          id: "H001",
          name: "Rep Example",
          chamber: "house",
          party: "D",
          source: "fallback",
          votes: []
        }
      ];
}

/**
 * Voting history step (next):
 * Congress.gov is excellent for bill metadata/status, but per-member vote positions are easiest
 * via roll-call sources (House Clerk + Senate LIS), or a dedicated votes API.
 *
 * For now we return empty votes so reps always render.
 */
async function getVotesForMember(_memberId: string): Promise<VoteItem[]> {
  return [];
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

  const reps = await getRepsForZip(zip);

  const representatives: Representative[] = await Promise.all(
    reps.map(async (r) => {
      const votes = await getVotesForMember(r.id);
      return { ...r, votes };
    })
  );

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    representatives
  });
}
