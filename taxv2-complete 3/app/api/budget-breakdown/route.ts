import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    const { totalTax } = await request.json();

    if (!totalTax || totalTax <= 0) {
      return NextResponse.json(
        { error: 'Valid tax amount is required' },
        { status: 400 }
      );
    }

    // Get budget categories
    const categories = await sql`
      SELECT name, percentage, description
      FROM budget_categories
      ORDER BY percentage DESC;
    `;

    if (categories.rows.length === 0) {
      return NextResponse.json(
        { error: 'Budget categories not found' },
        { status: 404 }
      );
    }

    const taxAmount = parseFloat(totalTax);

    // Calculate allocation for each category
    const breakdown = categories.rows.map(cat => ({
      category: cat.name,
      percentage: parseFloat(cat.percentage),
      amount: Math.round((taxAmount * parseFloat(cat.percentage) / 100) * 100) / 100,
      description: cat.description
    }));

    return NextResponse.json({
      totalTax: taxAmount,
      breakdown,
      year: 2024
    });
  } catch (error) {
    console.error('Error calculating breakdown:', error);
    return NextResponse.json(
      { error: 'Failed to calculate breakdown' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const categories = await sql`
      SELECT name, percentage, description
      FROM budget_categories
      ORDER BY percentage DESC;
    `;

    return NextResponse.json({
      categories: categories.rows,
      year: 2024
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
