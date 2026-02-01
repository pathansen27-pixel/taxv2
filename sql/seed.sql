-- Seed Federal Budget Categories (FY 2024 approximate percentages)
INSERT INTO budget_categories (name, percentage, description) VALUES
('Social Security', 21.0, 'Retirement and disability benefits'),
('Medicare', 14.0, 'Health insurance for seniors and disabled'),
('Medicaid', 10.0, 'Health insurance for low-income individuals'),
('Defense', 13.0, 'Department of Defense and military operations'),
('Interest on Debt', 10.0, 'Interest payments on federal debt'),
('Veterans Benefits', 5.0, 'Benefits and services for veterans'),
('Education', 4.0, 'Federal education programs and student aid'),
('Transportation', 3.0, 'Infrastructure and transportation programs'),
('Agriculture', 2.5, 'Farm subsidies and nutrition programs'),
('Science & Technology', 2.0, 'NASA, NIH, NSF research funding'),
('Housing & Community', 2.0, 'Housing assistance and community development'),
('International Affairs', 1.5, 'Foreign aid and diplomatic operations'),
('Energy & Environment', 1.5, 'EPA and energy programs'),
('Justice & Law Enforcement', 2.0, 'Courts, prisons, and law enforcement'),
('Other', 8.5, 'All other federal spending')
ON CONFLICT DO NOTHING;

-- Seed 2024 Tax Brackets (Single filers)
INSERT INTO tax_brackets (year, filing_status, min_income, max_income, rate) VALUES
(2024, 'single', 0, 11600, 10.0),
(2024, 'single', 11600, 47150, 12.0),
(2024, 'single', 47150, 100525, 22.0),
(2024, 'single', 100525, 191950, 24.0),
(2024, 'single', 191950, 243725, 32.0),
(2024, 'single', 243725, 609350, 35.0),
(2024, 'single', 609350, NULL, 37.0)
ON CONFLICT DO NOTHING;

-- Seed 2024 Tax Brackets (Married filing jointly)
INSERT INTO tax_brackets (year, filing_status, min_income, max_income, rate) VALUES
(2024, 'married', 0, 23200, 10.0),
(2024, 'married', 23200, 94300, 12.0),
(2024, 'married', 94300, 201050, 22.0),
(2024, 'married', 201050, 383900, 24.0),
(2024, 'married', 383900, 487450, 32.0),
(2024, 'married', 487450, 731200, 35.0),
(2024, 'married', 731200, NULL, 37.0)
ON CONFLICT DO NOTHING;
