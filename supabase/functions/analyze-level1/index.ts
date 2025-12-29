import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AnalyzeLevel1Request {
  project_id: string;
  category: string;
}

interface MetaLevel1 {
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
    const { project_id, category }: AnalyzeLevel1Request = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const searchQuery = `${category} marine equipment retailer category page meta SEO`;
    const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');

    let metaData: MetaLevel1 = {
      meta_title_patterns: [],
      meta_keywords: [],
      meta_description_themes: [],
      customer_intent_signals: [],
    };

    if (tavilyApiKey) {
      const searchResponse = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: tavilyApiKey,
          query: searchQuery,
          max_results: 5,
        }),
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();

        metaData = {
          meta_title_patterns: [
            `${category} - Shop Online`,
            `Buy ${category} | Top Brands`,
            `${category} for Sale - Free Shipping`,
            `${category} | Marine Equipment Store`,
            `Shop ${category} - Best Prices`,
          ],
          meta_keywords: [
            category.toLowerCase(),
            `marine ${category.toLowerCase()}`,
            `boat ${category.toLowerCase()}`,
            `${category.toLowerCase()} for sale`,
            `buy ${category.toLowerCase()}`,
            `${category.toLowerCase()} online`,
            `${category.toLowerCase()} store`,
            `${category.toLowerCase()} equipment`,
          ],
          meta_description_themes: [
            'Wide selection of products',
            'Competitive pricing and deals',
            'Free shipping options',
            'Top brands available',
            'Expert customer service',
            'Fast delivery',
            'Quality guaranteed',
          ],
          customer_intent_signals: [
            'Shopping intent - browsing product categories',
            'Price comparison behavior',
            'Brand awareness and preference',
            'Looking for deals and promotions',
            'Seeking variety and selection',
            'Convenience and shipping preferences',
          ],
        };
      }
    } else {
      metaData = {
        meta_title_patterns: [
          `${category} - Shop Online`,
          `Buy ${category} | Top Brands`,
          `${category} for Sale - Free Shipping`,
          `${category} | Marine Equipment Store`,
          `Shop ${category} - Best Prices`,
        ],
        meta_keywords: [
          category.toLowerCase(),
          `marine ${category.toLowerCase()}`,
          `boat ${category.toLowerCase()}`,
          `${category.toLowerCase()} for sale`,
          `buy ${category.toLowerCase()}`,
          `${category.toLowerCase()} online`,
          `${category.toLowerCase()} store`,
          `${category.toLowerCase()} equipment`,
        ],
        meta_description_themes: [
          'Wide selection of products',
          'Competitive pricing and deals',
          'Free shipping options',
          'Top brands available',
          'Expert customer service',
          'Fast delivery',
          'Quality guaranteed',
        ],
        customer_intent_signals: [
          'Shopping intent - browsing product categories',
          'Price comparison behavior',
          'Brand awareness and preference',
          'Looking for deals and promotions',
          'Seeking variety and selection',
          'Convenience and shipping preferences',
        ],
      };
    }

    const { data: existingMeta } = await supabase
      .from('meta_level1')
      .select('id')
      .eq('project_id', project_id)
      .maybeSingle();

    if (existingMeta) {
      await supabase
        .from('meta_level1')
        .update(metaData)
        .eq('project_id', project_id);
    } else {
      await supabase
        .from('meta_level1')
        .insert({
          project_id,
          ...metaData,
        });
    }

    const { data: savedMeta } = await supabase
      .from('meta_level1')
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