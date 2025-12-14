import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
};

function estimateTax(income: number): number {
  // Rough estimator for Phase 1; we refine later.
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
  share: number;
  amount: number;
};

type VoteItem = {
  date: string;
  chamber: "house" | "senate";
  question?: string;
  description?: string;
  billId?: string;
  billTitle?: string;
  position: "Yea" | "Nay" | "Not Voting" | "Present";
  rollCall?: string;
  result?: string;
};

type Representative = {
  id: string; // bioguide preferred (needed for ProPublica)
  name: string;
  chamber: "house" | "senate";
  party: string;
  state?: string;
  district?: string;
  source: "real" | "fallback";
  votes: VoteItem[];
};

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
  // Guardrail: normalize shares to 1.0
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

function isFundingRelevantVote(v: any): boolean {
  const text = `${v?.description || ""} ${v?.question || ""} ${v?.bill?.title || ""}`
    .toLowerCase()
    .trim();

  // Keep Phase 1 tight to “money moving” items
  const keywords = [
    "appropriation",
    "appropriations",
    "continuing resolution",
    "continuing appropriations",
    "budget",
    "spending",
    "funding",
    "authorization",
    "supplemental"
  ];

  const hasKeyword = keywords.some((k) => text.includes(k));

  const isPassageish =
    text.includes("on passage") ||
    text.includes("passage") ||
    text.includes("conference report") ||
    text.includes("cloture") ||
    text.includes("on the motion");

  return hasKeyword && isPassageish;
}

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const token = process.env.FIVECALLS_TOKEN;

  if (!token) {
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

  // 5calls expects `location` and header `X-5Calls-Token`
  const url = `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`;

  const resp = await fetch(url, {
    headers: {
      "X-5Calls-Token": token
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
        String(r?.chamber || "").toLowerCase().includes("senate") ? "senate" : "house";

      // ProPublica endpoint needs bioguide id, so prioritize it
      const bioguide = String(r?.bioguide_id || "").trim();

      return {
        id: bioguide || String(r?.id || "").trim(),
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

  return reps.length > 0
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

async function getFundingVotesForMember(memberId: string): Promise<VoteItem[]> {
  const propublicaKey = process.env.PROPUBLICA_API_KEY;

  // Votes won’t show unless this is set
  if (!propublicaKey || !memberId) return [];

  const url = `https://api.propublica.org/congress/v1/members/${encodeURIComponent(
    memberId
  )}/votes.json`;

  const resp = await fetch(url, {
    headers: {
      "X-API-Key": propublicaKey
    },
    cache: "no-store"
  });

  if (!resp.ok) return [];

  const json = await resp.json();
  const votes = json?.results?.[0]?.votes || [];

  // Funding-relevant only, latest 10
  const filtered = votes.filter((v: any) => isFundingRelevantVote(v)).slice(0, 10);

  return filtered.map((v: any) => {
    const chamber = (String(v?.chamber || "").toLowerCase() === "senate" ? "senate" : "house") as
      | "house"
      | "senate";

    const positionRaw = String(v?.position || "").trim();
    const position =
      positionRaw === "Yes" || positionRaw === "Yea"
        ? "Yea"
        : positionRaw === "No" || positionRaw === "Nay"
          ? "Nay"
          : positionRaw === "Present"
            ? "Present"
            : "Not Voting";

    return {
      date: String(v?.date || ""),
      chamber,
      question: v?.question ? String(v.question) : undefined,
      description: v?.description ? String(v.description) : undefined,
      billId: v?.bill?.bill_id ? String(v.bill.bill_id) : undefined,
      billTitle: v?.bill?.title ? String(v.bill.title) : undefined,
      position,
      rollCall: v?.roll_call ? String(v.roll_call) : undefined,
      result: v?.result ? String(v.result) : undefined,
      position
    };
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;
  const income = Number(body.income);
  const zip = String(body.zip || "").trim();

  if (!income || !zip) {
    return NextResponse.json({ error: "income and zip are required" }, { status: 400 });
  }

  const estimatedTax = estimateTax(income);
  const incomeBucket = bucketIncome(income);
  const breakdown = buildBreakdown(estimatedTax);

  const reps = await getRepsForZip(zip);

  // Attach vote history (funding-relevant only)
  const representatives: Representative[] = await Promise.all(
    reps.map(async (r) => {
      const votes = await getFundingVotesForMember(r.id);
      return {
        ...r,
        votes
      };
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
