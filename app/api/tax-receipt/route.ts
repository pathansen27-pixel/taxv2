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
  question?: string;
  description?: string;
  billId?: string;
  billTitle?: string;
  position: "Yea" | "Nay" | "Not Voting" | "Present";
  rollCall?: string;
  result?: string;
  source?: "congress";
  url?: string;
};

type Representative = {
  id: string; // bioguide if available
  name: string;
  chamber: "house" | "senate";
  party: string;
  state?: string;
  district?: string;
  source: "real" | "fallback";
  votes: VoteItem[];
};

function estimateTax(income: number): number {
  // Simple estimator (replace later with brackets).
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

function safeText(x: unknown): string {
  return typeof x === "string" ? x : "";
}

function isFundingRelevantText(text: string): boolean {
  const t = text.toLowerCase();

  const keywords = [
    "appropriation",
    "appropriations",
    "continuing resolution",
    "continuing appropriations",
    "budget",
    "spending",
    "funding",
    "authorization",
    "supplemental",
    "conference report",
    "omnibus"
  ];

  return keywords.some((k) => t.includes(k));
}

/**
 * FiveCalls reps-by-zip
 * - tries location=ZIP then address=ZIP
 * - uses X-API-Key header
 */
async function getRepsForZip(zip: string): Promise<{
  reps: Representative[];
  source: "real" | "fallback";
  error?: string;
}> {
  const apiKey = process.env.FIVECALLS_TOKEN;

  if (!apiKey) {
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
      source: "fallback",
      error: "Missing FIVECALLS_TOKEN"
    };
  }

  const urls = [
    `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`,
    `https://api.5calls.org/v1/representatives?address=${encodeURIComponent(zip)}`
  ];

  let lastErr = "";

  for (const url of urls) {
    const resp = await fetch(url, {
      headers: {
        "X-API-Key": apiKey
      },
      cache: "no-store"
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      lastErr = `FiveCalls failed: ${resp.status} ${resp.statusText} | ${body}`;
      continue;
    }

    const data = await resp.json();

    const reps: Representative[] = (data?.representatives || [])
      .map((r: any) => {
        const chamber =
          (safeText(r?.chamber) || safeText(r?.office)).toLowerCase().includes("senate")
            ? "senate"
            : "house";

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

    if (reps.length > 0) {
      return { reps, source: "real" };
    }

    lastErr = "FiveCalls returned 200 but no representatives.";
  }

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
    source: "fallback",
    error: lastErr || "Unknown FiveCalls error."
  };
}

/**
 * Congress.gov API (data.gov key)
 * We pull recent roll-call votes for the member and filter to “funding-ish” text.
 *
 * Notes:
 * - Congress.gov API structure varies by endpoint/version.
 * - This function is defensive and will just return [] if fields aren't present.
 */
async function getFundingVotesForMember(bioguideId: string): Promise<VoteItem[]> {
  const congressKey = process.env.CONGRESS_API_KEY;
  if (!congressKey || !bioguideId) return [];

  // Congress.gov endpoint for member votes (v3 style)
  // If your key works but this endpoint differs, you'll still get [] (no crash).
  const url = `https://api.congress.gov/v3/member/${encodeURIComponent(
    bioguideId
  )}/votes?format=json&limit=50&api_key=${encodeURIComponent(congressKey)}`;

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return [];

  const json = await resp.json();

  // Try a few plausible shapes
  const votes =
    json?.votes ||
    json?.memberVotes ||
    json?.results?.votes ||
    json?.results ||
    [];

  if (!Array.isArray(votes)) return [];

  const mapped: VoteItem[] = votes
    .map((v: any) => {
      const chamberRaw = safeText(v?.chamber || v?.vote?.chamber || v?.voteChamber);
      const chamber: "house" | "senate" =
        chamberRaw.toLowerCase() === "senate" ? "senate" : "house";

      const date =
        safeText(v?.date || v?.voteDate || v?.vote?.date || v?.votedAt) || "";

      const question =
        safeText(v?.question || v?.voteQuestion || v?.vote?.question) || undefined;

      const description =
        safeText(v?.description || v?.voteDescription || v?.vote?.description || v?.title) ||
        undefined;

      const billId =
        safeText(v?.bill?.number || v?.billNumber || v?.bill?.billNumber || v?.measureNumber) ||
        undefined;

      const billTitle =
        safeText(v?.bill?.title || v?.billTitle || v?.measureTitle || v?.bill?.shortTitle) ||
        undefined;

      const positionRaw = safeText(v?.position || v?.votePosition || v?.memberPosition);
      const position: VoteItem["position"] =
        positionRaw === "Yes" || positionRaw === "Yea"
          ? "Yea"
          : positionRaw === "No" || positionRaw === "Nay"
            ? "Nay"
            : positionRaw === "Present"
              ? "Present"
              : "Not Voting";

      const rollCall =
        safeText(v?.rollCall || v?.roll_call || v?.rollNumber || v?.voteNumber) || undefined;

      const result = safeText(v?.result || v?.voteResult) || undefined;

      const url = safeText(v?.url || v?.voteUrl) || undefined;

      return {
        date,
        chamber,
        question,
        description,
        billId,
        billTitle,
        position,
        rollCall,
        result,
        source: "congress",
        url
      };
    })
    .filter((x: VoteItem) => {
      const blob = `${x.description || ""} ${x.question || ""} ${x.billTitle || ""} ${x.billId || ""}`;
      return isFundingRelevantText(blob);
    })
    .slice(0, 10);

  return mapped;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TaxRequest;
    const income = Number(body.income);
    const zip = String(body.zip || "").trim();

    if (!income || !zip) {
      return NextResponse.json({ error: "income and zip are required" }, { status: 400 });
    }

    const estimatedTax = estimateTax(income);
    const incomeBucket = bucketIncome(income);
    const breakdown = buildBreakdown(estimatedTax);

    const { reps, source: repsSource, error: repsError } = await getRepsForZip(zip);

    const representatives: Representative[] = await Promise.all(
      reps.map(async (r) => {
        const votes = r.id ? await getFundingVotesForMember(r.id) : [];
        return { ...r, votes };
      })
    );

    return NextResponse.json({
      incomeBucket,
      estimatedFederalIncomeTax: estimatedTax,
      zip,
      breakdown,
      representatives,
      repsSource,
      repsError: repsError || null
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "server_error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
