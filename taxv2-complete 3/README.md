# Tax Accountability Tracker

A Next.js application that shows taxpayers exactly where their federal tax dollars go and how their congressional representatives vote on key issues.

## Features

- **Tax Calculator**: Calculate your federal income tax based on 2024 tax brackets
- **Budget Breakdown**: See how your tax dollars are allocated across federal spending categories
- **Representatives Lookup**: Find your congressional representatives by zip code
- **Recent Votes**: Track recent congressional votes on important legislation
- **Live Data**: Integrates with ProPublica Congress API for real congressional vote data

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Database**: Vercel Postgres
- **Styling**: Tailwind CSS
- **API**: ProPublica Congress API
- **Deployment**: Vercel

## Setup Instructions

### 1. Clone or Copy Files

Copy all files from this project into your existing `taxv2` repository.

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Vercel Postgres

1. Go to your Vercel project dashboard
2. Navigate to Storage → Create Database → Postgres
3. Copy all the environment variables Vercel provides
4. Create a `.env.local` file in your project root
5. Paste the Vercel Postgres environment variables

### 4. Get ProPublica API Key (Optional but Recommended)

1. Visit https://www.propublica.org/datastore/api/propublica-congress-api
2. Request a free API key
3. Add to your `.env.local`:
   ```
   PROPUBLICA_API_KEY=your_key_here
   ```

Your `.env.local` should look like:

```env
POSTGRES_URL="postgres://..."
POSTGRES_PRISMA_URL="postgres://..."
POSTGRES_URL_NON_POOLING="postgres://..."
POSTGRES_USER="default"
POSTGRES_HOST="your-host.postgres.vercel-storage.com"
POSTGRES_PASSWORD="your-password"
POSTGRES_DATABASE="verceldb"

PROPUBLICA_API_KEY="your-propublica-key"
```

### 5. Initialize Database

After setting up your environment variables, you need to create the database tables and seed them with data.

**Option A: Using the API endpoint (Recommended)**

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to http://localhost:3000/api/init-db in your browser (or use curl):
   ```bash
   curl -X POST http://localhost:3000/api/init-db
   ```

3. You should see a success message

**Option B: Using Vercel SQL Query Tool**

1. Go to your Vercel project → Storage → Your Postgres database
2. Click "Query" tab
3. Copy and paste the contents of `sql/schema.sql`
4. Click "Run"
5. Then copy and paste the contents of `sql/seed.sql`
6. Click "Run"

### 6. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3000 to see your app!

### 7. Deploy to Vercel

```bash
# If you haven't already
npm install -g vercel

# Deploy
vercel

# Or push to GitHub and Vercel will auto-deploy
git add .
git commit -m "Complete tax accountability app"
git push
```

Make sure to add your environment variables in Vercel:
1. Go to your project settings
2. Navigate to Environment Variables
3. Add all variables from your `.env.local`

## Project Structure

```
taxv2/
├── app/
│   ├── api/
│   │   ├── budget-breakdown/  # Budget allocation API
│   │   ├── calculate-tax/     # Tax calculation API
│   │   ├── init-db/          # Database initialization
│   │   ├── representatives/   # Representative lookup API
│   │   └── votes/            # Congressional votes API
│   ├── lib/
│   │   └── db.ts             # Database utilities
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx              # Main application UI
├── sql/
│   ├── schema.sql            # Database schema
│   └── seed.sql              # Seed data
├── .env.example
├── next.config.js
├── package.json
├── README.md
└── tsconfig.json
```

## API Endpoints

### POST /api/calculate-tax
Calculate federal income tax.

**Request:**
```json
{
  "salary": 75000,
  "filingStatus": "single"
}
```

**Response:**
```json
{
  "salary": 75000,
  "incomeTax": 10294.50,
  "ficaTax": 5737.50,
  "totalFederalTax": 16032.00,
  "effectiveRate": 21.38,
  "takeHome": 58968.00
}
```

### POST /api/budget-breakdown
Get breakdown of where tax dollars go.

**Request:**
```json
{
  "totalTax": 16032
}
```

### GET /api/representatives?zip=20001
Get congressional representatives by zip code.

### GET /api/votes?chamber=both
Get recent congressional votes.

## How It Works

1. **User Input**: User enters their salary and zip code
2. **Tax Calculation**: App calculates federal income tax using 2024 brackets
3. **Budget Breakdown**: Shows allocation across 15 major spending categories
4. **Representative Lookup**: Uses zip code to find senators and house members
5. **Vote Tracking**: Displays recent votes from ProPublica API

## Current Limitations & Future Improvements

### Current Limitations
- Only federal taxes (no state/local)
- Simplified zip-to-district mapping
- Budget categories are high-level (not itemized)
- 2024 tax year only
- Limited to recent votes (not full voting history)

### Planned Improvements
- State tax calculations
- More detailed budget line items
- Historical vote tracking
- Representative voting scorecards
- Email alerts for key votes
- Export tax reports as PDF
- Comparison with other income levels

## Data Sources

- **Tax Brackets**: IRS 2024 tax tables
- **Budget Data**: Office of Management and Budget
- **Congressional Data**: ProPublica Congress API
- **Zip Codes**: Zippopotam.us API

## Contributing

This is a proof of concept. To improve it:

1. **Better Zip Mapping**: Implement a complete zip-to-district database
2. **State Taxes**: Add state tax calculations
3. **More Granular Budget**: Break down categories into programs
4. **Voting Records**: Store and analyze voting patterns
5. **Historical Data**: Track budget changes over time

## Troubleshooting

**Database errors:**
- Make sure you've run the initialization endpoint
- Check that your Postgres environment variables are correct

**No representatives showing:**
- Add ProPublica API key to environment variables
- Check that zip code is 5 digits

**No votes appearing:**
- Requires ProPublica API key
- Check API rate limits (5000 requests/day)

## License

MIT

## Questions?

This is a working MVP. It demonstrates the core concept but has room for significant expansion. The architecture is designed to scale as you add more features.
