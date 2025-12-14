import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
};

function estimateTax(income: number): number {
  // Rough placeholder. Replace later with real brackets.
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
  share: number; // 0..1
  amount: number; // dollars
};

type VoteItem = {
  date: string;
  chamber: "house" | "senate";
  billId?: string;
  billTitle?: string;
  question?: string;
  description?: string;
  position: "Yea" | "Nay" | "Not Voting" | "Present";
  rollCall?: string;
  result?: string;
  source: "congress" | "fallback";
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
  // Normalize shares so they sum to 1.00 even if we tweak later
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

function isFundingRelevantText(text: string): boolean {
  const t = text.toLowerCase();

  // “money-moving” keywords
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

  const hasKeyword = keywords.some((k) => t.includes(k));

  // “vote type” cues (kept tight)
  const isPassageish =
    t.includes("on passage") ||
    t.includes("passage") ||
    t.includes("conference report") ||
    t.includes("cloture") ||
    t.includes("motion to proceed") ||
    t.includes("motion");

  return hasKeyword && isPassageish;
}

function toPosition(raw: string): VoteItem["position"] {
  const r = (raw || "").trim().toLowerCase();
  if (r === "yes" || r === "yea") return "Yea";
  if (r === "no" || r === "nay") return "Nay";
  if (r === "present") return "Present";
  return "Not Voting";
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

  // FiveCalls: reps by address/zip
  const url = `https://api.5calls.org/v1/representatives?address=${encodeURIComponent(zip)}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
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
      const chamberText = String(r?.chamber || r?.office || "").toLowerCase();
      const chamber: "house" | "senate" = chamberText.includes("senate") ? "senate" : "house";

      const bioguide =
        r?.bioguide_id ||
        r?.bioguideId ||
        r?.bioguide ||
        r?.id ||
        "";

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
 * Congress.gov API (api.data.gov key)
 * Notes:
 * - Congress.gov API responses vary by endpoint.
 * - This function is defensive: if the endpoint shape is different, it returns [] instead of breaking the app.
 */
async function getFundingVotesForMember(memberId: string): Promise<VoteItem[]> {
  const congressKey = process.env.CONGRESS_GOV_API_KEY;

  if (!congressKey || !memberId) return [];

  // This is the most likely pattern people use for Congress.gov API.
  // If this endpoint 404s in your logs, we will switch to the correct one for the API’s vote data structure.
  const url = `https://api.congress.gov/v3/member/${encodeURIComponent(
    memberId
  )}/votes?format=json&api_key=${encodeURIComponent(congressKey)}`;

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return [];

  const json = await resp.json();

  // Try a few common shapes defensively
  const rawVotes =
    json?.votes ||
    json?.results?.votes ||
    json?.results?.[0]?.votes ||
    json?.memberVotes ||
    [];

  if (!Array.isArray(rawVotes)) return [];

  const mapped: VoteItem[] = rawVotes
    .map((v: any) => {
      const chamberText = String(v?.chamber || v?.vote_chamber || "").toLowerCase();
      const chamber: "house" | "senate" = chamberText.includes("senate") ? "senate" : "house";

      const billId = v?.bill?.bill_id || v?.billId || v?.bill_id;
      const billTitle = v?.bill?.title || v?.billTitle || v?.bill_title;

      const question = v?.question || v?.vote_question;
      const description = v?.description || v?.vote_description;

      const combinedText = `${billTitle || ""} ${description || ""} ${question || ""}`.trim();
      if (!combinedText) return null;

      const position = toPosition(String(v?.position || v?.vote_position || ""));

      return {
        date: String(v?.date || v?.vote_date || ""),
        chamber,
        billId: billId ? String(billId) : undefined,
        billTitle: billTitle ? String(billTitle) : undefined,
        question: question ? String(question) : undefined,
        description: description ? String(description) : undefined,
        position,
        rollCall: v?.roll_call ? String(v.roll_call) : v?.rollCall ? String(v.rollCall) : undefined,
        result: v?.result ? String(v.result) : undefined,
        source: "congress" as const
      };
    })
    .filter(Boolean) as VoteItem[];

  // Funding-relevant filter + cap (Phase 1)
  const filtered = mapped
    .filter((v) => isFundingRelevantText(`${v.billTitle || ""} ${v.description || ""} ${v.question || ""}`))
    .slice(0, 10);

  return filtered;
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

  const representatives: Representative[] = await Promise.all(
    reps.map(async (r) => {
      const votes = await getFundingVotesForMember(r.id);
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
