import { NextRequest, NextResponse } from 'next/server';

// ProPublica API wrapper
const PROPUBLICA_API_KEY = process.env.PROPUBLICA_API_KEY || '';

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

    // Use a free zip code API to get congressional district
    // Note: This is a basic implementation. For production, you'd want a more reliable service
    let state = '';
    let district = '';

    // Simple zip to state mapping (you'd want a complete database for production)
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

    // Fetch representatives from ProPublica API
    const representatives: any[] = [];

    if (PROPUBLICA_API_KEY) {
      try {
        // Get senators
        const senatorsResponse = await fetch(
          `https://api.propublica.org/congress/v1/members/senate/${state}/current.json`,
          {
            headers: {
              'X-API-Key': PROPUBLICA_API_KEY
            }
          }
        );

        if (senatorsResponse.ok) {
          const senatorsData = await senatorsResponse.json();
          representatives.push(...senatorsData.results);
        }

        // Get house members (this requires district number)
        // For now, we'll return senators only
        // In production, you'd have a zip->district mapping in your database
      } catch (error) {
        console.error('Error fetching from ProPublica:', error);
      }
    }

    return NextResponse.json({
      zipCode,
      state,
      district,
      representatives: representatives.map(rep => ({
        id: rep.id,
        name: rep.name,
        party: rep.party,
        chamber: rep.chamber || 'Senate',
        state: rep.state,
        district: rep.district,
        twitter: rep.twitter_account,
        youtube: rep.youtube_account,
        office: rep.office,
        phone: rep.phone
      })),
      note: PROPUBLICA_API_KEY 
        ? 'Live data from ProPublica API' 
        : 'ProPublica API key not configured. Add PROPUBLICA_API_KEY to environment variables.'
    });
  } catch (error) {
    console.error('Error fetching representatives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch representatives' },
      { status: 500 }
    );
  }
}
