import { NextResponse } from 'next/server';
import { initializeDatabase, seedDatabase } from '@/app/lib/db';

export async function POST() {
  try {
    await initializeDatabase();
    await seedDatabase();
    
    return NextResponse.json({
      success: true,
      message: 'Database initialized and seeded successfully'
    });
  } catch (error) {
    console.error('Error initializing database:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to initialize database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to initialize the database',
    endpoints: {
      initialize: 'POST /api/init-db'
    }
  });
}
