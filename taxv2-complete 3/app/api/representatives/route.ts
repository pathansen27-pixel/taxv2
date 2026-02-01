import { NextRequest, NextResponse } from 'next/server';

// Congress.gov API (official government API)
const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY || '';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const zipCode = searchParams.get('zip');

    if (!zipCode) {
      return NextResponse.json(
        { error: 'Zip code is required' },
        { status: 400 }
      );
    }

    // Get state from zip code
    let state = '';
    try {
      const zipResponse = await fetch(`https://api.zippopotam.us/us/${zipCode}`);
      if (zipResponse.ok) {
        const zipData = await zipResponse.json();
        state = zipData.places[0]['state abbreviation'];
      }
    } catch (error) {
      console.error('Error fetching zip data:', error);
    }

    if (!state) {
      return NextResponse.json(
        { error: 'Could not determine state from zip code' },
        { status: 404 }
      );
    }

    const representatives: any[] = [];

    if (CONGRESS_API_KEY) {
      try {
        // Get current members from Congress.gov API
        const membersResponse = await fetch(
          `https://api.congress.gov/v3/member?currentMember=true&limit=250&api_key=${CONGRESS_API_KEY}`,
          {
            headers: {
              'Accept': 'application/json'
            }
          }
        );

        if (membersResponse.ok) {
          const data = await membersResponse.json();
          
          // Filter for the user's state
          const stateReps = data.members?.filter((member: any) => 
            member.state === state
          ) || [];

          representatives.push(...stateReps.map((member: any) => ({
            id: member.bioguideId,
            name: member.name,
            party: member.partyName,
            chamber: member.terms?.item?.[0]?.chamber || 'Unknown',
            state: member.state,
            district: member.district,
            imageUrl: member.depiction?.imageUrl,
            office: member.terms?.item?.[0]?.memberType
          })));
        }
      } catch (error) {
        console.error('Error fetching from Congress.gov:', error);
      }
    }

    return NextResponse.json({
      zipCode,
      state,
      representatives,
      note: CONGRESS_API_KEY 
        ? 'Live data from Congress.gov API' 
        : 'Congress API key not configured. Get a free key at https://api.congress.gov/sign-up/'
    });
  } catch (error) {
    console.error('Error fetching representatives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch representatives' },
      { status: 500 }
    );
  }
}
