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

type Representative = {
  id: string; // BioGuide ID (best effort)
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
   Bill Index (EXPAND THIS)
   Note: many “Acts” are umbrellas. Some will not have a clean single roll call.
======================= */

const TARGET_BILLS: BillIndexItem[] = [
  { billId: "HR4366", congress: 118, title: "Consolidated Appropriations Act, 2024" },
  { billId: "HR3684", congress: 117, title: "Infrastructure Investment and Jobs Act" },
  { billId: "HR1319", congress: 117, title: "American Rescue Plan Act" },
  { billId: "HR5376", congress: 117, title: "Inflation Reduction Act" },
  { billId: "HR3746", congress: 118, title: "Fiscal Responsibility Act (debt limit, 2023)" },
  { billId: "HR2670", congress: 118, title: "National Defense Authorization Act (FY2024)" },
  { billId: "HR815", congress: 118, title: "National Security Supplemental (various, 2024)" }
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

  if (!res.ok) {
    throw new Error(`Congress API failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

function parseBillId(billId: string): { type: string; number: string } {
  const match = billId.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid billId: ${billId}`);
  return { type: match[1].toLowerCase(), number: match[2] };
}

/* =======================
   Vote URL selection

   Important: a bill can have multiple recorded votes across amendments, motions, passage.
   We take the first recorded vote we can find, but we also expose "voteUrlFound" so UI can show truth.
======================= */

async function getVoteUrl(billId: string, congress: number): Promise<string | null> {
  const { type, number } = parseBillId(billId);
  const data = await congressFetch(`/bill/${congress}/${type}/${number}`);

  const actions: any[] = data?.bill?.actions || [];
  for (const a of actions) {
    if (Array.isArray(a?.recordedVotes) && a.recordedVotes.length) {
      // Prefer the first URL. Later you can add smarter selection by action text.
      const url = a.recordedVotes[0]?.url;
      if (typeof url === "string" && url.length) return url;
    }
  }

  return null;
}

/* =======================
   Vote fetching and parsing

   Reality: recorded vote URLs may point to XML, JSON, or an HTML page.
   We do best-effort parsing:
   - If XML: parse for bioguide_id or <bioguide>
   - If JSON: attempt common vote member shapes
   - Otherwise: no votes
======================= */

async function fetchVoteContent(url: string): Promise<{ contentType: string; body: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Vote fetch failed: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();
  return { contentType, body };
}

function parseVotesFromXml(xml: string): Map<string, VotePosition> {
  const map = new Map<string, VotePosition>();

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

    const v = raw.trim().toLowerCase();

    let position: VotePosition = "Not Voting";
    if (["yea", "aye", "yes", "y"].includes(v)) position = "Yea";
    if (["nay", "no", "n"].includes(v)) position = "Nay";
    if (["not voting", "absent", "present"].includes(v)) position = "Not Voting";

    map.set(bioguide.toUpperCase(), position);
  }

  return map;
}

function parseVotesFromJson(jsonText: string): Map<string, VotePosition> {
  const map = new Map<string, VotePosition>();

  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return map;
  }

  // Try a few likely shapes without assuming too much
  const candidates: any[] =
    data?.vote?.members ||
    data?.members ||
    data?.rollCallVote?.members ||
    data?.roll_call_vote?.members ||
    [];

  if (!Array.isArray(candidates)) return map;

  for (const m of candidates) {
    const bioguide =
      (m?.bioguideId || m?.bioguide_id || m?.bioguide || m?.member?.bioguideId || "").toString();

    if (!bioguide) continue;

    const raw =
      (m?.vote || m?.position || m?.castVote || m?.cast_vote || "").toString().trim().toLowerCase();

    let position: VotePosition = "Not Voting";
    if (["yea", "aye", "yes", "y"].includes(raw)) position = "Yea";
    if (["nay", "no", "n"].includes(raw)) position = "Nay";
    if (["not voting", "absent", "present"].includes(raw)) position = "Not Voting";

    map.set(bioguide.toUpperCase(), position);
  }

  return map;
}

async function buildVoteMapFromUrl(url: string): Promise<Map<string, VotePosition>> {
  const { contentType, body } = await fetchVoteContent(url);

  if (contentType.includes("xml") || body.trim().startsWith("<?xml") || body.includes("<rollcall")) {
    return parseVotesFromXml(body);
  }

  if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    return parseVotesFromJson(body);
  }

  // HTML or unknown: cannot parse votes
  return new Map<string, VotePosition>();
}

/* =======================
   Representatives via 5Calls
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
    // 5Calls sometimes uses bioguide, bioguide_id, or id depending on upstream
    id: (r.bioguide || r.bioguide_id || r.id || "unknown").toString(),
    name: r.name,
    chamber: r.branch === "upper" ? "senate" : "house",
    party: r.party || "",
    votes: [],
    source: "real"
  }));
}

/* =======================
   Attach LIVE Votes (with honest fallback)
======================= */

async function attachVotesToReps(
  reps: Representative[]
): Promise<{
  representatives: Representative[];
  billsIndexed: Array<BillIndexItem & { voteUrlFound: boolean; votesParsed: boolean }>;
}> {
  const billVotes: Array<{
    bill: BillIndexItem;
    voteUrl: string | null;
    voteMap: Map<string, VotePosition> | null;
  }> = [];

  for (const bill of TARGET_BILLS) {
    try {
      const voteUrl = await getVoteUrl(bill.billId, bill.congress);

      if (!voteUrl) {
        billVotes.push({ bill, voteUrl: null, voteMap: null });
        continue;
      }

      const voteMap = await buildVoteMapFromUrl(voteUrl);

      billVotes.push({ bill, voteUrl, voteMap });
    } catch (e) {
      console.error(`Vote fetch failed for ${bill.billId}`, e);
      billVotes.push({ bill, voteUrl: null, voteMap: null });
    }
  }

  const billsIndexed = billVotes.map((bv) => ({
    ...bv.bill,
    voteUrlFound: Boolean(bv.voteUrl),
    votesParsed: Boolean(bv.voteMap && bv.voteMap.size > 0)
  }));

  const representatives = reps.map((rep) => {
    const repKey = String(rep.id || "").toUpperCase();

    return {
      ...rep,
      votes: billVotes.map((bv) => {
        // Honest labeling:
        // - If no vote URL or no parseable votes: "No Roll Call Found"
        // - If we have votes but this member is absent: "Not Voting"
        if (!bv.voteUrl || !bv.voteMap || bv.voteMap.size === 0) {
          return {
            billId: bv.bill.billId,
            billTitle: bv.bill.title,
            position: "No Roll Call Found" as VotePosition
          };
        }

        const position = bv.voteMap.get(repKey) || "Not Voting";

        return {
          billId: bv.bill.billId,
          billTitle: bv.bill.title,
          position
        };
      })
    };
  });

  return { representatives, billsIndexed };
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
  const { representatives, billsIndexed } = await attachVotesToReps(reps);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    billsIndexed,
    representatives
  });
}
