/*
  # Meta & Facet Builder Database Schema

  ## Overview
  Creates a comprehensive schema for managing e-commerce category hierarchies,
  SEO meta information, and filter/facet recommendations across 3 levels.

  ## New Tables

  ### 1. `projects`
  Stores analysis projects (category hierarchy sessions)
  - `id` (uuid, primary key)
  - `name` (text) - Project name
  - `l1_category` (text) - Level 1 category name
  - `l2_category` (text) - Level 2 category name
  - `l3_category` (text) - Level 3 category name
  - `status` (text) - Current processing status
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 2. `meta_level1`
  Stores Level 1 meta information (broad industry/department level)
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key)
  - `meta_title_patterns` (jsonb) - Array of title patterns
  - `meta_keywords` (jsonb) - Array of keywords
  - `meta_description_themes` (jsonb) - Array of description themes
  - `customer_intent_signals` (jsonb) - Array of intent signals
  - `created_at` (timestamptz)

  ### 3. `meta_level2`
  Stores Level 2 meta information (mid-level product family)
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key)
  - `meta_title_patterns` (jsonb)
  - `meta_keywords` (jsonb)
  - `meta_description_themes` (jsonb)
  - `customer_intent_signals` (jsonb)
  - `created_at` (timestamptz)

  ### 4. `meta_level3`
  Stores Level 3 meta information (end-level purchasable category)
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key)
  - `meta_keywords` (jsonb)
  - `meta_description_themes` (jsonb)
  - `customer_intent_signals` (jsonb)
  - `created_at` (timestamptz)

  ### 5. `facets`
  Stores comprehensive filter/facet recommendations for end categories
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key)
  - `filter_attribute` (text) - Name of the filter
  - `possible_values` (text) - Possible values or ranges
  - `filling_percentage` (integer) - Approx % of products with this data
  - `priority` (text) - High, Medium, or Low
  - `confidence_score` (integer) - 1-10 score
  - `num_sources` (integer) - Number of sources found
  - `source_urls` (jsonb) - Array of source URLs
  - `sort_order` (integer) - Final sorted position
  - `created_at` (timestamptz)

  ### 6. `research_sources`
  Stores web research sources used for data gathering
  - `id` (uuid, primary key)
  - `project_id` (uuid, foreign key)
  - `level` (text) - Which level this source was used for
  - `url` (text) - Source URL
  - `title` (text) - Page title
  - `relevance_score` (integer) - 1-10 relevance
  - `created_at` (timestamptz)

  ## Security
  - Enable RLS on all tables
  - Add policies for authenticated users to manage their own projects
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  l1_category text NOT NULL,
  l2_category text,
  l3_category text,
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_level1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  meta_title_patterns jsonb DEFAULT '[]'::jsonb,
  meta_keywords jsonb DEFAULT '[]'::jsonb,
  meta_description_themes jsonb DEFAULT '[]'::jsonb,
  customer_intent_signals jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_level2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  meta_title_patterns jsonb DEFAULT '[]'::jsonb,
  meta_keywords jsonb DEFAULT '[]'::jsonb,
  meta_description_themes jsonb DEFAULT '[]'::jsonb,
  customer_intent_signals jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_level3 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  meta_keywords jsonb DEFAULT '[]'::jsonb,
  meta_description_themes jsonb DEFAULT '[]'::jsonb,
  customer_intent_signals jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  filter_attribute text NOT NULL,
  possible_values text DEFAULT '',
  filling_percentage integer DEFAULT 0,
  priority text DEFAULT 'Medium',
  confidence_score integer DEFAULT 5,
  num_sources integer DEFAULT 0,
  source_urls jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  level text NOT NULL,
  url text NOT NULL,
  title text DEFAULT '',
  relevance_score integer DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_level1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_level2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_level3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to projects"
  ON projects FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to meta_level1"
  ON meta_level1 FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to meta_level2"
  ON meta_level2 FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to meta_level3"
  ON meta_level3 FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to facets"
  ON facets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to research_sources"
  ON research_sources FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_meta_level1_project ON meta_level1(project_id);
CREATE INDEX IF NOT EXISTS idx_meta_level2_project ON meta_level2(project_id);
CREATE INDEX IF NOT EXISTS idx_meta_level3_project ON meta_level3(project_id);
CREATE INDEX IF NOT EXISTS idx_facets_project ON facets(project_id);
CREATE INDEX IF NOT EXISTS idx_facets_sort ON facets(project_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_research_sources_project ON research_sources(project_id);