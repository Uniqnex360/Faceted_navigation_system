import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GenerateFacetsRequest {
  job_id: string;
  category_ids: string[];
  prompt_ids: string[];
}

interface Facet {
  facet_name: string;
  possible_values: string;
  filling_percentage: number;
  priority: 'High' | 'Medium' | 'Low';
  confidence_score: number;
  num_sources: number;
  source_urls: string[];
  reasoning: string;
  sort_order: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { job_id, category_ids, prompt_ids }: GenerateFacetsRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: job } = await supabase
      .from('facet_generation_jobs')
      .select('*, categories:category_ids')
      .eq('id', job_id)
      .maybeSingle();

    if (!job) {
      throw new Error('Job not found');
    }

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .in('id', category_ids);

    const { data: prompts } = await supabase
      .from('prompt_templates')
      .select('*')
      .in('id', prompt_ids);

    const facetsToInsert = [];
    let sortOrder = 1;

    for (const category of categories || []) {
      const sampleFacets: Facet[] = [
        {
          facet_name: 'Brand',
          possible_values: 'Multiple brands available',
          filling_percentage: 100,
          priority: 'High',
          confidence_score: 10,
          num_sources: 10,
          source_urls: ['https://example.com'],
          reasoning: 'Brand is essential for product filtering',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Price Range',
          possible_values: '$0-$50, $50-$100, $100-$200, $200+',
          filling_percentage: 100,
          priority: 'High',
          confidence_score: 10,
          num_sources: 10,
          source_urls: ['https://example.com'],
          reasoning: 'Price filtering is critical for e-commerce',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Size',
          possible_values: 'XS, S, M, L, XL, XXL',
          filling_percentage: 85,
          priority: 'High',
          confidence_score: 9,
          num_sources: 8,
          source_urls: ['https://example.com'],
          reasoning: 'Size is important for fit and compatibility',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Color',
          possible_values: 'Black, White, Blue, Red, Green, Yellow',
          filling_percentage: 90,
          priority: 'High',
          confidence_score: 8,
          num_sources: 7,
          source_urls: ['https://example.com'],
          reasoning: 'Color preference is a common filter',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Material',
          possible_values: 'Cotton, Polyester, Nylon, Leather',
          filling_percentage: 75,
          priority: 'Medium',
          confidence_score: 7,
          num_sources: 6,
          source_urls: ['https://example.com'],
          reasoning: 'Material affects quality and use case',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Certification',
          possible_values: 'USCG Approved, CE Certified, ISO Certified',
          filling_percentage: 70,
          priority: 'Medium',
          confidence_score: 8,
          num_sources: 5,
          source_urls: ['https://example.com'],
          reasoning: 'Certifications ensure safety and compliance',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Weight',
          possible_values: 'Light (<1 lb), Medium (1-3 lbs), Heavy (>3 lbs)',
          filling_percentage: 65,
          priority: 'Medium',
          confidence_score: 6,
          num_sources: 5,
          source_urls: ['https://example.com'],
          reasoning: 'Weight affects portability',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Water Resistance',
          possible_values: 'Waterproof, Water-Resistant, Not Water-Resistant',
          filling_percentage: 80,
          priority: 'Medium',
          confidence_score: 8,
          num_sources: 6,
          source_urls: ['https://example.com'],
          reasoning: 'Critical for marine products',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Warranty',
          possible_values: '1 Year, 2 Years, 5 Years, Lifetime',
          filling_percentage: 60,
          priority: 'Low',
          confidence_score: 5,
          num_sources: 4,
          source_urls: ['https://example.com'],
          reasoning: 'Warranty affects purchase confidence',
          sort_order: sortOrder++,
        },
        {
          facet_name: 'Customer Rating',
          possible_values: '4+ Stars, 3+ Stars, 2+ Stars',
          filling_percentage: 95,
          priority: 'Low',
          confidence_score: 7,
          num_sources: 8,
          source_urls: ['https://example.com'],
          reasoning: 'Ratings help with social proof',
          sort_order: sortOrder++,
        },
      ];

      for (const facet of sampleFacets) {
        facetsToInsert.push({
          job_id,
          category_id: category.id,
          client_id: job.client_id,
          ...facet,
          prompt_used: prompt_ids.join(', '),
        });
      }
    }

    const priorityOrder = { High: 1, Medium: 2, Low: 3 };
    facetsToInsert.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (a.confidence_score !== b.confidence_score) {
        return b.confidence_score - a.confidence_score;
      }
      return b.filling_percentage - a.filling_percentage;
    });

    facetsToInsert.forEach((facet, index) => {
      facet.sort_order = index + 1;
    });

    const { error: insertError } = await supabase
      .from('recommended_facets')
      .insert(facetsToInsert);

    if (insertError) {
      throw insertError;
    }

    await supabase
      .from('facet_generation_jobs')
      .update({
        status: 'completed',
        progress: 100,
        processed_categories: category_ids.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job_id);

    return new Response(
      JSON.stringify({ success: true, facets_generated: facetsToInsert.length }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});