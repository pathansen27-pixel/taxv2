import { NextRequest, NextResponse } from "next/server";

/* =======================
   Types
======================= */

type TaxRequest = {
  income: number;
  zip: string;
};

type VotePosition = "Yea" | "Nay" | "Not Voting" | "No Roll Call Found";
type VoteCast = Exclude<VotePosition, "No Roll Call Found">;

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

type PartyKey = "D" | "R" | "I" | "Other" | "Unknown";

type PartySplit = {
  yea: Record<PartyKey, number>;
  nay: Record<PartyKey, number>;
  notVoting: Record<PartyKey, number>;
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
    partySplit: PartySplit | null;
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
  if (!res.ok) throw new Error("Congress API failed");
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

function normalizeParty(p: string | null | undefined): PartyKey {
  const v = (p || "").trim().toUpperCase();
  if (v === "D" || v === "DEMOCRAT" || v === "DEM") return "D";
  if (v === "R" || v === "REPUBLICAN" || v === "GOP") return "R";
  if (v === "I" || v === "INDEPENDENT") return "I";
  if (!v) return "Unknown";
  return "Other";
}

function normalizeVote(raw: string): VoteCast {
  const v = raw.trim().toLowerCase();
  if (["yea", "yes", "aye", "y"].includes(v)) return "Yea";
  if (["nay", "no", "n"].includes(v)) return "Nay";
  if (["not voting", "absent", "present"].includes(v)) return "Not Voting";
  return "Not Voting";
}

/**
 * Returns:
 * - voteMap: bioguide -> vote cast
 * - partyMap: bioguide -> party (if present in the roll call feed)
 */
function parseVotesAndPartiesFromXml(xml: string): {
  voteMap: Map<string, VoteCast>;
  partyMap: Map<string, PartyKey>;
} {
  const voteMap = new Map<string, VoteCast>();
  const partyMap = new Map<string, PartyKey>();

  const chunks = xml.split(/<member\b|<voter\b/i).slice(1);

  chunks.forEach((chunk) => {
    const bioguide =
      chunk.match(/bioguide_id="([^"]+)"/i)?.[1] ||
      chunk.match(/<bioguide[^>]*>([^<]+)</i)?.[1];

    if (!bioguide) return;

    const rawVote =
      chunk.match(/<vote[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/vote="([^"]+)"/i)?.[1] ||
      "";

    const rawParty =
      chunk.match(/party="([^"]+)"/i)?.[1] ||
      chunk.match(/<party[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/<partyName[^>]*>([^<]+)</i)?.[1] ||
      "";

    const key = bioguide.toUpperCase();
    voteMap.set(key, normalizeVote(rawVote));
    partyMap.set(key, normalizeParty(rawParty));
  });

  return { voteMap, partyMap };
}

function computeVoteStats(voteMap: Map<string, VoteCast>): VoteStats {
  let yea = 0;
  let nay = 0;
  let notVoting = 0;

  voteMap.forEach((v) => {
    if (v === "Yea") yea += 1;
    else if (v === "Nay") nay += 1;
    else notVoting += 1;
  });

  const total = yea + nay + notVoting;
  return { total, yea, nay, notVoting, margin: Math.abs(yea - nay) };
}

function emptyPartyCounts(): Record<PartyKey, number> {
  return { D: 0, R: 0, I: 0, Other: 0, Unknown: 0 };
}

function computePartySplit(voteMap: Map<string, VoteCast>, partyMap: Map<string, PartyKey>): PartySplit {
  const split: PartySplit = {
    yea: emptyPartyCounts(),
    nay: emptyPartyCounts(),
    notVoting: emptyPartyCounts()
  };

  voteMap.forEach((vote, bioguide) => {
    const party = partyMap.get(bioguide) || "Unknown";

    if (vote === "Yea") split.yea[party] += 1;
    else if (vote === "Nay") split.nay[party] += 1;
    else split.notVoting[party] += 1;
  });

  return split;
}

/* =======================
   Representatives via 5Calls
======================= */

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const res = await fetch(
    `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(zip)}`,
    { headers: { "X-5Calls-Token": process.env.FIVECALLS_TOKEN || "" } }
  );

  if (!res.ok) throw new Error("5Calls API failed");

  const data = await res.json();
  if (!data || !Array.isArray(data.representatives)) {
    throw new Error("No representatives array in 5Calls response");
  }

  return data.representatives.map((r: any) => ({
    id: (r.bioguide || r.bioguide_id || r.id || "unknown").toString(),
    name: r.name,
    chamber: r.branch === "upper" ? "senate" : "house",
    party: r.party || "",
    votes: []
  }));
}

/* =======================
   Build Bill Index
======================= */

function firstSentence(text: string): string {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/(?<=[.?!])\s+/).filter(Boolean);
  return parts[0] || cleaned;
}

