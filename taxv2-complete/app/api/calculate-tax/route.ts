import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request: NextRequest) {
  try {
    const { salary, filingStatus = 'single' } = await request.json();

    if (!salary || salary <= 0) {
      return NextResponse.json(
        { error: 'Valid salary is required' },
        { status: 400 }
      );
    }

    // Get tax brackets for 2024
    const brackets = await sql`
      SELECT min_income, max_income, rate
      FROM tax_brackets
      WHERE year = 2024 AND filing_status = ${filingStatus}
      ORDER BY min_income ASC;
    `;

    if (brackets.rows.length === 0) {
      return NextResponse.json(
        { error: 'Tax brackets not found' },
        { status: 404 }
      );
    }

    // Calculate federal income tax
    let totalTax = 0;
    let remainingIncome = parseFloat(salary);

    for (const bracket of brackets.rows) {
      const minIncome = parseFloat(bracket.min_income);
      const maxIncome = bracket.max_income ? parseFloat(bracket.max_income) : Infinity;
      const rate = parseFloat(bracket.rate) / 100;

      if (remainingIncome <= 0) break;

      const taxableInThisBracket = Math.min(
        remainingIncome,
        maxIncome - minIncome
      );

      if (taxableInThisBracket > 0) {
        totalTax += taxableInThisBracket * rate;
        remainingIncome -= taxableInThisBracket;
      }
    }

    // Calculate effective tax rate
    const effectiveRate = (totalTax / parseFloat(salary)) * 100;

    // Calculate FICA (Social Security + Medicare)
    const socialSecurityTax = Math.min(parseFloat(salary), 168600) * 0.062;
    const medicareTax = parseFloat(salary) * 0.0145;
    const ficaTax = socialSecurityTax + medicareTax;

    const totalFederalTax = totalTax + ficaTax;

    return NextResponse.json({
      salary: parseFloat(salary),
      filingStatus,
      incomeTax: Math.round(totalTax * 100) / 100,
      ficaTax: Math.round(ficaTax * 100) / 100,
      totalFederalTax: Math.round(totalFederalTax * 100) / 100,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      takeHome: Math.round((parseFloat(salary) - totalFederalTax) * 100) / 100
    });
  } catch (error) {
    console.error('Error calculating tax:', error);
    return NextResponse.json(
      { error: 'Failed to calculate tax' },
      { status: 500 }
    );
  }
}
