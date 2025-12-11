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

  return (
    <main style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <h1>My Tax Receipt</h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          type="number"
          placeholder="Income"
          value={income}
          onChange={(e) => setIncome(e.target.value)}
        />
        <input
          placeholder="ZIP code"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Calculating..." : "Generate"}
        </button>
      </form>

      {error && (
        <p style={{ color: "red", marginTop: 16 }}>
          {error}
        </p>
      )}

      {/* Debug JSON view */}
      {result && (
        <pre style={{ marginTop: 24, background: "#f5f5f5", padding: 12 }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {/* Nicely formatted tax breakdown */}
      {result && result.breakdown && (
        <div style={{ marginTop: 24 }}>
          <h2>Tax breakdown</h2>
          {result.breakdown.map((item: any) => (
            <div
              key={item.code}
              style={{ padding: 4, borderBottom: "1px solid #ddd" }}
            >
              <strong>{item.name}</strong>{" "}
              <span>(${item.amount} of your estimated tax)</span>
            </div>
          ))}
        </div>
      )}

      {/* Nicely formatted representatives */}
      {result && result.representatives && (
        <div style={{ marginTop: 24 }}>
          <h2>Your representatives (demo data)</h2>
          {result.representatives.map((rep: any) => (
            <div
              key={rep.id}
              style={{
                padding: 8,
                border: "1px solid #ddd",
                marginBottom: 8
              }}
            >
              <div>
                <strong>{rep.name}</strong> ({rep.party}, {rep.chamber})
              </div>
              {rep.votes?.length > 0 && (
                <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                  {rep.votes.map((vote: any, index: number) => (
                    <li key={index}>
                      {vote.billTitle}: <strong>{vote.position}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
