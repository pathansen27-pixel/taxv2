"use client";

import { useState } from "react";

export default function Home() {
  const [income, setIncome] = useState<string>("");
  const [zip, setZip] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

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
          maxWidth: 900,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 24
        }}
      >
        {/* Header */}
        <header>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>My Tax Receipt</h1>
          <p style={{ maxWidth: 520, color: "#555" }}>
            Enter your income and ZIP code to see a rough estimate of where your
            federal income tax goes and who represents you in Congress.
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

        {/* Layout: tax breakdown + reps side by side on desktop */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(0, 2fr)",
            gap: 24
          }}
        >
          {/* Tax breakdown */}
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>
              Where your tax roughly goes
            </h2>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Based on recent federal budget shares. This is an approximation,
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

          {/* Representatives */}
          <div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Who represents you</h2>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Pulled from a civic data API by ZIP. Voting records on key bills
              can be layered on next.
            </p>

            {result && result.representatives ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                            {vote.billTitle}:{" "}
                            <strong>{vote.position}</strong>
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
        </section>
      </div>
    </main>
  );
}
