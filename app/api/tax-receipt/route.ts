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
  margin: number; // abs(yea - nay)
};

type BillIndexEntry = BillIndexItem & {
  billType: string;
  billNumber: string;
  policyArea?: string | null;
  sponsors?: string[];
  latestAction?: string | null;
  summary?: string | null;
  recordedVote: {
    voteUrlFound: boolean;
    voteUrl?: string | null;
    votesParsed: boolean;
    stats?: VoteStats | null;
  };
  analysis: {
    highlights: string[];
    pros: string[];
    cons: string[];
    controversy: string[];
    methodology: string; // short disclosure string
  };
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

function parseBillId(billId: string): { billType: string; billNumber: string } {
  const match = billId.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid billId: ${billId}`);
  return { billType: match[1].toLowerCase(), billNumber: match[2] };
}

/**
 * Pulls a bill record and extracts a stable subset used for the index.
 * The Congress.gov response shape varies a bit by endpoint versioning,
 * so this is intentionally defensive.
 */
async function getBillMeta(billId: string, congress: number): Promise<{
  policyArea: string | null;
  sponsors: string[];
  latestAction: string | null;
  summary: string | null;
  actions: any[];
}> {
  const { billType, billNumber } = parseBillId(billId);
  const data = await congressFetch(`/bill/${congress}/${billType}/${billNumber}`);

  const bill = data?.bill || data;

  const policyArea =
    bill?.policyArea?.name ??
    bill?.policyArea ??
    bill?.policy_area?.name ??
    null;

  const sponsors: string[] = [];
  const sponsor = bill?.sponsors?.[0] || bill?.sponsor;
  if (sponsor?.fullName) sponsors.push(String(sponsor.fullName));
  if (sponsor?.name && sponsors.length === 0) sponsors.push(String(sponsor.name));

  const latestAction =
    bill?.latestAction?.text ??
    bill?.latest_action?.text ??
    bill?.latestAction ??
    null;

  // Congress.gov often includes one or more summaries (frequently CRS)
  const summaries = bill?.summaries || bill?.summaries?.summaries || [];
  let summary: string | null = null;

  if (Array.isArray(summaries) && summaries.length) {
    // Prefer the first summary text we find
    const s0 = summaries[0];
    summary = (s0?.text || s0?.summaryText || s0?.content || null) as string | null;
  } else if (bill?.summary?.text) {
    summary = String(bill.summary.text);
  }

  const actions: any[] = Array.isArray(bill?.actions) ? bill.actions : [];

  return {
    policyArea: policyArea ? String(policyArea) : null,
    sponsors,
    latestAction: latestAction ? String(latestAction) : null,
    summary: summary ? String(summary) : null,
    actions
  };
}

/* =======================
   Recorded vote URL selection
======================= */

async function getVoteUrlFromActions(
  billId: string,
  congress: number,
  actions: any[]
): Promise<string | null> {
  // If actions passed in, use them. Else fetch bill meta and use its actions.
  let localActions = actions;
  if (!Array.isArray(localActions) || !localActions.length) {
    const meta = await getBillMeta(billId, congress);
    localActions = meta.actions;
  }

  for (const a of localActions) {
    const recordedVotes = a?.recordedVotes || a?.recorded_votes || [];
    if (Array.isArray(recordedVotes) && recordedVotes.length) {
      const url = recordedVotes[0]?.url;
      if (typeof url === "string" && url.length) return url;
    }
  }

  return null;
}

/* =======================
   Vote fetching and parsing
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

  const members: any[] =
    data?.vote?.members ||
    data?.members ||
    data?.rollCallVote?.members ||
    data?.roll_call_vote?.members ||
    [];

  if (!Array.isArray(members)) return map;

  for (const m of members) {
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

  const trimmed = body.trim();

  if (
    contentType.includes("xml") ||
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<") ||
    trimmed.toLowerCase().includes("<rollcall")
  ) {
    return parseVotesFromXml(body);
  }

  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseVotesFromJson(body);
  }

  return new Map<string, VotePosition>();
}

function computeVoteStats(voteMap: Map<string, VotePosition>): VoteStats {
  let yea = 0;
  let nay = 0;
  let notVoting = 0;

  for (const v of voteMap.values()) {
    if (v === "Yea") yea += 1;
    else if (v === "Nay") nay += 1;
    else notVoting += 1;
  }

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

  if (!res.ok) throw new Error(`5Calls API failed with status ${res.status}`);

  const data = await res.json();
  if (!data || !Array.isArray(data.representatives)) {
    throw new Error("No representatives array in 5Calls response");
  }

  return data.representatives.map((r: any) => ({
    id: (r.bioguide || r.bioguide_id || r.id || "unknown").toString(),
    name: r.name,
    chamber: r.branch === "upper" ? "senate" : "house",
    party: r.party || "",
    votes: [],
    source: "real"
  }));
}

/* =======================
   Analysis generation (unbiased, data grounded)

   Discipline:
   - We do not claim "good" or "bad"
   - We only produce:
     - highlights: what it does, who it affects, what it changes (from summary)
     - pros: plausible intended benefits (tied to summary text)
     - cons: plausible tradeoffs/risks (scope, cost, complexity) without asserting facts we do not have
     - controversy: vote margin and missing roll call signals
======================= */

function sentenceSplit(text: string, max = 4): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/(?<=[.?!])\s+/).filter(Boolean);
  return parts.slice(0, max);
}

function buildBillAnalysis(args: {
  title: string;
  policyArea: string | null;
  summary: string | null;
  latestAction: string | null;
  recordedVote: { voteUrlFound: boolean; votesParsed: boolean; stats?: VoteStats | null };
}): BillIndexEntry["analysis"] {
  const { title, policyArea, summary, latestAction, recordedVote } = args;

  const highlights: string[] = [];
  const pros: string[] = [];
  const cons: string[] = [];
  const controversy: string[] = [];

  if (policyArea) highlights.push(`Policy area: ${policyArea}.`);
  if (latestAction) highlights.push(`Latest action: ${latestAction}.`);

  const summaryLines = summary ? sentenceSplit(summary, 4) : [];
  if (summaryLines.length) {
    highlights.push(...summaryLines.map((s) => s.endsWith(".") ? s : `${s}.`));
    pros.push("Intended benefits align with the bill’s stated objectives in the official summary.");
    cons.push("Tradeoffs depend on implementation details, scope, and budget effects not captured in a short summary.");
  } else {
    highlights.push("No official summary text was available from the data source for this bill.");
    pros.push("Supporters typically argue the bill advances its stated purpose or addresses a defined problem.");
    cons.push("Opponents typically argue about cost, scope, unintended consequences, or implementation risk.");
  }

  if (recordedVote.voteUrlFound && recordedVote.votesParsed && recordedVote.stats) {
    const s = recordedVote.stats;
    controversy.push(`Recorded vote observed. Yea: ${s.yea}, Nay: ${s.nay}, Not voting: ${s.notVoting}.`);
    if (s.margin <= 10) {
      controversy.push("Close vote margin suggests a more contested issue among voting members.");
    } else {
      controversy.push("Larger vote margin suggests broader agreement among voting members on the specific roll call captured.");
    }
  } else if (recordedVote.voteUrlFound && !recordedVote.votesParsed) {
    controversy.push("A recorded vote link exists, but votes could not be parsed from the content format returned.");
  } else {
    controversy.push("No recorded roll-call vote link was found for the bill actions captured, so vote attribution is unavailable here.");
  }

  return {
    highlights,
    pros,
    cons,
    controversy,
    methodology:
      "Highlights and summary are sourced from bill metadata and summaries when available. Pros, cons, and controversy notes are generated as neutral context and vote statistics when roll-call data is available."
  };
}

/* =======================
   Build the bill index with metadata + votes
======================= */

async function buildBillIndex(): Promise<{
  billIndex: BillIndexEntry[];
  billVoteMaps: Array<{
    billId: string;
    billTitle: string;
    voteUrl: string | null;
    voteMap: Map<string, VotePosition> | null;
  }>;
}> {
  const billIndex: BillIndexEntry[] = [];
  const billVoteMaps: Array<{
    billId: string;
    billTitle: string;
    voteUrl: string | null;
    voteMap: Map<string, VotePosition> | null;
  }> = [];

  for (const b of TARGET_BILLS) {
    const { billType, billNumber } = parseBillId(b.billId);

    let policyArea: string | null = null;
    let sponsors: string[] = [];
    let latestAction: string | null = null;
    let summary: string | null = null;
    let actions: any[] = [];

    try {
      const meta = await getBillMeta(b.billId, b.congress);
      policyArea = meta.policyArea;
      sponsors = meta.sponsors;
      latestAction = meta.latestAction;
      summary = meta.summary;
      actions = meta.actions;
    } catch (e) {
      // Keep entry, but note missing metadata
      policyArea = null;
      sponsors = [];
      latestAction = null;
      summary = null;
      actions = [];
    }

    let voteUrl: string | null = null;
    let voteMap: Map<string, VotePosition> | null = null;
    let votesParsed = false;
    let stats: VoteStats | null = null;

    try {
      voteUrl = await getVoteUrlFromActions(b.billId, b.congress, actions);
      if (voteUrl) {
        voteMap = await buildVoteMapFromUrl(voteUrl);
        votesParsed = voteMap.size > 0;
        stats = votesParsed ? computeVoteStats(voteMap) : null;
      }
    } catch {
      voteUrl = null;
      voteMap = null;
      votesParsed = false;
      stats = null;
    }

    const analysis = buildBillAnalysis({
      title: b.title,
      policyArea,
      summary,
      latestAction,
      recordedVote: { voteUrlFound: Boolean(voteUrl), votesParsed, stats }
    });

    billIndex.push({
      ...b,
      billType,
      billNumber,
      policyArea,
      sponsors,
      latestAction,
      summary,
      recordedVote: {
        voteUrlFound: Boolean(voteUrl),
        voteUrl: voteUrl || null,
        votesParsed,
        stats
      },
      analysis
    });

    billVoteMaps.push({
      billId: b.billId,
      billTitle: b.title,
      voteUrl: voteUrl || null,
      voteMap
    });
  }

  return { billIndex, billVoteMaps };
}

/* =======================
   Attach votes to reps, but do not lie
======================= */

function attachVotesToRepsFromMaps(
  reps: Representative[],
  billVoteMaps: Array<{
    billId: string;
    billTitle: string;
    voteUrl: string | null;
    voteMap: Map<string, VotePosition> | null;
  }>
): Representative[] {
  return reps.map((rep) => {
    const repKey = String(rep.id || "").toUpperCase();

    return {
      ...rep,
      votes: billVoteMaps.map((bv) => {
        if (!bv.voteUrl || !bv.voteMap || bv.voteMap.size === 0) {
          return { billId: bv.billId, billTitle: bv.billTitle, position: "No Roll Call Found" };
        }
        return {
          billId: bv.billId,
          billTitle: bv.billTitle,
          position: bv.voteMap.get(repKey) || "Not Voting"
        };
      })
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
    return NextResponse.json({ error: "income and zip are required" }, { status: 400 });
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

  // Build the bill index and vote maps once, then reuse it
  const { billIndex, billVoteMaps } = await buildBillIndex();
  const representatives = attachVotesToRepsFromMaps(reps, billVoteMaps);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown,
    billIndex,
    representatives
  });
}
