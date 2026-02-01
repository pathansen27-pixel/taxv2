import { sql } from '@vercel/postgres';

export async function initializeDatabase() {
  try {
    // Create tables if they don't exist
    await sql`
      CREATE TABLE IF NOT EXISTS budget_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        percentage DECIMAL(5,2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS representatives (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        party VARCHAR(50),
        state VARCHAR(2),
        district VARCHAR(10),
        chamber VARCHAR(20),
        image_url TEXT,
        twitter VARCHAR(100),
        youtube VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS votes (
        id VARCHAR(100) PRIMARY KEY,
        bill_number VARCHAR(50),
        question TEXT NOT NULL,
        description TEXT,
        vote_date DATE NOT NULL,
        chamber VARCHAR(20),
        result VARCHAR(50),
        total_yes INT,
        total_no INT,
        total_not_voting INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS member_votes (
        id SERIAL PRIMARY KEY,
        vote_id VARCHAR(100) REFERENCES votes(id),
        representative_id VARCHAR(50) REFERENCES representatives(id),
        position VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vote_id, representative_id)
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS zip_districts (
        zip_code VARCHAR(10) PRIMARY KEY,
        state VARCHAR(2),
        congressional_district VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tax_brackets (
        id SERIAL PRIMARY KEY,
        year INT NOT NULL,
        filing_status VARCHAR(50) NOT NULL,
        min_income DECIMAL(12,2) NOT NULL,
        max_income DECIMAL(12,2),
        rate DECIMAL(5,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function seedDatabase() {
  try {
    // Seed budget categories
    const budgetData = [
      { name: 'Social Security', percentage: 21.0, description: 'Retirement and disability benefits' },
      { name: 'Medicare', percentage: 14.0, description: 'Health insurance for seniors and disabled' },
      { name: 'Medicaid', percentage: 10.0, description: 'Health insurance for low-income individuals' },
      { name: 'Defense', percentage: 13.0, description: 'Department of Defense and military operations' },
      { name: 'Interest on Debt', percentage: 10.0, description: 'Interest payments on federal debt' },
      { name: 'Veterans Benefits', percentage: 5.0, description: 'Benefits and services for veterans' },
      { name: 'Education', percentage: 4.0, description: 'Federal education programs and student aid' },
      { name: 'Transportation', percentage: 3.0, description: 'Infrastructure and transportation programs' },
      { name: 'Agriculture', percentage: 2.5, description: 'Farm subsidies and nutrition programs' },
      { name: 'Science & Technology', percentage: 2.0, description: 'NASA, NIH, NSF research funding' },
      { name: 'Housing & Community', percentage: 2.0, description: 'Housing assistance and community development' },
      { name: 'International Affairs', percentage: 1.5, description: 'Foreign aid and diplomatic operations' },
      { name: 'Energy & Environment', percentage: 1.5, description: 'EPA and energy programs' },
      { name: 'Justice & Law Enforcement', percentage: 2.0, description: 'Courts, prisons, and law enforcement' },
      { name: 'Other', percentage: 8.5, description: 'All other federal spending' }
    ];

    for (const cat of budgetData) {
      await sql`
        INSERT INTO budget_categories (name, percentage, description)
        VALUES (${cat.name}, ${cat.percentage}, ${cat.description})
        ON CONFLICT DO NOTHING;
      `;
    }

    // Seed tax brackets for 2024
    const taxBracketsSingle = [
      { year: 2024, status: 'single', min: 0, max: 11600, rate: 10.0 },
      { year: 2024, status: 'single', min: 11600, max: 47150, rate: 12.0 },
      { year: 2024, status: 'single', min: 47150, max: 100525, rate: 22.0 },
      { year: 2024, status: 'single', min: 100525, max: 191950, rate: 24.0 },
      { year: 2024, status: 'single', min: 191950, max: 243725, rate: 32.0 },
      { year: 2024, status: 'single', min: 243725, max: 609350, rate: 35.0 },
      { year: 2024, status: 'single', min: 609350, max: null, rate: 37.0 }
    ];

    const taxBracketsMarried = [
      { year: 2024, status: 'married', min: 0, max: 23200, rate: 10.0 },
      { year: 2024, status: 'married', min: 23200, max: 94300, rate: 12.0 },
      { year: 2024, status: 'married', min: 94300, max: 201050, rate: 22.0 },
      { year: 2024, status: 'married', min: 201050, max: 383900, rate: 24.0 },
      { year: 2024, status: 'married', min: 383900, max: 487450, rate: 32.0 },
      { year: 2024, status: 'married', min: 487450, max: 731200, rate: 35.0 },
      { year: 2024, status: 'married', min: 731200, max: null, rate: 37.0 }
    ];

    for (const bracket of [...taxBracketsSingle, ...taxBracketsMarried]) {
      await sql`
        INSERT INTO tax_brackets (year, filing_status, min_income, max_income, rate)
        VALUES (${bracket.year}, ${bracket.status}, ${bracket.min}, ${bracket.max}, ${bracket.rate})
        ON CONFLICT DO NOTHING;
      `;
    }

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}
