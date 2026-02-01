'use client';

import { useState } from 'react';

interface TaxResult {
  salary: number;
  filingStatus: string;
  incomeTax: number;
  ficaTax: number;
  totalFederalTax: number;
  effectiveRate: number;
  takeHome: number;
}

interface BudgetBreakdown {
  category: string;
  percentage: number;
  amount: number;
  description: string;
}

interface Representative {
  id: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  twitter?: string;
  phone?: string;
}

interface Vote {
  id: string;
  chamber: string;
  question: string;
  description: string;
  voteDate: string;
  result: string;
  billNumber?: string;
  totalYes: number;
  totalNo: number;
}

export default function Home() {
  const [salary, setSalary] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [filingStatus, setFilingStatus] = useState('single');
  const [loading, setLoading] = useState(false);
  
  const [taxResult, setTaxResult] = useState<TaxResult | null>(null);
  const [breakdown, setBreakdown] = useState<BudgetBreakdown[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  const handleCalculate = async () => {
    if (!salary || parseFloat(salary) <= 0) {
      alert('Please enter a valid salary');
      return;
    }

    setLoading(true);

    try {
      // Calculate tax
      const taxResponse = await fetch('/api/calculate-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salary: parseFloat(salary), filingStatus })
      });
      const taxData = await taxResponse.json();
      setTaxResult(taxData);

      // Get budget breakdown
      const breakdownResponse = await fetch('/api/budget-breakdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalTax: taxData.totalFederalTax })
      });
      const breakdownData = await breakdownResponse.json();
      setBreakdown(breakdownData.breakdown || []);

      // Get representatives if zip code provided
      if (zipCode && zipCode.length === 5) {
        const repsResponse = await fetch(`/api/representatives?zip=${zipCode}`);
        const repsData = await repsResponse.json();
        setRepresentatives(repsData.representatives || []);
      }

      // Get recent votes
      const votesResponse = await fetch('/api/votes?chamber=both');
      const votesData = await votesResponse.json();
      setVotes(votesData.votes || []);

    } catch (error) {
      console.error('Error:', error);
      alert('Failed to calculate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">
            Tax Accountability Tracker
          </h1>
          <p className="text-lg text-gray-600">
            See exactly where your tax dollars go and how your representatives vote
          </p>
        </header>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Annual Salary ($)
              </label>
              <input
                type="number"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="75000"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zip Code (Optional)
              </label>
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="20001"
                maxLength={5}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filing Status
              </label>
              <select
                value={filingStatus}
                onChange={(e) => setFilingStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="single">Single</option>
                <option value="married">Married Filing Jointly</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleCalculate}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {loading ? 'Calculating...' : 'Calculate My Tax Impact'}
          </button>
        </div>

        {/* Tax Summary */}
        {taxResult && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Tax Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Income Tax</p>
                <p className="text-2xl font-bold text-blue-600">
                  ${taxResult.incomeTax.toLocaleString()}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">FICA Tax</p>
                <p className="text-2xl font-bold text-green-600">
                  ${taxResult.ficaTax.toLocaleString()}
                </p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Federal Tax</p>
                <p className="text-2xl font-bold text-red-600">
                  ${taxResult.totalFederalTax.toLocaleString()}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Effective Rate</p>
                <p className="text-2xl font-bold text-purple-600">
                  {taxResult.effectiveRate}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Budget Breakdown */}
        {breakdown.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Where Your ${taxResult?.totalFederalTax.toLocaleString()} Goes
            </h2>
            <div className="space-y-3">
              {breakdown.map((item, index) => (
                <div key={index} className="border-b pb-3 last:border-b-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-900">{item.category}</span>
                    <span className="text-lg font-bold text-blue-600">
                      ${item.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>{item.description}</span>
                    <span>{item.percentage}%</span>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${item.percentage}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Representatives */}
        {representatives.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Representatives</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {representatives.map((rep) => (
                <div key={rep.id} className="border rounded-lg p-4">
                  <h3 className="font-bold text-lg text-gray-900">{rep.name}</h3>
                  <p className="text-gray-600">
                    {rep.party} - {rep.chamber}
                  </p>
                  {rep.twitter && (
                    <p className="text-sm text-blue-600">@{rep.twitter}</p>
                  )}
                  {rep.phone && (
                    <p className="text-sm text-gray-600">{rep.phone}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Votes */}
        {votes.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Recent Congressional Votes</h2>
            <div className="space-y-4">
              {votes.slice(0, 10).map((vote) => (
                <div key={vote.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2">
                        {vote.chamber}
                      </span>
                      {vote.billNumber && (
                        <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                          {vote.billNumber}
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900 mt-2">{vote.question}</h3>
                      {vote.description && (
                        <p className="text-sm text-gray-600 mt-1">{vote.description}</p>
                      )}
                    </div>
                    <span className={`font-bold ${
                      vote.result === 'Passed' ? 'text-green-600' : 
                      vote.result === 'Failed' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {vote.result}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm text-gray-600">
                    <span>Yes: {vote.totalYes}</span>
                    <span>No: {vote.totalNo}</span>
                    <span className="text-gray-400">{vote.voteDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
