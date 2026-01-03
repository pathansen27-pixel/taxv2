import { NextRequest, NextResponse } from "next/server";

/* =======================
   Types
======================= */

type TaxRequest = {
  income: number;
  zip: string;
};

type VotePosition = "Yea" | "Nay" | "Not Voting" | "No Roll Call Found";

type BillIndexItem = {
  billId: string;
  congress: number;
  title: string;
};

type VoteStats = {
  total: number;
  yea: number;
  nay: number;
  notVoting: number;
  margin: number;
};

type BillIndexEntry = BillIndexItem & {
  billType: string;
  billNumber: string;
  policyArea: string | null;
  sponsors: string[];
  latestAction: string | null;
  summary: string | null;
  recordedVote: {
    voteUrlFound: boolean;
    votesParsed: boolean;
    stats: VoteStats | null;
  };
  analysis: {
    highlights: string[];
    pros: string[];
    cons: string[];
    controversy: string[];
    methodology: string;
  };
};

type Representative = {
  id: string;
  name: string;
  chamber: "house" | "senate";
  party: string;
  votes: {
    billId: string;
    billTitle: string;
    position: VotePosition;
  }[];
};

/* =======================
   Core Tax Logic
======================= */

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

/* =======================
   Bill Index
======================= */

const TARGET_BILLS: BillIndexItem[] = [
  { billId: "HR4366", congress: 118, title: "Consolidated Appropriations Act, 2024" },
  { billId: "HR3684", congress: 117, title: "Infrastructure Investment and Jobs Act" },
  { billId: "HR1319", congress: 117, title: "American Rescue Plan Act" },
  { billId: "HR5376", congress: 117, title: "Inflation Reduction Act" },
  { billId: "HR3746", congress: 118, title: "Fiscal Responsibility Act (Debt Limit, 2023)" },
  { billId: "HR2670", congress: 118, title: "National Defense Authorization Act (FY2024)" }
];

/* =======================
   Congress.gov API
======================= */

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

async function congressFetch(path: string): Promise<any> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_API_KEY missing");

  const res = await fetch(`${CONGRESS_API_BASE}${path}?api_key=${apiKey}&format=json`);
  if (!res.ok) throw new Error(`Congress API failed`);
  return res.json();
}

