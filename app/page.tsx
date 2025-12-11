"use client";

import { useState } from "react";

type BillSummary = {
  billId: string;
  title: string;
  shortName: string;
  year: number;
  category: string;
  description: string;
};

const BILL_SUMMARIES: Record<string, BillSummary> = {
  HR4366: {
    billId: "HR4366",
    title: "Consolidated Appropriations Act, 2024",
    shortName: "2024 Federal Spending Bill",
    year: 2024,
    category: "Annual appropriations",
    description:
      "Sets full-year funding levels for most federal agencies and programs — including defense, health, education, transportation, and more. It keeps the government operating and directs how a large share of annual tax revenue is spent."
  },
  HR3684: {
    billId: "HR3684",
    title: "Infrastructure Investment and Jobs Act (2021)",
    shortName: "Bipartisan Infrastructure Law",
    year: 2021,
    category: "Infrastructure & transportation",
    description:
      "Authorizes hundreds of billions in long-term investment in roads, bridges, public transit, rail, ports, airports, broadband, and clean water projects across the country."
  },
  HR1319: {
    billId: "HR1319",
    title: "American Rescue Plan Act of 2021",
    shortName: "COVID Rescue Package",
    year: 2021,
    category: "COVID relief & economic support",
    description:
      "A major pandemic-era relief law that funded stimulus checks, enhanced unemployment benefits, vaccine distribution, school reopening, and aid to state and local governments."
  },
  HR5376: {
    billId: "HR5376",
    title: "Inflation Reduction Act of 2022",
    shortName: "Climate & Tax Law",
    year: 2022,
    category: "Energy, climate, health & tax enforcement",
    description:
      "Funds clean energy and climate programs, extends Affordable Care Act subsidies, and invests in IRS enforcement, partly paid for by changes to corporate and high-income taxes."
  }
};

