/*
  # Multi-Tenant Facet Builder System

  ## Overview
  Complete system for multi-tenant facet generation with admin controls,
  bulk uploads, prompt management, and AI-powered recommendations.

  ## Tables Created
  1. clients - Client organizations
  2. user_profiles - User profiles with role management
  3. categories - Uploaded taxonomy
  4. existing_facets - Baseline facets
  5. prompt_templates - Multi-level prompts
  6. facet_generation_jobs - Batch processing jobs
  7. recommended_facets - AI recommendations
  8. edited_facets - User modifications
  9. export_templates - Platform configs
  10. export_history - Export tracking
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  is_active boolean DEFAULT true,
  settings jsonb DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'client',
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  full_name text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  category_path text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  parent_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS existing_facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  facet_name text NOT NULL,
  facet_type text DEFAULT 'standard',
  possible_values jsonb DEFAULT '[]'::jsonb,
  source text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  type text NOT NULL,
  template_content text NOT NULL,
  variables jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  execution_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS facet_generation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  category_ids jsonb NOT NULL,
  status text DEFAULT 'pending',
  progress integer DEFAULT 0,
  total_categories integer DEFAULT 0,
  processed_categories integer DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommended_facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES facet_generation_jobs(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  facet_name text NOT NULL,
  possible_values text DEFAULT '',
  filling_percentage integer DEFAULT 0,
  priority text DEFAULT 'Medium',
  confidence_score integer DEFAULT 5,
  num_sources integer DEFAULT 0,
  source_urls jsonb DEFAULT '[]'::jsonb,
  reasoning text,
  prompt_used text,
  is_edited boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS edited_facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommended_facet_id uuid REFERENCES recommended_facets(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  edited_by text,
  facet_name text NOT NULL,
  possible_values text,
  filling_percentage integer,
  priority text,
  confidence_score integer,
  notes text,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  name text NOT NULL,
  format text NOT NULL,
  field_mapping jsonb DEFAULT '{}'::jsonb,
  template_structure jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS export_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES facet_generation_jobs(id),
  category_ids jsonb,
  export_template_id uuid REFERENCES export_templates(id),
  format text NOT NULL,
  file_path text,
  exported_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE existing_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE facet_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommended_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE edited_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for clients"
  ON clients FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for user_profiles"
  ON user_profiles FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for categories"
  ON categories FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for existing_facets"
  ON existing_facets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for prompt_templates"
  ON prompt_templates FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for facet_generation_jobs"
  ON facet_generation_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for recommended_facets"
  ON recommended_facets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for edited_facets"
  ON edited_facets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for export_templates"
  ON export_templates FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for export_history"
  ON export_history FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_client ON user_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_client ON categories(client_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);
CREATE INDEX IF NOT EXISTS idx_existing_facets_category ON existing_facets(category_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_client ON prompt_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_type ON prompt_templates(type);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON facet_generation_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON facet_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_recommended_facets_job ON recommended_facets(job_id);
CREATE INDEX IF NOT EXISTS idx_recommended_facets_category ON recommended_facets(category_id);
CREATE INDEX IF NOT EXISTS idx_edited_facets_recommended ON edited_facets(recommended_facet_id);
CREATE INDEX IF NOT EXISTS idx_export_history_client ON export_history(client_id);

INSERT INTO export_templates (platform, name, format, field_mapping, template_structure) VALUES
('shopify', 'Shopify Product Filters', 'csv', '{"facet_name": "Filter Name", "possible_values": "Values", "facet_type": "Type"}'::jsonb, '{}'::jsonb),
('bigcommerce', 'BigCommerce Facets', 'csv', '{"facet_name": "Facet Name", "possible_values": "Options", "priority": "Display Order"}'::jsonb, '{}'::jsonb),
('woocommerce', 'WooCommerce Attributes', 'csv', '{"facet_name": "Attribute Name", "possible_values": "Terms", "facet_type": "Type"}'::jsonb, '{}'::jsonb),
('magento', 'Magento 2 Attributes', 'csv', '{"facet_name": "attribute_code", "possible_values": "options", "priority": "position"}'::jsonb, '{}'::jsonb),
('custom', 'Generic Export', 'csv', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO prompt_templates (name, level, type, template_content, variables, execution_order) VALUES
('Industry Keywords - Marine', 1, 'industry', 'Analyze {category} in the marine industry. Focus on: boat equipment, marine safety, navigation, water sports.', '{"category": "string"}'::jsonb, 1),
('Geography - US Market', 2, 'geography', 'Consider US market preferences for {category}. Include: USCG regulations, imperial measurements, regional terminology.', '{"category": "string"}'::jsonb, 2),
('Geography - EU Market', 2, 'geography', 'Consider EU market preferences for {category}. Include: CE certifications, metric measurements, multilingual terms.', '{"category": "string"}'::jsonb, 3),
('Business Rules - Conversion', 3, 'business_rules', 'Generate facets that maximize conversion for {category}. Prioritize: compatibility filters, safety certifications, size/fit accuracy.', '{"category": "string"}'::jsonb, 4),
('Business Rules - Returns Reduction', 3, 'business_rules', 'For {category}, include facets that reduce returns: "Includes X", "Compatible with Y", "Requires Z".', '{"category": "string"}'::jsonb, 5),
('Technical Specifications', 4, 'technical', 'Extract technical specifications for {category} from major retailers: dimensions, materials, performance ratings, certifications.', '{"category": "string"}'::jsonb, 6),
('Customer Intent Signals', 5, 'customer_intent', 'Identify customer search patterns for {category}: What questions do they ask? What specifications matter most? What determines purchase decision?', '{"category": "string"}'::jsonb, 7),
('Competitive Analysis', 6, 'competitive', 'Analyze top 5 marine retailers selling {category}. What filters do they use? What is missing? What works best?', '{"category": "string"}'::jsonb, 8),
('Use Case Scenarios', 7, 'use_case', 'Define use case scenarios for {category}: recreational boating, commercial fishing, racing, offshore cruising. What filters apply to each?', '{"category": "string"}'::jsonb, 9),
('Seasonal & Trends', 8, 'seasonal', 'Consider seasonal and trending factors for {category}: weather conditions, activity seasons, emerging technologies.', '{"category": "string"}'::jsonb, 10)
ON CONFLICT DO NOTHING;