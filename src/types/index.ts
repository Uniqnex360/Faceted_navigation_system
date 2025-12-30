export interface UserProfile {
  id: string;
  email: string;
  role: 'admin' | 'client';
  client_id: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  contact_email: string | null;
  is_active: boolean;
  settings: Record<string, any>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  client_id: string;
  category_path: string;
  level: number;
  parent_id: string | null;
  name: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ExistingFacet {
  id: string;
  client_id: string;
  category_id: string;
  facet_name: string;
  facet_type: string;
  possible_values: string[];
  source: string | null;
  created_at: string;
}
export interface CountryTemplate {
  country: string;
  template: string;
  id: string; 
}
export interface PromptTemplate {
  id: string;
  client_id: string | null;
  name: string;
  level: number;
  type: string;
  template: string;
  variables: Record<string, any>;
  metadata?: { [key: string]: any }; 
  is_active: boolean;
  execution_order: number;
  created_at: string;
  updated_at: string;
}

export interface FacetGenerationJob {
  id: string;
  client_id: string;
  project_name?:string
  category_ids: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total_categories: number;
  processed_categories: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RecommendedFacet {
  id: string;
  job_id: string | null;
  category_id: string;
  client_id: string;
  facet_name: string;
  possible_values: string;
  filling_percentage: number;
  priority: 'High' | 'Medium' | 'Low';
  confidence_score: number;
  num_sources: number;
  source_urls: string[];
  reasoning: string | null;
  prompt_used: string | null;
  is_edited: boolean;
  sort_order: number;
  created_at: string;
}

export interface EditedFacet {
  id: string;
  recommended_facet_id: string | null;
  category_id: string;
  client_id: string;
  edited_by: string | null;
  facet_name: string;
  possible_values: string | null;
  filling_percentage: number | null;
  priority: string | null;
  confidence_score: number | null;
  notes: string | null;
  version: number;
  created_at: string;
}

export interface ExportTemplate {
  id: string;
  platform: string;
  name: string;
  format: string;
  field_mapping: Record<string, string>;
  template_structure: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export interface ExportHistory {
  id: string;
  client_id: string;
  job_id: string | null;
  category_ids: string[];
  export_template_id: string | null;
  format: string;
  file_path: string | null;
  exported_by: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  l1_category: string;
  l2_category: string | null;
  l3_category: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MetaLevel1 {
  id: string;
  project_id: string;
  meta_title_patterns: string[];
  meta_keywords: string[];
  meta_description_themes: string[];
  customer_intent_signals: string[];
  created_at: string;
}

export interface MetaLevel2 {
  id: string;
  project_id: string;
  meta_title_patterns: string[];
  meta_keywords: string[];
  meta_description_themes: string[];
  customer_intent_signals: string[];
  created_at: string;
}

export interface MetaLevel3 {
  id: string;
  project_id: string;
  meta_keywords: string[];
  meta_description_themes: string[];
  customer_intent_signals: string[];
  created_at: string;
}

export interface Facet {
  id: string;
  project_id: string;
  filter_attribute: string;
  possible_values: string;
  filling_percentage: number;
  priority: 'High' | 'Medium' | 'Low';
  confidence_score: number;
  num_sources: number;
  source_urls: string[];
  sort_order: number;
  created_at: string;
}

export interface ResearchSource {
  id: string;
  project_id: string;
  level: string;
  url: string;
  title: string;
  relevance_score: number;
  created_at: string;
}

export type WorkflowStep = 'project' | 'level1' | 'level2' | 'level3' | 'facets' | 'export';
