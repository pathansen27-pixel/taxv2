import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

type BillSeed = { billId: string; congress: number; title: string };

// Curated major bills list. Expand freely.
// This list is your "major bills" editorial layer.
const MAJOR_BILLS: BillSeed[] = [
  { billId: "HR4366", congress: 118, title: "Consolidated Appropriations Act, 2024" },
  { billId: "HR3684", congress: 117, title: "Infrastructure Investment and Jobs Act" },
  { billId: "HR1319", congress: 117, title: "American Rescue Plan Act" },
  { billId: "HR5376", congress: 117, title: "Inflation Reduction Act" },
  { billId: "HR3746", congress: 118, title: "Fiscal Responsibility Act (Debt Limit, 2023)" },
  { billId: "HR2670", congress: 118, title: "National Defense Authorization Act (FY2024)" }
];

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

function parseBillId(billId: string): { billType: string; billNumber: string; billIdDisplay: string } {
  const match = billId.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid billId: ${billId}`);
  return { billType: match[1].toLowerCase(), billNumber: match[2], billIdDisplay: match[1].toUpperCase() + match[2] };
}

async function congressFetch(path: string) {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) throw new Error("CONGRESS_API_KEY missing");

  const url = `${CONGRESS_API_BASE}${path}?api_key=${apiKey}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Congress API failed: ${res.status} ${res.statusText}`);
  return res.json();
}

function safeText(x: any): string | null {
  if (typeof x === "string" && x.trim()) return x.trim();
  return null;
}

function makeBillKey(congress: number, billType: string, billNumber: string) {
  return `${congress}:${billType}:${billNumber}`;
}

function makeRollcallKey(chamber: string, congress: number, voteDate: string | null, rollcallNumber: number | null, voteUrl: string) {
  // Stable key even if some fields missing
  return `${chamber}:${congress}:${voteDate || "unknown-date"}:${rollcallNumber ?? "unknown-rc"}:${hashShort(voteUrl)}`;
}

function hashShort(s: string): string {
  // Tiny non-crypto hash to keep key short and stable
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/**
 * Roll call XML parsing:
 * We extract bioguide_id and vote.
 * We also attempt party and name if present.
 */
function parseRollCallXml(xml: string): {
  members: Array<{ bioguide: string; vote: string; party?: string; name?: string }>;
  meta: { chamber: "house" | "senate"; voteDate: string | null; rollcallNumber: number | null; question?: string | null; result?: string | null };
} {
  const lower = xml.toLowerCase();

  // Basic chamber heuristic
  const chamber: "house" | "senate" =
    lower.includes("clerk.house.gov") || lower.includes("<rollcall-vote") ? "house" : "senate";

  const voteDate =
    xml.match(/<vote-date[^>]*>([^<]+)</i)?.[1]?.trim() ||
    xml.match(/<date[^>]*>([^<]+)</i)?.[1]?.trim() ||
    null;

  const rollcallNumberRaw =
    xml.match(/<rollcall-num[^>]*>([^<]+)</i)?.[1]?.trim() ||
    xml.match(/<vote_number[^>]*>([^<]+)</i)?.[1]?.trim() ||
    null;

  const rollcallNumber = rollcallNumberRaw && /^\d+$/.test(rollcallNumberRaw) ? Number(rollcallNumberRaw) : null;

  const question =
    xml.match(/<vote-question[^>]*>([^<]+)</i)?.[1]?.trim() ||
    xml.match(/<question[^>]*>([^<]+)</i)?.[1]?.trim() ||
    null;

  const result =
    xml.match(/<vote-result[^>]*>([^<]+)</i)?.[1]?.trim() ||
    xml.match(/<result[^>]*>([^<]+)</i)?.[1]?.trim() ||
    null;

  const members: Array<{ bioguide: string; vote: string; party?: string; name?: string }> = [];

  // Split blocks
  const chunks = xml.split(/<member\b|<voter\b/i).slice(1);
  chunks.forEach((chunk) => {
    const bioguide =
      chunk.match(/bioguide_id="([^"]+)"/i)?.[1] ||
      chunk.match(/<bioguide[^>]*>([^<]+)</i)?.[1];

    if (!bioguide) return;

    const vote =
      chunk.match(/<vote[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/vote="([^"]+)"/i)?.[1] ||
      "Not Voting";

    const party =
      chunk.match(/party="([^"]+)"/i)?.[1] ||
      chunk.match(/<party[^>]*>([^<]+)</i)?.[1];

    const name =
      chunk.match(/<name[^>]*>([^<]+)</i)?.[1] ||
      chunk.match(/<last_name[^>]*>([^<]+)</i)?.[1];

    members.push({
      bioguide: bioguide.toUpperCase(),
      vote: vote.trim(),
      party: party ? party.trim() : undefined,
      name: name ? name.trim() : undefined
    });
  });

  return { members, meta: { chamber, voteDate, rollcallNumber, question, result } };
}

function normalizeVote(v: string): string {
  const x = v.trim().toLowerCase();
  if (["yea", "yes", "aye", "y"].includes(x)) return "Yea";
  if (["nay", "no", "n"].includes(x)) return "Nay";
  if (["present"].includes(x)) return "Present";
  return "Not Voting";
}

function normalizeParty(p?: string): string | null {
  const x = (p || "").trim().toUpperCase();
  if (!x) return null;
  if (x === "D" || x === "DEM" || x === "DEMOCRAT") return "D";
  if (x === "R" || x === "GOP" || x === "REPUBLICAN") return "R";
  if (x === "I" || x === "INDEPENDENT") return "I";
  return x;
}

async function upsertBillFromCongress(seed: BillSeed) {
  const { billType, billNumber, billIdDisplay } = parseBillId(seed.billId);
  const billKey = makeBillKey(seed.congress, billType, billNumber);

  const data = await congressFetch(`/bill/${seed.congress}/${billType}/${billNumber}`);
  const bill = data?.bill || data;

  const policyArea =
    safeText(bill?.policyArea?.name) ||
    safeText(bill?.policy_area?.name) ||
    safeText(bill?.policyArea) ||
    null;

  const sponsor = safeText(bill?.sponsors?.[0]?.fullName) || safeText(bill?.sponsor?.name) || null;

  const latestAction =
    safeText(bill?.latestAction?.text) || safeText(bill?.latest_action?.text) || safeText(bill?.latestAction) || null;

  const summaries = bill?.summaries?.summaries || bill?.summaries || [];
  let summaryText: string | null = null;
  if (Array.isArray(summaries) && summaries.length) {
    summaryText = safeText(summaries[0]?.text) || safeText(summaries[0]?.content) || null;
  } else {
    summaryText = safeText(bill?.summary?.text) || null;
  }

  // Upsert bill
  const up = await sql`
    insert into bills (bill_key, congress, bill_type, bill_number, bill_id_display, title, policy_area, sponsor, latest_action, summary_text)
    values (${billKey}, ${seed.congress}, ${billType}, ${Number(billNumber)}, ${billIdDisplay}, ${seed.title}, ${policyArea}, ${sponsor}, ${latestAction}, ${summaryText})
    on conflict (bill_key) do update set
      title = excluded.title,
      policy_area = excluded.policy_area,
      sponsor = excluded.sponsor,
      latest_action = excluded.latest_action,
      summary_text = excluded.summary_text,
      updated_at = now()
    returning id;
  `;
  const billRowId = up.rows[0].id as number;

  const actions: any[] = Array.isArray(bill?.actions) ? bill.actions : [];

  // Pull all recorded votes we can find in actions
  const voteUrls: string[] = [];
  actions.forEach((a: any) => {
    const rvs = a?.recordedVotes || a?.recorded_votes || [];
    if (Array.isArray(rvs)) {
      rvs.forEach((rv: any) => {
        const url = rv?.url;
        if (typeof url === "string" && url.length) voteUrls.push(url);
      });
    }
  });

  // Deduplicate
  const uniqueVoteUrls = Array.from(new Set(voteUrls));

  return { billRowId, uniqueVoteUrls };
}

async function ingestRollCallForBill(billRowId: number, voteUrl: string) {
  const res = await fetch(voteUrl);
  if (!res.ok) throw new Error(`Vote URL fetch failed: ${res.status} ${res.statusText}`);
  const xml = await res.text();

  const parsed = parseRollCallXml(xml);
  const chamber = parsed.meta.chamber;
  const voteDate = parsed.meta.voteDate;
  const rollcallNumber = parsed.meta.rollcallNumber;

  const rollcallKey = makeRollcallKey(chamber, Number(billRowId), voteDate, rollcallNumber, voteUrl);

  // Insert roll call
  const roll = await sql`
    insert into roll_calls (rollcall_key, chamber, congress, rollcall_number, vote_date, question, result, vote_url, source)
    values (${rollcallKey}, ${chamber}, null, ${rollcallNumber}, ${voteDate}, ${parsed.meta.question || null}, ${parsed.meta.result || null}, ${voteUrl}, 'congress.gov')
    on conflict (rollcall_key) do update set
      vote_url = excluded.vote_url,
      fetched_at = now()
    returning id;
  `;
  const rollCallId = roll.rows[0].id as number;

  // Bridge bill <-> roll call
  await sql`
    insert into bill_roll_calls (bill_id, roll_call_id, vote_type)
    values (${billRowId}, ${rollCallId}, null)
    on conflict (bill_id, roll_call_id) do nothing;
  `;

  // Upsert members and votes
  // Use chunked inserts to avoid payload size limits
  const members = parsed.members;

  // Update member dimension
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const party = normalizeParty(m.party);
    const name = m.name || null;

    await sql`
      insert into members (bioguide_id, name, party, chamber)
      values (${m.bioguide}, ${name}, ${party}, ${chamber})
      on conflict (bioguide_id) do update set
        name = coalesce(excluded.name, members.name),
        party = coalesce(excluded.party, members.party),
        chamber = coalesce(excluded.chamber, members.chamber),
        updated_at = now();
    `;

    await sql`
      insert into member_votes (roll_call_id, bioguide_id, vote_cast)
      values (${rollCallId}, ${m.bioguide}, ${normalizeVote(m.vote)})
      on conflict (roll_call_id, bioguide_id) do update set
        vote_cast = excluded.vote_cast;
    `;
  }

  // Compute stats
  let yea = 0;
  let nay = 0;
  let notVoting = 0;
  let present = 0;

  members.forEach((m) => {
    const v = normalizeVote(m.vote);
    if (v === "Yea") yea += 1;
    else if (v === "Nay") nay += 1;
    else if (v === "Present") present += 1;
    else notVoting += 1;
  });

  await sql`
    insert into roll_call_stats (roll_call_id, yea, nay, not_voting, present)
    values (${rollCallId}, ${yea}, ${nay}, ${notVoting}, ${present})
    on conflict (roll_call_id) do update set
      yea = excluded.yea,
      nay = excluded.nay,
      not_voting = excluded.not_voting,
      present = excluded.present,
      updated_at = now();
  `;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Array<{ billId: string; voteUrls: number; ingested: number; errors: number }> = [];

  for (const seed of MAJOR_BILLS) {
    let ingested = 0;
    let errors = 0;

    try {
      const { billRowId, uniqueVoteUrls } = await upsertBillFromCongress(seed);

      for (let i = 0; i < uniqueVoteUrls.length; i++) {
        const url = uniqueVoteUrls[i];
        try {
          await ingestRollCallForBill(billRowId, url);
          ingested += 1;
        } catch (e) {
          errors += 1;
          console.error("ingestRollCallForBill failed", seed.billId, url, e);
        }
      }

      results.push({ billId: seed.billId, voteUrls: uniqueVoteUrls.length, ingested, errors });
    } catch (e) {
      console.error("upsertBillFromCongress failed", seed.billId, e);
      results.push({ billId: seed.billId, voteUrls: 0, ingested: 0, errors: 1 });
    }
  }

  return NextResponse.json({ ok: true, results });
}
