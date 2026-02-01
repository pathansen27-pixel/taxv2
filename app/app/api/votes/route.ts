import { NextRequest, NextResponse } from 'next/server';

const PROPUBLICA_API_KEY = process.env.PROPUBLICA_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const chamber = searchParams.get('chamber') || 'both'; // house, senate, or both

    if (!PROPUBLICA_API_KEY) {
      return NextResponse.json({
        error: 'ProPublica API key not configured',
        message: 'Add PROPUBLICA_API_KEY to your environment variables to fetch live vote data',
        votes: []
      });
    }

    const votes: any[] = [];

    // Fetch recent votes from House
    if (chamber === 'house' || chamber === 'both') {
      try {
        const houseResponse = await fetch(
          'https://api.propublica.org/congress/v1/118/house/votes/recent.json',
          {
            headers: {
              'X-API-Key': PROPUBLICA_API_KEY
            }
          }
        );

        if (houseResponse.ok) {
          const houseData = await houseResponse.json();
          votes.push(...houseData.results.votes.slice(0, 10).map((vote: any) => ({
            id: `house-${vote.roll_call}`,
            chamber: 'House',
            rollCall: vote.roll_call,
            question: vote.question,
            description: vote.description,
            voteDate: vote.date,
            voteTime: vote.time,
            result: vote.result,
            billNumber: vote.bill?.number || null,
            totalYes: vote.total.yes,
            totalNo: vote.total.no,
            totalNotVoting: vote.total.not_voting,
            democraticYes: vote.democratic.yes,
            democraticNo: vote.democratic.no,
            republicanYes: vote.republican.yes,
            republicanNo: vote.republican.no
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
          'https://api.propublica.org/congress/v1/118/senate/votes/recent.json',
          {
            headers: {
              'X-API-Key': PROPUBLICA_API_KEY
            }
          }
        );

        if (senateResponse.ok) {
          const senateData = await senateResponse.json();
          votes.push(...senateData.results.votes.slice(0, 10).map((vote: any) => ({
            id: `senate-${vote.roll_call}`,
            chamber: 'Senate',
            rollCall: vote.roll_call,
            question: vote.question,
            description: vote.description,
            voteDate: vote.date,
            voteTime: vote.time,
            result: vote.result,
            billNumber: vote.bill?.number || null,
            totalYes: vote.total.yes,
            totalNo: vote.total.no,
            totalNotVoting: vote.total.not_voting,
            democraticYes: vote.democratic.yes,
            democraticNo: vote.democratic.no,
            republicanYes: vote.republican.yes,
            republicanNo: vote.republican.no
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
      votes: votes.slice(0, 20), // Return max 20 most recent
      count: votes.length,
      chamber,
      congress: 118
    });
  } catch (error) {
    console.error('Error fetching votes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch votes' },
      { status: 500 }
    );
  }
}
