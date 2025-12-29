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

// Function to call OpenAI API
async function generateFacetsWithAI(
  categoryName: string,
  categoryPath: string,
  promptTemplate: string
): Promise<Facet[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const systemPrompt = `You are an expert in e-commerce faceted navigation and product categorization. 
Generate relevant facets (filters) for products in the given category. 
Each facet should help users narrow down their search effectively.

Return ONLY a valid JSON array (no markdown, no additional text) with this exact structure:
[
  {
    "facet_name": "string",
    "possible_values": "comma-separated string of values",
    "filling_percentage": number (0-100, estimate of products that will have this attribute),
    "priority": "High" | "Medium" | "Low",
    "confidence_score": number (1-10),
    "num_sources": number (estimated sources that validate this facet),
    "source_urls": ["array of example URLs if available"],
    "reasoning": "brief explanation of why this facet is useful"
  }
]

Guidelines:
- Generate 8-12 facets
- Prioritize facets that are most useful for filtering
- Include a mix of High (3-4), Medium (4-5), and Low (2-3) priority facets
- Be specific to the category and its parent categories
- Consider common filtering needs: price, brand, ratings, specifications, features
- Use the full category path to understand context and generate appropriate facets`;

  const userPrompt = `Category Path: ${categoryPath}
Category Name: ${categoryName}

${promptTemplate}

Generate relevant facets for this category. Return ONLY a valid JSON array with no additional text.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o', // or 'gpt-3.5-turbo' for faster/cheaper
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  console.log('OpenAI response:', JSON.stringify(data, null, 2));
  
  const content = data.choices[0].message.content;
  console.log('AI content:', content);
  
  // Parse the response - handle both array and object with array
  let facets;
  try {
    const parsed = JSON.parse(content);
    facets = Array.isArray(parsed) ? parsed : (parsed.facets || []);
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }

  if (!Array.isArray(facets) || facets.length === 0) {
    console.error('No facets in response:', content);
    throw new Error('AI did not return valid facets array');
  }

  return facets;
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

    // Get job details
    const { data: job } = await supabase
      .from('facet_generation_jobs')
      .select('*')
      .eq('id', job_id)
      .maybeSingle();

    if (!job) {
      throw new Error('Job not found');
    }

    // Update job status to processing
    await supabase
      .from('facet_generation_jobs')
      .update({ status: 'processing' })
      .eq('id', job_id);

    // Get categories
    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .in('id', category_ids);

    // Get prompts
    const { data: prompts } = await supabase
      .from('prompt_templates')
      .select('*')
      .in('id', prompt_ids);

    const promptTemplate = prompts?.[0]?.template || 
      'Generate facets that would be most useful for filtering products in this category.';

    const facetsToInsert = [];
    let processedCount = 0;

    // Process each category
    for (const category of categories || []) {
      try {
        console.log(`Processing category: ${category.name} (${category.id})`);
        console.log(`Category path: ${category.category_path}`);
        
        // Generate facets using AI
        const aiFacets = await generateFacetsWithAI(
          category.name,
          category.category_path || category.name,
          promptTemplate
        );

        console.log(`Generated ${aiFacets.length} facets for category ${category.name}`);
        console.log('AI Facets:', JSON.stringify(aiFacets, null, 2));

        // Add category and job info to each facet
        for (const facet of aiFacets) {
          facetsToInsert.push({
            job_id,
            category_id: category.id,
            client_id: job.client_id,
            ...facet,
            prompt_used: prompt_ids.join(', '),
          });
        }

        processedCount++;

        // Update progress
        const progress = Math.round((processedCount / category_ids.length) * 100);
        await supabase
          .from('facet_generation_jobs')
          .update({
            progress,
            processed_categories: processedCount,
          })
          .eq('id', job_id);

      } catch (error) {
        console.error(`Error processing category ${category.id}:`, error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        // Continue with other categories even if one fails
      }
    }

    // Sort facets by priority and confidence
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

    // Assign sort order
    facetsToInsert.forEach((facet, index) => {
      facet.sort_order = index + 1;
    });

    // Insert all facets
    const { error: insertError } = await supabase
      .from('recommended_facets')
      .insert(facetsToInsert);

    if (insertError) {
      throw insertError;
    }

    // Mark job as completed
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
      JSON.stringify({ 
        success: true, 
        facets_generated: facetsToInsert.length,
        categories_processed: processedCount 
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Function error:', error);

    // Try to update job status to failed
    try {
      const { job_id } = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from('facet_generation_jobs')
        .update({ 
          status: 'failed',
          error_message: error.message 
        })
        .eq('id', job_id);
    } catch (e) {
      console.error('Failed to update job status:', e);
    }

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