import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || "50"), 200);

  const bills = await sql`
    select
      b.id,
      b.bill_id_display,
      b.congress,
      b.bill_type,
      b.bill_number,
      b.title,
      b.policy_area,
      b.sponsor,
      b.latest_action,
      b.summary_text,
      b.updated_at
    from bills b
    order by b.updated_at desc
    limit ${limit};
  `;

  const billIds = bills.rows
    .map((r: any) => Number(r.id))
    .filter((n: number) => Number.isFinite(n));

  let rollCallsByBill: Record<string, any[]> = {};

  if (billIds.length) {
    // Build a safe parameterized IN (...) list without sql.array
    const placeholders = billIds.map((_, i) => `$${i + 1}`).join(", ");
    const query = `
      select
        brc.bill_id,
        rc.id as roll_call_id,
        rc.chamber,
        rc.rollcall_number,
        rc.vote_date,
        rc.question,
        rc.result,
        rc.vote_url,
        rcs.yea,
        rcs.nay,
        rcs.not_voting,
        rcs.present
      from bill_roll_calls brc
      join roll_calls rc on rc.id = brc.roll_call_id
      left join roll_call_stats rcs on rcs.roll_call_id = rc.id
      where brc.bill_id in (${placeholders})
      order by rc.vote_date desc nulls last;
    `;

    const rc = await sql.query(query, billIds);

    rollCallsByBill = {};
    rc.rows.forEach((row: any) => {
      const k = String(row.bill_id);
      if (!rollCallsByBill[k]) rollCallsByBill[k] = [];
      rollCallsByBill[k].push(row);
    });
  }

  const payload = bills.rows.map((b: any) => ({
    ...b,
    rollCalls: rollCallsByBill[String(b.id)] || []
  }));

  return NextResponse.json({ bills: payload });
}
