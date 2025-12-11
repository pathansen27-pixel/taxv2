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
  source?: "govtrack" | "fallback";
};

async function getRepsForZip(zip: string): Promise<Representative[]> {
  const cleaned = zip.trim();

  try {
    const response = await fetch(
      `https://www.govtrack.us/api/v2/role?current=true&zip=${encodeURIComponent(
        cleaned
      )}`
    );

    if (!response.ok) {
      throw new Error(`GovTrack request failed: ${response.status}`);
    }

    const data = await response.json();

    const reps: Representative[] = (data.objects || []).map((role: any) => ({
      id:
        role.person?.id?.toString() ??
        role.id?.toString() ??
        `${role.role_type}-${role.state}`,
      name: role.person?.name || "Unknown",
      chamber: role.role_type === "senator" ? "senate" : "house",
      party: role.party || "Unknown",
      votes: [],
      source: "govtrack"
    }));

    if (reps.length > 0) {
      return reps;
    }

    throw new Error("No reps returned for this ZIP");
  } catch (err) {
    console.error("Error fetching reps from GovTrack:", err);

    // Fallback demo reps so the app always works
    return [
      {
        id: "H001",
        name: "Rep Example",
        chamber: "house",
        party: "D",
        votes: [
          {
            billId: "HR1234",
            billTitle: "Consolidated Appropriations Act 2024",
            position: "Yea"
          }
        ],
        source: "fallback"
      },
      {
        id: "S001",
        name: "Senator One",
        chamber: "senate",
        party: "R",
        votes: [
          {
            billId: "HR1234",
            billTitle: "Consolidated Appropriations Act 2024",
            position: "Nay"
          }
        ],
        source: "fallback"
      },
      {
        id: "S002",
        name: "Senator Two",
        chamber: "senate",
        party: "D",
        votes: [
          {
            billId: "HR1234",
            billTitle: "Consolidated Appropriations Act 2024",
            position: "Yea"
          }
        ],
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

  const dummyBreakdown = [
    { code: "650", name: "Social Security", share: 0.21 },
    { code: "570", name: "Medicare", share: 0.14 },
    { code: "050", name: "National Defense", share: 0.13 }
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