function parseBillId(billId: string) {
  const match = billId.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid billId ${billId}`);
  return { billType: match[1].toLowerCase(), billNumber: match[2] };
}

/* =======================
   Vote Parsing
======================= */

async function fetchVoteXml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Vote fetch failed");
  return res.text();
}

function parseVotesFromXml(xml: string): Map<string, VotePosition> {
  const map = new Map<string, VotePosition>();
  const chunks = xml.split(/<member\b|<voter\b/i).slice(1);

  chunks.forEach((chunk) => {
    const bioguide =
      chunk.match(/bioguide_id="([^"]+)"/i)?.[1] ||
      chunk.match(/<bioguide[^>]*>([^<]+)</i)?.[1];

    if (!bioguide) return;

    const raw =
      chunk.match(/<vote[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/vote="([^"]+)"/i)?.[1] ||
      "";

    const v = raw.toLowerCase();
    let pos: VotePosition = "Not Voting";
    if (["yea", "yes", "aye"].includes(v)) pos = "Yea";
    else if (["nay", "no"].includes(v)) pos = "Nay";

    map.set(bioguide.toUpperCase(), pos);
  });

  return map;
}

function computeVoteStats(voteMap: Map<string, VotePosition>): VoteStats {
  let yea = 0;
  let nay = 0;
  let notVoting = 0;

  voteMap.forEach((v) => {
    if (v === "Yea") yea++;
    else if (v === "Nay") nay++;
    else notVoting++;
  });

  const total = yea + nay + notVoting;
  return { total, yea, nay, notVoting, margin: Math.abs(yea - nay) };
}

/* =======================
   Representatives via 5Calls
======================= */

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const res = await fetch(
    `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`,
    { headers: { "X-5Calls-Token": process.env.FIVECALLS_TOKEN || "" } }
  );

  const data = await res.json();
  return data.representatives.map((r: any) => ({
    id: (r.bioguide || r.id || "unknown").toString(),
    name: r.name,
    chamber: r.branch === "upper" ? "senate" : "house",
    party: r.party || "",
    votes: []
  }));
}

/* =======================
   Build Bill Index
======================= */

async function buildBillIndex() {
  const billIndex: BillIndexEntry[] = [];
  const billVoteMaps: Array<{ billId: string; billTitle: string; voteMap: Map<string, VotePosition> | null }> = [];

  for (const b of TARGET_BILLS) {
    const { billType, billNumber } = parseBillId(b.billId);

    let summary: string | null = null;
    let voteMap: Map<string, VotePosition> | null = null;

    try {
      const meta = await congressFetch(`/bill/${b.congress}/${billType}/${billNumber}`);
      summary = meta?.bill?.summary?.text || null;

      const actions = meta?.bill?.actions || [];
      const voteUrl = actions.find((a: any) => a?.recordedVotes?.length)?.recordedVotes?.[0]?.url;

      if (voteUrl) {
        const xml = await fetchVoteXml(voteUrl);
        voteMap = parseVotesFromXml(xml);
      }
    } catch {}

    const stats = voteMap ? computeVoteStats(voteMap) : null;

    billIndex.push({
      ...b,
      billType,
      billNumber,
      policyArea: null,
      sponsors: [],
      latestAction: null,
      summary,
      recordedVote: {
        voteUrlFound: Boolean(voteMap),
        votesParsed: Boolean(voteMap && voteMap.size),
        stats
      },
      analysis: {
        highlights: summary ? [summary.split(".")[0] + "."] : ["No official summary available."],
        pros: ["Intended to address its stated policy objectives."],
        cons: ["Involves tradeoffs around scope, cost, or implementation."],
        controversy: stats
          ? [`Vote margin: ${stats.yea}–${stats.nay}.`]
          : ["No parseable roll-call vote found."],
        methodology:
          "Summaries from Congress.gov when available. Pros/cons generated neutrally. Vote stats based on recorded roll calls."
      }
    });

    billVoteMaps.push({ billId: b.billId, billTitle: b.title, voteMap });
  }

  return { billIndex, billVoteMaps };
}

/* =======================
   Attach Votes to Reps
======================= */

function attachVotesToReps(
  reps: Representative[],
  billVoteMaps: Array<{ billId: string; billTitle: string; voteMap: Map<string, VotePosition> | null }>
): Representative[] {
  return reps.map((rep) => ({
    ...rep,
    votes: billVoteMaps.map((b) => {
      if (!b.voteMap || b.voteMap.size === 0) {
        return { billId: b.billId, billTitle: b.billTitle, position: "No Roll Call Found" };
      }
      return {
        billId: b.billId,
        billTitle: b.billTitle,
        position: b.voteMap.get(rep.id.toUpperCase()) || "Not Voting"
      };
    })
  }));
}

/* =======================
   API Handler
======================= */

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;

  const income = Number(body.income);
  const zip = String(body.zip || "").trim();

  if (!income || !zip) {
    return NextResponse.json({ error: "income and zip required" }, { status: 400 });
  }

  const estimatedTax = estimateTax(income);
  const incomeBucket = bucketIncome(income);

  const breakdown = [
    { name: "Social Security", share: 0.24 },
    { name: "Medicare", share: 0.15 },
    { name: "Health", share: 0.15 },
    { name: "Defense", share: 0.13 },
    { name: "Safety Net", share: 0.11 },
    { name: "Interest", share: 0.1 },
    { name: "Veterans", share: 0.05 },
    { name: "Other", share: 0.07 }
  ].map((b) => ({
    ...b,
    amount: Math.round(estimatedTax * b.share * 100) / 100
  }));

  const reps = await getRepsForZip(zip);
  const { billIndex, billVoteMaps } = await buildBillIndex();
  const representatives = attachVotesToReps(reps, billVoteMaps);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    billIndex,
    representatives
  });
}
