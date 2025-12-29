import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AnalyzeLevel3Request {
  project_id: string;
  l1_category: string;
  l2_category: string;
  l3_category: string;
}

interface MetaLevel3 {
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
    const { project_id, l1_category, l2_category, l3_category }: AnalyzeLevel3Request = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metaData: MetaLevel3 = {
      meta_keywords: [
        l3_category.toLowerCase(),
        `buy ${l3_category.toLowerCase()}`,
        `${l3_category.toLowerCase()} for sale`,
        `${l3_category.toLowerCase()} online`,
        `marine ${l3_category.toLowerCase()}`,
        `boat ${l3_category.toLowerCase()}`,
        `${l3_category.toLowerCase()} price`,
        `best ${l3_category.toLowerCase()}`,
        `${l3_category.toLowerCase()} reviews`,
        `${l3_category.toLowerCase()} brands`,
      ],
      meta_description_themes: [
        'Specific product availability and stock',
        'Purchase-ready information (pricing, shipping)',
        'Compatibility details clearly stated',
        'Technical specifications mentioned',
        'What is included in the box',
        'Installation requirements',
        'Warranty and return information',
        'Brand and model specifics',
      ],
      customer_intent_signals: [
        'High purchase intent - ready to buy',
        'Price sensitivity and comparison',
        'Compatibility verification - will it fit/work',
        'What extras do I need to purchase',
        'Shipping cost and delivery time',
        'Return policy and warranty concerns',
        'Technical specification requirements',
        'Brand and model preference',
        'Stock availability urgency',
      ],
    };

    const { data: existingMeta } = await supabase
      .from('meta_level3')
      .select('id')
      .eq('project_id', project_id)
      .maybeSingle();

    if (existingMeta) {
      await supabase
        .from('meta_level3')
        .update(metaData)
        .eq('project_id', project_id);
    } else {
      await supabase
        .from('meta_level3')
        .insert({
          project_id,
          ...metaData,
        });
    }

    const { data: savedMeta } = await supabase
      .from('meta_level3')
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