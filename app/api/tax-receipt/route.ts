import { NextRequest, NextResponse } from "next/server";

/* =======================
   Types
======================= */

type TaxRequest = {
  income: number;
  zip: string;
};

type VotePosition = "Yea" | "Nay" | "Not Voting";

type Representative = {
  id: string; // BioGuide ID
  name: string;
  chamber: "house" | "senate";
  party: string;
  votes: {
    billId: string;
    billTitle: string;
    position: VotePosition;
  }[];
  source?: string;
};

/* =======================
   Core Tax Logic (UNCHANGED)
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
   Bill Index (EXPAND THIS FREELY)
======================= */

const TARGET_BILLS: Array<{ billId: string; congress: number; title: string }> = [
  { billId: "HR4366", congress: 118, title: "Consolidated Appropriations Act, 2024" },
  { billId: "HR5376", congress: 117, title: "Inflation Reduction Act of 2022" },
  { billId: "HR3684", congress: 117, title: "Infrastructure Investment and Jobs Act" },
  { billId: "HR1319", congress: 117, title: "American Rescue Plan Act" },
  { billId: "S1", congress: 118, title: "Federal Budget Resolution" }
];

/* =======================
   Congress.gov API
======================= */

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

async function congressFetch(path: string): Promise<any> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_API_KEY missing");

  const url = `${CONGRESS_API_BASE}${path}?api_key=${apiKey}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress API failed: ${res.status}`);
  return res.json();
}

function parseBillId(billId: string): { type: string; number: string } {
  const match = billId.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid billId: ${billId}`);
  return { type: match[1].toLowerCase(), number: match[2] };
}

/* =======================
   Roll Call Vote Fetching
======================= */

async function getVoteUrl(billId: string, congress: number): Promise<string | null> {
  const { type, number } = parseBillId(billId);
  const data = await congressFetch(`/bill/${congress}/${type}/${number}`);
  const actions: any[] = data?.bill?.actions || [];

  for (const a of actions) {
    if (Array.isArray(a?.recordedVotes) && a.recordedVotes.length) {
      const url = a.recordedVotes[0]?.url;
      if (typeof url === "string" && url.length) return url;
    }
  }
  return null;
}

async function fetchVoteXml(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Vote XML fetch failed: ${res.status}`);
  return res.text();
}

function parseVotesFromXml(xml: string): Map<string, VotePosition> {
  const map = new Map<string, VotePosition>();

  // Split on common voter/member tags across House/Senate XML variants
  const chunks = xml.split(/<member\b|<voter\b/i).slice(1);

  for (const chunk of chunks) {
    const bioguide =
      chunk.match(/bioguide_id="([^"]+)"/i)?.[1] ||
      chunk.match(/<bioguide[^>]*>([^<]+)</i)?.[1];

    if (!bioguide) continue;

    const raw =
      chunk.match(/<vote[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/vote="([^"]+)"/i)?.[1] ||
      "";

    const vote = raw.trim().toLowerCase();

    let position: VotePosition = "Not Voting";
    if (["yea", "aye", "yes", "y"].includes(vote)) position = "Yea";
    if (["nay", "no", "n"].includes(vote)) position = "Nay";

    map.set(bioguide.toUpperCase(), position);
  }

  return map;
}

/* =======================
   Representatives (ZIP → REAL PEOPLE via 5Calls)
======================= */

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const res = await fetch(
    `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`,
    { headers: { "X-5Calls-Token": process.env.FIVECALLS_TOKEN || "" } }
  );

  if (!res.ok) {
    throw new Error(`5Calls API failed with status ${res.status}`);
  }

  const data = await res.json();

  if (!data || !Array.isArray(data.representatives)) {
    throw new Error("No representatives array in 5Calls response");
  }

  return data.representatives.map((r: any) => ({
    id: r.bioguide || r.id || "unknown",
    name: r.name,
    chamber: r.branch === "upper" ? "senate" : "house",
    party: r.party || "",
    votes: [],
    source: "real"
  }));
}

/* =======================
   Attach REAL Votes
======================= */

async function attachVotesToReps(reps: Representative[]): Promise<Representative[]> {
  const billVotes: Array<{
    bill: { billId: string; congress: number; title: string };
    votes: Map<string, VotePosition>;
  }> = [];

  for (const bill of TARGET_BILLS) {
    try {
      const url = await getVoteUrl(bill.billId, bill.congress);
      if (!url) continue;

      const xml = await fetchVoteXml(url);
      const votes = parseVotesFromXml(xml);

      billVotes.push({ bill, votes });
    } catch (e) {
      console.error(`Failed live vote fetch for ${bill.billId}`, e);
      continue;
    }
  }

  return reps.map((rep) => {
    const repKey = String(rep.id || "").toUpperCase();

    return {
      ...rep,
      votes: billVotes.map(({ bill, votes }) => ({
        billId: bill.billId,
        billTitle: bill.title,
        position: votes.get(repKey) || "Not Voting"
      }))
    };
  });
}

/* =======================
   API Handler
======================= */

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;
  const income = Number(body.income);
  const zip = String(body.zip || "").trim();

  if (!Number.isFinite(income) || income <= 0 || !zip) {
    return NextResponse.json(
      { error: "income and zip are required" },
      { status: 400 }
    );
  }

  const estimatedTax = estimateTax(income);
  const incomeBucket = bucketIncome(income);

  const breakdown = [
    { code: "650", name: "Social Security", share: 0.24 },
    { code: "570", name: "Medicare", share: 0.15 },
    { code: "550", name: "Health (incl. Medicaid)", share: 0.15 },
    { code: "050", name: "National Defense", share: 0.13 },
    { code: "600", name: "Income Security / Safety Net", share: 0.11 },
    { code: "900", name: "Net Interest on the Debt", share: 0.1 },
    { code: "700", name: "Veterans’ Benefits", share: 0.05 },
    { code: "999", name: "Everything Else", share: 0.07 }
  ].map((item) => ({
    ...item,
    amount: Math.round(estimatedTax * item.share * 100) / 100
  }));

  const reps = await getRepsForZip(zip);
  const representatives = await attachVotesToReps(reps);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    representatives
  });
}
