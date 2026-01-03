import { NextRequest, NextResponse } from "next/server";

type TaxRequest = {
  income: number;
  zip: string;
  /**
   * Optional: when true, returns a step-by-step trace the UI can render
   * without changing any calculation behavior.
   */
  includeAccountability?: boolean;
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
 * Accountability structures returned to the UI.
 * This adds transparency without changing how anything is calculated.
 */
type AccountabilityValueSource = "user_input" | "assumption" | "derived";

type AccountabilityAssumption = {
  key: string;
  label: string;
  value: number | string;
  source: AccountabilityValueSource;
};

type AccountabilityStep = {
  id: string;
  label: string;
  formula?: string;
  inputs?: Record<string, number | string>;
  output?: number | string;
  source: AccountabilityValueSource;
};

type AccountabilityPayload = {
  inputs: {
    income: number;
    zip: string;
    incomeBucket: string;
  };
  assumptions: AccountabilityAssumption[];
  steps: AccountabilityStep[];
  notes: string[];
};

/**
 * 📌 Key federal funding / spending laws we want voting history for.
 * These are all large, high-dollar laws that directly affect where tax money goes.
 */
const TARGET_BILLS = [
  {
    billId: "HR4366",
    congress: 118,
    chamber: "House",
    title: "Consolidated Appropriations Act, 2024"
  },
  {
    billId: "HR3684",
    congress: 117,
    chamber: "House",
    title: "Infrastructure Investment and Jobs Act (2021)"
  },
  {
    billId: "HR1319",
    congress: 117,
    chamber: "House",
    title: "American Rescue Plan Act of 2021"
  },
  {
    billId: "HR5376",
    congress: 117,
    chamber: "House",
    title: "Inflation Reduction Act of 2022"
  }
];

/**
 * 🗳 Congress.gov API helper (via api.data.gov)
 * Currently not used, but ready for when we wire in real votes.
 */
const CONGRESS_API_BASE = "https://api.congress.gov/v3";

async function congressFetch(
  path: string,
  params: Record<string, string | number> = {}
): Promise<any> {
  const apiKey = process.env.CONGRESS_API_KEY;
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY is not set");
  }

  const searchParams = new URLSearchParams({
    api_key: apiKey,
    format: "json"
  });

  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  const url = `${CONGRESS_API_BASE}${path}?${searchParams.toString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Congress.gov API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

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
      votes: [],
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

/**
 * 🧩 Attach voting history to each representative.
 * DEMO RULE:
 *  - Democrats → Yea on all listed funding bills
 *  - Republicans → Nay on all listed funding bills
 *  - No party info → Not Voting
 *
 * This gives you a multi-bill "history" view right now.
 * Later we’ll replace this logic with real Congress.gov roll-call data.
 */
async function attachVotesToReps(
  reps: Representative[]
): Promise<Representative[]> {
  return reps.map((rep) => {
    const votes = TARGET_BILLS.map((bill) => {
      let position: "Yea" | "Nay" | "Not Voting" = "Yea";

      if (rep.party === "R") {
        position = "Nay";
      } else if (!rep.party) {
        position = "Not Voting";
      }

      return {
        billId: bill.billId,
        billTitle: bill.title,
        position
      };
    });

    return {
      ...rep,
      votes
    };
  });
}

/**
 * Builds the accountability payload for the UI.
 * Important: This does NOT change estimateTax(). It mirrors the same math
 * so the UI can show intermediate values and assumptions.
 */
function buildAccountability(
  income: number,
  zip: string,
  incomeBucket: string,
  estimatedTax: number
): AccountabilityPayload {
  const standardDeduction = 14000;
  const rate = 0.18;

  const taxableIncome = Math.max(0, income - standardDeduction);
  const rawTax = taxableIncome * rate;
  const roundedTax = Math.round(rawTax);

  return {
    inputs: {
      income,
      zip,
      incomeBucket
    },
    assumptions: [
      {
        key: "standardDeduction",
        label: "Standard deduction",
        value: standardDeduction,
        source: "assumption"
      },
      {
        key: "rate",
        label: "Flat rate",
        value: rate,
        source: "assumption"
      },
      {
        key: "rounding",
        label: "Rounding",
        value: "Nearest whole dollar (Math.round)",
        source: "assumption"
      }
    ],
    steps: [
      {
        id: "bucketIncome",
        label: "Income bucket",
        formula:
          'if income < 35000 => "0-35k"; < 60000 => "35k-60k"; < 100000 => "60k-100k"; else "100k+"',
        inputs: { income },
        output: incomeBucket,
        source: "derived"
      },
      {
        id: "taxableIncome",
        label: "Taxable income",
        formula: "max(0, income - standardDeduction)",
        inputs: { income, standardDeduction },
        output: taxableIncome,
        source: "derived"
      },
      {
        id: "rawTax",
        label: "Raw tax before rounding",
        formula: "taxableIncome * rate",
        inputs: { taxableIncome, rate },
        output: Math.round(rawTax * 100) / 100,
        source: "derived"
      },
      {
        id: "roundedTax",
        label: "Estimated tax (rounded)",
        formula: "round(rawTax)",
        inputs: { rawTax },
        output: roundedTax,
        source: "derived"
      }
    ],
    notes: [
      "This is a simplified estimate, not tax filing advice.",
      "This endpoint returns an explainability trace so the UI can show how the estimate was produced."
    ]
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as TaxRequest;

  const income = Number(body.income);
  const zip = String(body.zip || "").trim();
  const includeAccountability = Boolean(body.includeAccountability);

  // Keep behavior strict and avoid NaN issues
  if (!Number.isFinite(income) || income <= 0 || !zip) {
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

  const baseReps = await getRepsForZip(zip);
  const representatives = await attachVotesToReps(baseReps);

  const accountability = includeAccountability
    ? buildAccountability(income, zip, incomeBucket, estimatedTax)
    : null;

  return NextResponse.json({
    incomeBucket,
    estimatedFederalIncomeTax: estimatedTax,
    zip,
    breakdown: dummyBreakdown,
    representatives,
    accountability
  });
}
