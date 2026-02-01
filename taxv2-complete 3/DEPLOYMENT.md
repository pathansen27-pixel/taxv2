# Deployment Guide for Tax Accountability Tracker

Follow these steps to deploy your app to production on Vercel.

## Step 1: Replace Your Existing Files

1. Download all files from the `/mnt/user-data/outputs/taxv2-complete` folder
2. Replace the corresponding files in your GitHub repo `pathansen27-pixel/taxv2`
3. Add any new files that don't exist yet

**Files to replace/add:**
- `app/page.tsx` - Main UI
- `app/layout.tsx` - Layout wrapper
- `app/globals.css` - Styles
- `app/lib/db.ts` - Database utilities
- `app/api/calculate-tax/route.ts` - Tax calculation API
- `app/api/budget-breakdown/route.ts` - Budget API
- `app/api/representatives/route.ts` - Representatives API
- `app/api/votes/route.ts` - Votes API
- `app/api/init-db/route.ts` - Database init API
- `sql/schema.sql` - Database schema
- `sql/seed.sql` - Seed data
- `package.json` - Updated dependencies
- `.env.example` - Environment variables template
- `README.md` - Documentation
- `.gitignore` - Git ignore file
- `tsconfig.json` - TypeScript config
- `tailwind.config.js` - Tailwind config
- `postcss.config.js` - PostCSS config

## Step 2: Push to GitHub

```bash
git add .
git commit -m "Complete tax accountability tracker implementation"
git push origin main
```

## Step 3: Set Up Vercel Postgres

1. Go to https://vercel.com/dashboard
2. Select your project `taxv2`
3. Click on "Storage" tab
4. Click "Create Database"
5. Select "Postgres"
6. Click "Continue"
7. Name it `taxv2-db` (or any name you prefer)
8. Click "Create"

Vercel will automatically create a database and provide you with environment variables.

## Step 4: Add Environment Variables

1. While still in your Vercel project, go to "Settings"
2. Click "Environment Variables"
3. Add the Postgres variables (Vercel should have auto-populated these after creating the database)
4. Add ProPublica API key:
   - Key: `PROPUBLICA_API_KEY`
   - Value: Get from https://www.propublica.org/datastore/api/propublica-congress-api
   - Environments: Production, Preview, Development

## Step 5: Deploy

Vercel will automatically deploy when you push to GitHub. But you can also:

1. Go to your Vercel project dashboard
2. Click "Deployments"
3. Click "Redeploy" on the latest deployment

Or use the Vercel CLI:

```bash
vercel --prod
```

## Step 6: Initialize Database

After deployment:

1. Go to your deployed site URL (e.g., `https://taxv2-one.vercel.app`)
2. Navigate to `/api/init-db` (e.g., `https://taxv2-one.vercel.app/api/init-db`)
3. This will create all tables and seed the initial data

You should see:
```json
{
  "success": true,
  "message": "Database initialized and seeded successfully"
}
```

## Step 7: Test Your App

Visit your live site and test:

1. Enter a salary (e.g., 75000)
2. Enter a zip code (e.g., 20001)
3. Click "Calculate My Tax Impact"
4. You should see:
   - Tax summary
   - Budget breakdown
   - Your representatives (if ProPublica API key is configured)
   - Recent congressional votes (if ProPublica API key is configured)

## Troubleshooting

### "Database connection failed"
- Check that Postgres database is created in Vercel
- Verify all POSTGRES_* environment variables are set
- Try redeploying after adding variables

### "ProPublica API key not configured"
- The app will work without this, but won't show representatives or votes
- Get a free API key at https://www.propublica.org/datastore/api/propublica-congress-api
- Add as `PROPUBLICA_API_KEY` in Vercel environment variables
- Redeploy

### "Tables don't exist" error
- Visit `/api/init-db` to create tables and seed data
- Or manually run SQL from `sql/schema.sql` and `sql/seed.sql` in Vercel's SQL query tool

### Changes not appearing
- Vercel caches aggressively
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Or redeploy from Vercel dashboard

## Production Checklist

- [ ] All files copied from output folder to GitHub repo
- [ ] Code pushed to GitHub
- [ ] Vercel Postgres database created
- [ ] Environment variables added in Vercel
- [ ] App deployed successfully
- [ ] Database initialized via `/api/init-db`
- [ ] ProPublica API key configured (optional)
- [ ] Tested tax calculation
- [ ] Tested budget breakdown
- [ ] Tested zip code lookup

## Next Steps

Now that your app is live, you can:

1. **Get a custom domain**: Add a domain in Vercel project settings
2. **Add analytics**: Install Vercel Analytics
3. **Set up cron jobs**: Use Vercel Cron to update vote data weekly
4. **Improve data**: Add state tax calculations, more budget categories
5. **Add features**: Email notifications, PDF exports, historical data

## Support

If you run into issues:
1. Check the Vercel deployment logs
2. Check the browser console for errors
3. Verify all environment variables are set correctly
4. Make sure the database is initialized

The app is designed to gracefully handle missing API keys - it will work without ProPublica API, just with limited functionality.