function buildControversyLines(stats: VoteStats | null, partySplit: PartySplit | null, voteUrlFound: boolean, votesParsed: boolean): string[] {
  if (!voteUrlFound) return ["No recorded roll-call vote link was found for this bill in the fetched actions."];
  if (voteUrlFound && !votesParsed) return ["A recorded vote link exists, but votes could not be parsed from the returned content."];

  if (!stats) return ["Recorded vote exists but statistics are unavailable."];

  const lines: string[] = [];
  lines.push(`Recorded vote: Yea ${stats.yea}, Nay ${stats.nay}, Not voting ${stats.notVoting}.`);

  if (stats.margin <= 10) lines.push("Close vote margin suggests a more contested vote among voting members.");
  else lines.push("Larger vote margin suggests broader agreement among voting members on the specific roll call captured.");

  if (partySplit) {
    lines.push(
      `Party split on Yea: D ${partySplit.yea.D}, R ${partySplit.yea.R}, I ${partySplit.yea.I}, Other ${partySplit.yea.Other}, Unknown ${partySplit.yea.Unknown}.`
    );
    lines.push(
      `Party split on Nay: D ${partySplit.nay.D}, R ${partySplit.nay.R}, I ${partySplit.nay.I}, Other ${partySplit.nay.Other}, Unknown ${partySplit.nay.Unknown}.`
    );
  } else {
    lines.push("Party breakdown was not available in the roll-call feed.");
  }

  return lines;
}

async function buildBillIndex() {
  const billIndex: BillIndexEntry[] = [];
  const billVoteMaps: Array<{
    billId: string;
    billTitle: string;
    voteUrlFound: boolean;
    voteMap: Map<string, VoteCast> | null;
  }> = [];

  for (const b of TARGET_BILLS) {
    const { billType, billNumber } = parseBillId(b.billId);

    let policyArea: string | null = null;
    let sponsors: string[] = [];
    let latestAction: string | null = null;
    let summary: string | null = null;

    let voteUrlFound = false;
    let voteMap: Map<string, VoteCast> | null = null;
    let partyMap: Map<string, PartyKey> | null = null;

    try {
      const meta = await congressFetch(`/bill/${b.congress}/${billType}/${billNumber}`);

      // Summary can appear in different shapes
      summary =
        meta?.bill?.summary?.text ||
        meta?.bill?.summaries?.[0]?.text ||
        meta?.bill?.summaries?.summaries?.[0]?.text ||
        null;

      policyArea = meta?.bill?.policyArea?.name || meta?.bill?.policy_area?.name || null;

      const sponsor = meta?.bill?.sponsors?.[0] || meta?.bill?.sponsor;
      if (sponsor?.fullName) sponsors = [String(sponsor.fullName)];
      else if (sponsor?.name) sponsors = [String(sponsor.name)];

      latestAction = meta?.bill?.latestAction?.text || meta?.bill?.latest_action?.text || null;

      const actions = meta?.bill?.actions || [];
      const voteUrl = actions.find((a: any) => Array.isArray(a?.recordedVotes) && a.recordedVotes.length)?.recordedVotes?.[0]?.url;

      if (typeof voteUrl === "string" && voteUrl.length) {
        voteUrlFound = true;

        const xml = await fetchVoteXml(voteUrl);
        const parsed = parseVotesAndPartiesFromXml(xml);

        voteMap = parsed.voteMap;
        partyMap = parsed.partyMap;
      }
    } catch {
      // keep going, index still returns
    }

    const votesParsed = Boolean(voteMap && voteMap.size > 0);
    const stats = voteMap && votesParsed ? computeVoteStats(voteMap) : null;
    const split = voteMap && partyMap && votesParsed ? computePartySplit(voteMap, partyMap) : null;

    const highlight = summary ? firstSentence(summary) : "";
    const highlights = highlight ? [highlight.endsWith(".") ? highlight : `${highlight}.`] : ["No official summary available."];

    const controversy = buildControversyLines(stats, split, voteUrlFound, votesParsed);

    billIndex.push({
      ...b,
      billType,
      billNumber,
      policyArea,
      sponsors,
      latestAction,
      summary,
      recordedVote: {
        voteUrlFound,
        votesParsed,
        stats,
        partySplit: split
      },
      analysis: {
        highlights,
        pros: [
          "Supporters argue it advances the bill’s stated objectives and intended outcomes described in official materials."
        ],
        cons: [
          "Opponents argue about cost, scope, implementation risk, or unintended consequences depending on the provisions."
        ],
        controversy,
        methodology:
          "Summaries and metadata are pulled from Congress.gov when available. Vote attribution is based on recorded roll-call feeds when a recorded vote link exists and can be parsed. Party split is computed only when party labels are present in the roll-call feed."
      }
    });

    billVoteMaps.push({
      billId: b.billId,
      billTitle: b.title,
      voteUrlFound,
      voteMap
    });
  }

  return { billIndex, billVoteMaps };
}

/* =======================
   Attach Votes to Reps
======================= */

function attachVotesToReps(
  reps: Representative[],
  billVoteMaps: Array<{
    billId: string;
    billTitle: string;
    voteUrlFound: boolean;
    voteMap: Map<string, VoteCast> | null;
  }>
): Representative[] {
  return reps.map((rep) => {
    const repKey = String(rep.id || "").toUpperCase();

    return {
      ...rep,
      votes: billVoteMaps.map((b) => {
        if (!b.voteUrlFound || !b.voteMap || b.voteMap.size === 0) {
          return { billId: b.billId, billTitle: b.billTitle, position: "No Roll Call Found" as VotePosition };
        }

        const cast = b.voteMap.get(repKey);
        return {
          billId: b.billId,
          billTitle: b.billTitle,
          position: (cast || "Not Voting") as VotePosition
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
    return NextResponse.json({ error: "income and zip required" }, { status: 400 });
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
