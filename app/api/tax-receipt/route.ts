import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
};

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

type Representative = {
  id: string;
  name: string;
  chamber: "house" | "senate";
  party: string;
  votes: {
    billId: string;
    billTitle: string;
    position: "Yea" | "Nay" | "Not Voting";
  }[];
  source?: string;
};

/**
 * 📌 Key federal spending bills we want voting history for.
 * This is where you hardcode the bills you want to track.
 */
const TARGET_BILLS = [
  {
    billId: "HR4366",
    congress: 118,
    chamber: "House",
    title: "Consolidated Appropriations Act, 2024"
  }
];

/**
 * 🔥 REAL REPRESENTATIVE LOOKUP USING 5 CALLS API
 */
async function getRepsForZip(zip: string): Promise<Representative[]> {
  try {
    const url = `https://api.5calls.org/v1/representatives?location=${encodeURIComponent(
      zip
    )}`;

    const res = await fetch(url, {
      headers: {
        "X-5Calls-Token": process.env.FIVECALLS_TOKEN || ""
      }
    });

    if (!res.ok) {
      throw new Error(`5Calls API failed with status ${res.status}`);
    }

    const data = await res.json();

    if (!data || !Array.isArray(data.representatives)) {
      throw new Error("No representatives array in response");
    }

    return data.representatives.map((rep: any) => ({
      id: rep.id || rep.bioguide || "unknown",
      name: rep.name,
      chamber: rep.branch === "upper" ? "senate" : "house",
      party: rep.party || "",
      votes: [], // we will fill this later
      source: "real"
    }));
  } catch (err) {
    console.error("Rep lookup failed → using fallback", err);

    return [
      {
        id: "fallback-H",
        name: "Fallback Rep",
        chamber: "house",
        party: "D",
        votes: [],
        source: "fallback"
      },
      {
        id: "fallback-S1",
        name: "Fallback Senator 1",
        chamber: "senate",
        party: "R",
        votes: [],
        source: "fallback"
      },
      {
        id: "fallback-S2",
        name: "Fallback Senator 2",
        chamber: "senate",
        party: "D",
        votes: [],
        source: "fallback"
      }
    ];
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;
  const income = Number(body.income);
  const zip = String(body.zip || "").trim();

  if (!income || !zip) {
    return NextResponse.json(
      { error: "income and zip are required" },
      { status: 400 }
    );
  }

  const estimatedTax = estimateTax(income);
  const incomeBucket = bucketIncome(income);

  /**
   * 🧮 MORE REALISTIC BREAKDOWN OF FEDERAL SPENDING
   */
  const dummyBreakdown = [
    { code: "650", name: "Social Security", share: 0.24 },
    { code: "570", name: "Medicare", share: 0.15 },
    { code: "550", name: "Health (incl. Medicaid)", share: 0.15 },
    { code: "050", name: "National Defense", share: 0.13 },
    { code: "600", name: "Income Security / Safety Net", share: 0.11 },
    { code: "900", name: "Net Interest on the Debt", share: 0.10 },
    { code: "700", name: "Veterans’ Benefits", share: 0.05 },
    { code: "999", name: "Everything Else", share: 0.07 }
  ].map((item) => ({
    ...item,
    amount: Math.round(estimatedTax * item.share * 100) / 100
  }));

  const representatives = await getRepsForZip(zip);

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown: dummyBreakdown,
    representatives
  });
}
