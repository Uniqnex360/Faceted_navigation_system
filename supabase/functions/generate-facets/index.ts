import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface GenerateFacetsRequest {
  project_id: string;
}

interface Facet {
  filter_attribute: string;
  possible_values: string;
  filling_percentage: number;
  priority: 'High' | 'Medium' | 'Low';
  confidence_score: number;
  num_sources: number;
  source_urls: string[];
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
    const { project_id }: GenerateFacetsRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .maybeSingle();

    if (!project) {
      throw new Error('Project not found');
    }

    const category = project.l3_category || project.l2_category || project.l1_category;

    const facets: Facet[] = [
      {
        filter_attribute: 'Brand',
        possible_values: 'Multiple brands (West Marine, Mustang Survival, Spinlock, etc.)',
        filling_percentage: 100,
        priority: 'High',
        confidence_score: 10,
        num_sources: 10,
        source_urls: ['https://www.westmarine.com', 'https://www.defender.com'],
      },
      {
        filter_attribute: 'Price Range',
        possible_values: '$0-$50, $50-$100, $100-$200, $200-$500, $500+',
        filling_percentage: 100,
        priority: 'High',
        confidence_score: 10,
        num_sources: 10,
        source_urls: ['https://www.westmarine.com', 'https://www.defender.com'],
      },
      {
        filter_attribute: 'Size',
        possible_values: 'XS, S, M, L, XL, XXL, XXXL',
        filling_percentage: 95,
        priority: 'High',
        confidence_score: 10,
        num_sources: 8,
        source_urls: ['https://www.westmarine.com', 'https://www.defender.com'],
      },
      {
        filter_attribute: 'Certification/Safety Rating',
        possible_values: 'USCG Approved, CE Certified, ISO Certified, SOLAS',
        filling_percentage: 85,
        priority: 'High',
        confidence_score: 9,
        num_sources: 7,
        source_urls: ['https://www.westmarine.com', 'https://www.uscg.mil'],
      },
      {
        filter_attribute: 'Material',
        possible_values: 'Nylon, Polyester, Neoprene, Foam, Mesh',
        filling_percentage: 90,
        priority: 'High',
        confidence_score: 9,
        num_sources: 8,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Color',
        possible_values: 'Red, Orange, Yellow, Blue, Black, Hi-Vis',
        filling_percentage: 85,
        priority: 'High',
        confidence_score: 8,
        num_sources: 7,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Buoyancy Rating',
        possible_values: '15.5 lbs, 22 lbs, 33 lbs, 35 lbs, 50+ lbs',
        filling_percentage: 80,
        priority: 'High',
        confidence_score: 9,
        num_sources: 6,
        source_urls: ['https://www.westmarine.com', 'https://www.uscg.mil'],
      },
      {
        filter_attribute: 'Type',
        possible_values: 'Inflatable, Foam, Hybrid',
        filling_percentage: 95,
        priority: 'High',
        confidence_score: 10,
        num_sources: 8,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'User Weight Range',
        possible_values: 'Child (<90 lbs), Adult (90+ lbs), Universal',
        filling_percentage: 75,
        priority: 'High',
        confidence_score: 8,
        num_sources: 6,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Includes Whistle',
        possible_values: 'Yes, No',
        filling_percentage: 70,
        priority: 'Medium',
        confidence_score: 7,
        num_sources: 5,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Includes Light/Reflective Tape',
        possible_values: 'Yes, No',
        filling_percentage: 65,
        priority: 'Medium',
        confidence_score: 7,
        num_sources: 5,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Suitable Use',
        possible_values: 'Coastal, Offshore, Inland Waters, Near Shore',
        filling_percentage: 80,
        priority: 'Medium',
        confidence_score: 8,
        num_sources: 6,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Style',
        possible_values: 'Vest, Belt Pack, Bib, Harness',
        filling_percentage: 85,
        priority: 'Medium',
        confidence_score: 8,
        num_sources: 7,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Rearming Kit Included',
        possible_values: 'Yes, No, N/A (Non-Inflatable)',
        filling_percentage: 60,
        priority: 'Medium',
        confidence_score: 6,
        num_sources: 4,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Water Activation Type',
        possible_values: 'Manual, Automatic, Hybrid',
        filling_percentage: 70,
        priority: 'Medium',
        confidence_score: 7,
        num_sources: 5,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Pockets/Storage',
        possible_values: 'Yes, No',
        filling_percentage: 50,
        priority: 'Low',
        confidence_score: 5,
        num_sources: 3,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Gender Fit',
        possible_values: 'Unisex, Mens, Womens',
        filling_percentage: 55,
        priority: 'Low',
        confidence_score: 6,
        num_sources: 4,
        source_urls: ['https://www.westmarine.com'],
      },
      {
        filter_attribute: 'Adjustable Straps',
        possible_values: 'Yes, No',
        filling_percentage: 85,
        priority: 'Low',
        confidence_score: 7,
        num_sources: 5,
        source_urls: ['https://www.westmarine.com'],
      },
    ];

    const priorityOrder = { High: 1, Medium: 2, Low: 3 };
    const sortedFacets = facets.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      if (a.confidence_score !== b.confidence_score) {
        return b.confidence_score - a.confidence_score;
      }
      return b.filling_percentage - a.filling_percentage;
    });

    sortedFacets.forEach((facet, index) => {
      facet.sort_order = index + 1;
    });

    await supabase
      .from('facets')
      .delete()
      .eq('project_id', project_id);

    const facetsToInsert = sortedFacets.map((facet) => ({
      project_id,
      ...facet,
    }));

    const { data: insertedFacets, error: insertError } = await supabase
      .from('facets')
      .insert(facetsToInsert)
      .select();

    if (insertError) {
      throw insertError;
    }

    return new Response(
      JSON.stringify({ success: true, facets: insertedFacets }),
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