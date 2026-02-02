import { NextRequest, NextResponse } from 'next/server';

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chamber = searchParams.get('chamber') || 'both'; // house, senate, or both

    if (!CONGRESS_API_KEY) {
      return NextResponse.json({
        error: 'Congress API key not configured',
        message: 'Add CONGRESS_API_KEY to your environment variables. Get a free key at https://api.congress.gov/sign-up/',
        votes: []
      });
    }

    const votes: any[] = [];
    const congress = 119; // Current congress (2025-2026)

    // Fetch recent votes from House
    if (chamber === 'house' || chamber === 'both') {
      try {
        const houseResponse = await fetch(
          `https://api.congress.gov/v3/vote/${congress}/house?limit=10&format=json&api_key=${CONGRESS_API_KEY}`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (houseResponse.ok) {
          const houseData = await houseResponse.json();
          votes.push(...(houseData.votes || []).map((vote: any) => ({
            id: `house-${vote.voteNumber}`,
            chamber: 'House',
            rollCall: vote.voteNumber,
            question: vote.question || vote.voteType,
            description: vote.description || '',
            voteDate: vote.date,
            result: vote.result,
            billNumber: vote.bill?.number || null,
            totalYes: vote.totals?.yeas || 0,
            totalNo: vote.totals?.nays || 0,
            totalNotVoting: vote.totals?.notVoting || 0
          })));
        }
      } catch (error) {
        console.error('Error fetching House votes:', error);
      }
    }

    // Fetch recent votes from Senate
    if (chamber === 'senate' || chamber === 'both') {
      try {
        const senateResponse = await fetch(
          `https://api.congress.gov/v3/vote/${congress}/senate?limit=10&format=json&api_key=${CONGRESS_API_KEY}`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (senateResponse.ok) {
          const senateData = await senateResponse.json();
          votes.push(...(senateData.votes || []).map((vote: any) => ({
            id: `senate-${vote.voteNumber}`,
            chamber: 'Senate',
            rollCall: vote.voteNumber,
            question: vote.question || vote.voteType,
            description: vote.description || '',
            voteDate: vote.date,
            result: vote.result,
            billNumber: vote.bill?.number || null,
            totalYes: vote.totals?.yeas || 0,
            totalNo: vote.totals?.nays || 0,
            totalNotVoting: vote.totals?.notVoting || 0
          })));
        }
      } catch (error) {
        console.error('Error fetching Senate votes:', error);
      }
    }

    // Sort by date
    votes.sort((a, b) => {
      const dateA = new Date(a.voteDate);
      const dateB = new Date(b.voteDate);
      return dateB.getTime() - dateA.getTime();
    });

    return NextResponse.json({
      votes: votes.slice(0, 20),
      count: votes.length,
      chamber,
      congress,
      dataSource: 'Congress.gov API'
    });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch votes' },
      { status: 500 }
    );
  }
}
