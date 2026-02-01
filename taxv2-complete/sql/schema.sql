-- Federal Budget Categories
CREATE TABLE IF NOT EXISTS budget_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Congressional Representatives
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

-- Congressional Votes
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

-- Individual Member Votes
CREATE TABLE IF NOT EXISTS member_votes (
  id SERIAL PRIMARY KEY,
  vote_id VARCHAR(100) REFERENCES votes(id),
  representative_id VARCHAR(50) REFERENCES representatives(id),
  position VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vote_id, representative_id)
);

-- Zip Code to Congressional District Mapping
CREATE TABLE IF NOT EXISTS zip_districts (
  zip_code VARCHAR(10) PRIMARY KEY,
  state VARCHAR(2),
  congressional_district VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tax Brackets (Federal)
CREATE TABLE IF NOT EXISTS tax_brackets (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  filing_status VARCHAR(50) NOT NULL,
  min_income DECIMAL(12,2) NOT NULL,
  max_income DECIMAL(12,2),
  rate DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_votes_date ON votes(vote_date DESC);
CREATE INDEX idx_votes_chamber ON votes(chamber);
CREATE INDEX idx_member_votes_rep ON member_votes(representative_id);
CREATE INDEX idx_zip_districts_state ON zip_districts(state);
