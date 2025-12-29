/*
  # Enhanced Versioning and Project Management

  ## Changes
  1. Add prompt_versions table for version control
  2. Add master_templates table for template management
  3. Enhance projects table with more fields
  4. Add dashboard_stats table for metrics
  5. Update prompt_templates to link to versions

  ## New Tables
  - prompt_versions: Store all prompt versions
  - master_templates: Flag which prompts are master templates
  - dashboard_stats: Pre-computed dashboard metrics
*/

CREATE TABLE IF NOT EXISTS prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_template_id uuid REFERENCES prompt_templates(id) ON DELETE CASCADE NOT NULL,
  version integer NOT NULL,
  template_content text NOT NULL,
  variables jsonb DEFAULT '{}'::jsonb,
  edited_by text,
  change_notes text,
  is_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  prompt_template_id uuid REFERENCES prompt_templates(id) ON DELETE CASCADE NOT NULL,
  level_start integer DEFAULT 2,
  level_end integer DEFAULT 10,
  is_master boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(prompt_template_id, client_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facet_generation_jobs' AND column_name = 'project_name'
  ) THEN
    ALTER TABLE facet_generation_jobs ADD COLUMN project_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facet_generation_jobs' AND column_name = 'selected_prompts'
  ) THEN
    ALTER TABLE facet_generation_jobs ADD COLUMN selected_prompts jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'facet_generation_jobs' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE facet_generation_jobs ADD COLUMN created_by text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prompt_templates' AND column_name = 'current_version'
  ) THEN
    ALTER TABLE prompt_templates ADD COLUMN current_version integer DEFAULT 1;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dashboard_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  stat_type text NOT NULL,
  stat_value integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, stat_type)
);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for prompt_versions"
  ON prompt_versions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for master_templates"
  ON master_templates FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for dashboard_stats"
  ON dashboard_stats FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_versions(prompt_template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON prompt_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_master_templates_client ON master_templates(client_id);
CREATE INDEX IF NOT EXISTS idx_master_templates_prompt ON master_templates(prompt_template_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_stats_client ON dashboard_stats(client_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_stats_type ON dashboard_stats(stat_type);

CREATE OR REPLACE FUNCTION update_dashboard_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'facet_generation_jobs' THEN
    INSERT INTO dashboard_stats (client_id, stat_type, stat_value, metadata)
    VALUES (
      NEW.client_id,
      CASE NEW.status
        WHEN 'completed' THEN 'facets_recommended'
        WHEN 'processing' THEN 'jobs_in_progress'
        WHEN 'pending' THEN 'jobs_yet_to_start'
        WHEN 'failed' THEN 'jobs_failed'
        ELSE 'jobs_total'
      END,
      1,
      jsonb_build_object('job_id', NEW.id, 'updated_at', now())
    )
    ON CONFLICT (client_id, stat_type)
    DO UPDATE SET
      stat_value = dashboard_stats.stat_value + 1,
      metadata = jsonb_set(
        dashboard_stats.metadata,
        '{last_job_id}',
        to_jsonb(NEW.id::text)
      ),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_dashboard_stats ON facet_generation_jobs;
CREATE TRIGGER trigger_update_dashboard_stats
  AFTER INSERT OR UPDATE ON facet_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_stats();