import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AnalyzeLevel2Request {
  project_id: string;
  l1_category: string;
  l2_category: string;
}

interface MetaLevel2 {
  meta_title_patterns: string[];
  meta_keywords: string[];
  meta_description_themes: string[];
  customer_intent_signals: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { project_id, l1_category, l2_category }: AnalyzeLevel2Request = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaData: MetaLevel2 = {
      meta_title_patterns: [
        `${l2_category} - ${l1_category}`,
        `Buy ${l2_category} Online`,
        `${l2_category} | ${l1_category} Store`,
        `Shop ${l2_category} - Free Shipping`,
        `${l2_category} for Boats and Marine`,
      ],
      meta_keywords: [
        l2_category.toLowerCase(),
        `${l1_category.toLowerCase()} ${l2_category.toLowerCase()}`,
        `marine ${l2_category.toLowerCase()}`,
        `${l2_category.toLowerCase()} products`,
        `buy ${l2_category.toLowerCase()}`,
        `${l2_category.toLowerCase()} for sale`,
        `boat ${l2_category.toLowerCase()}`,
        `${l2_category.toLowerCase()} accessories`,
      ],
      meta_description_themes: [
        'Specialized product selection',
        'Category-specific features highlighted',
        'Use-case applications mentioned',
        'Quality and performance focus',
        'Brand options and variety',
        'Installation and compatibility info',
      ],
      customer_intent_signals: [
        'Refined shopping intent - specific product family',
        'Use-case evaluation - will it work for my needs',
        'Feature comparison within category',
        'Quality and reliability assessment',
        'Application-specific requirements',
        'Compatibility verification',
      ],
    };

    const { data: existingMeta } = await supabase
      .from('meta_level2')
      .select('id')
      .eq('project_id', project_id)
      .maybeSingle();

    if (existingMeta) {
      await supabase
        .from('meta_level2')
        .update(metaData)
        .eq('project_id', project_id);
    } else {
      await supabase
        .from('meta_level2')
        .insert({
          project_id,
          ...metaData,
        });
    }

    const { data: savedMeta } = await supabase
      .from('meta_level2')
      .select('*')
      .eq('project_id', project_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({ success: true, meta: savedMeta }),
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