export default function Home() {
  const [income, setIncome] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedBillId(null);

    try {
      const response = await fetch("/api/tax-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          income: Number(income),
          zip: zip
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const formattedTax =
    result && result.estimatedFederalIncomeTax
      ? result.estimatedFederalIncomeTax.toLocaleString("en-US", {
          style: "currency",
          currency: "USD"
        })
      : null;

  const selectedBill: BillSummary | null =
    selectedBillId && BILL_SUMMARIES[selectedBillId]
      ? BILL_SUMMARIES[selectedBillId]
      : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #f5f5f7, #ffffff)",
        padding: "32px 16px"
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24
        }}
      >
        {/* Header */}
        <header>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>My Tax Receipt</h1>
          <p style={{ maxWidth: 600, color: "#555", fontSize: 14 }}>
            Enter your income and ZIP code to see a rough estimate of where your
            federal income tax goes and how your members of Congress vote on
            major funding laws that direct that money.
          </p>
        </header>

        {/* Input card */}
        <section
          style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            padding: 24,
            border: "1px solid #eee"
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "flex-end"
            }}
          >
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                Income
              </label>
              <input
                type="number"
                placeholder="e.g. 90000"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 14
                }}
              />
            </div>

            <div style={{ flex: "1 1 140px", minWidth: 0 }}>
              <label
                style={{
                  display: "block",
                  marginBottom: 4,
                  fontSize: 14,
                  fontWeight: 500
                }}
              >
                ZIP code
              </label>
              <input
                placeholder="e.g. 10003"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 14
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "10px 18px",
                borderRadius: 999,
                border: "none",
                background: loading ? "#999" : "#111827",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "default" : "pointer",
                minWidth: 120
              }}
            >
              {loading ? "Calculating..." : "Generate"}
            </button>
          </form>

          {error && (
            <p style={{ color: "red", marginTop: 12, fontSize: 14 }}>{error}</p>
          )}

          {result && (
            <div style={{ marginTop: 16, fontSize: 14, color: "#444" }}>
              <div style={{ marginBottom: 4 }}>
                Estimated federal income tax:{" "}
                <strong>{formattedTax ?? result.estimatedFederalIncomeTax}</strong>
              </div>
              <div>
                Income bucket: <strong>{result.incomeBucket}</strong>
              </div>
            </div>
          )}
        </section>

        {/* Main content layout */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 2fr)",
            gap: 24
          }}
        >
          {/* Tax breakdown */}
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              Where your tax roughly goes
            </h2>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Based on broad federal budget categories. This is an approximation,
              not an official statement.
            </p>

            {result && result.breakdown ? (
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  border: "1px solid #eee",
                  overflow: "hidden"
                }}
              >
                {result.breakdown.map((item: any, index: number) => (
                  <div
                    key={item.code}
                    style={{
                      padding: "10px 14px",
                      borderTop: index === 0 ? "none" : "1px solid #f0f0f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline"
                    }}
                  >
                    <div>
                      <strong>{item.name}</strong>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                          marginTop: 2
                        }}
                      >
                        {Math.round(item.share * 100)}% of federal budget
                      </div>
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14
                      }}
                    >
                      $
                      {item.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
                Enter your income and ZIP above to generate a tax receipt.
              </div>
            )}
          </div>

          {/* Right side: Reps + Bill details stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Representatives */}
            <div>
              <h2 style={{ fontSize: 20, marginBottom: 8 }}>Who represents you</h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                These are your current members of Congress by ZIP. Below each name
                you can see how they align on major funding laws that shape where
                your federal tax dollars go.
              </p>

              {result && result.representatives ? (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {result.representatives.map((rep: any) => (
                    <div
                      key={rep.id}
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        border: "1px solid #eee",
                        padding: 12
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: 4
                        }}
                      >
                        <div>
                          <strong>{rep.name}</strong>{" "}
                          <span style={{ fontSize: 13, color: "#666" }}>
                            ({rep.party || "?"},{" "}
                            {rep.chamber === "senate" ? "Senate" : "House"})
                          </span>
                        </div>
                        {rep.source && (
                          <span style={{ fontSize: 11, color: "#999" }}>
                            source: {rep.source}
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#777",
                          marginBottom: 4
                        }}
                      >
                        Voting on major funding laws:
                      </div>

                      {rep.votes && rep.votes.length > 0 ? (
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 18,
                            fontSize: 13,
                            color: "#444"
                          }}
                        >
                          {rep.votes.map((vote: any, index: number) => (
                            <li key={index}>
                              <button
                                type="button"
                                onClick={() => setSelectedBillId(vote.billId)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  margin: 0,
                                  cursor: "pointer",
                                  color: "#1d4ed8",
                                  textDecoration: "underline",
                                  fontSize: 13
                                }}
                              >
                                {vote.billTitle}
                              </button>
                              {": "}
                              <strong
                                style={{
                                  color:
                                    vote.position === "Yea"
                                      ? "#047857"
                                      : vote.position === "Nay"
                                      ? "#b91c1c"
                                      : "#6b7280"
                                }}
                              >
                                {vote.position}
                              </strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: 12, color: "#777" }}>
                          Voting record on specific spending bills coming next.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
                  Once you generate a tax receipt, your current House member and
                  Senators will show up here.
                </div>
              )}
            </div>

            {/* Bill detail panel */}
            <div>
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>Bill details</h3>
              {selectedBill ? (
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    border: "1px solid #eee",
                    padding: 12,
                    fontSize: 13
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <strong>{selectedBill.title}</strong>
                  </div>
                  <div style={{ color: "#555", marginBottom: 4 }}>
                    <span>{selectedBill.shortName}</span> •{" "}
                    <span>{selectedBill.year}</span> •{" "}
                    <span>{selectedBill.category}</span>
                  </div>
                  <p style={{ margin: 0, color: "#444", lineHeight: 1.4 }}>
                    {selectedBill.description}
                  </p>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "#888"
                    }}
                  >
                    You&apos;re seeing how your representatives voted on this law,
                    which is one of the major ways Congress shapes where federal tax
                    dollars are spent.
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "#f9fafb",
                    borderRadius: 10,
                    border: "1px dashed #d1d5db",
                    padding: 10,
                    fontSize: 12,
                    color: "#6b7280"
                  }}
                >
                  Click any bill title in the voting history above to see what that
                  law funded and why it matters for how your tax dollars are used.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
