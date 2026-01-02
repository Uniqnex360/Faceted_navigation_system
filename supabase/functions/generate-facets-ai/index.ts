import { createClient } from "npm:@supabase/supabase-js@2.57.4";

// CORS headers remain the same
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Interfaces to define the expected data structures
interface PromptPayload {
  id: string;
  name: string;
  content: string | object | string[];
}
interface GenerateFacetsRequest {
  job_id: string;
  category_ids: string[];
  prompts: PromptPayload[];
}
interface Facet {
  facet_name: string;
  possible_values: string;
  filling_percentage: number;
  priority: "High" | "Medium" | "Low";
  confidence_score: number;
  reasoning: string;
  sort_order: number;
}

// --- MODIFIED Function to call OpenAI API ---
// This function is now flexible and can handle different system prompts and return types.
async function generateFacetsWithAI(
  systemPrompt: string, // <-- CHANGED: Now takes system prompt as an argument
  categoryName: string,
  categoryPath: string,
  promptTemplate: string
): Promise<any> {
  // <-- CHANGED: Returns 'any' to handle both facets and context objects
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // The user prompt is constructed dynamically.
  const userPrompt = `Category Path: ${categoryPath}
Category Name: ${categoryName}

${promptTemplate}`;
  console.log(
    `\n${"=".repeat(80)}\n📤 COMPLETE PROMPT SENT TO AI:\n${"=".repeat(
      80
    )}\nSYSTEM PROMPT:\n${systemPrompt}\n\nUSER PROMPT:\n${userPrompt}\n${"=".repeat(
      80
    )}\n`
  );
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" }, // Enforce JSON output for reliability
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("OpenAI API error:", error);
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  console.log("Full API Response:", JSON.stringify(data, null, 2));

  const content = data.choices[0].message.content;
  console.log("Content:", data.content);


  // --- CHANGED: Simply parse and return the entire JSON object ---
  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch (e) {
    console.error("Failed to parse AI response:", content);
    throw new Error(`Failed to parse AI response: ${e.message}`);
  }
}

// --- REWRITTEN Deno.serve function with full orchestration logic ---
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  let jobIdFromRequest: string | null = null;

  try {
    // Correctly parse the new payload from the frontend
    const {
      job_id,
      category_ids,
      prompts: promptPayloads,
    }: GenerateFacetsRequest = await req.json();
    jobIdFromRequest = job_id;

    const selectedPromptIds = promptPayloads.map((p) => p.id);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: job } = await supabase
      .from("facet_generation_jobs")
      .select("*")
      .eq("id", job_id)
      .maybeSingle();
    if (!job) throw new Error("Job not found");

    await supabase
      .from("facet_generation_jobs")
      .update({ status: "processing" })
      .eq("id", job_id);

    const { data: categories } = await supabase
      .from("categories")
      .select("*")
      .in("id", category_ids);
    if (!categories || categories.length === 0)
      throw new Error("Categories not found");

    const allFacetsToInsert = [];
    let processedCount = 0;

    // Define System Prompts once for reuse
    const facetSystemPrompt = `You are an expert in e-commerce faceted navigation. Based on the user prompt, generate relevant facets. Your response MUST be a valid JSON object containing a single key "facets", which is an array of facet objects. Each facet object must have these keys: "facet_name", "possible_values", "filling_percentage", "priority", "confidence_score", "reasoning".`;
    const contextSystemPrompt = `You are an e-commerce data analyst. Your task is to extract specific information based on the user's request. Respond ONLY with the requested JSON object.`;

    // --- The new orchestration loop ---
    for (const category of categories) {
      try {
        console.log(`\n--- Processing Category: ${category.name} ---`);

        const categoryFacets: Facet[] = [];
        const categoryContext: { [key: string]: string } = {
          Category_Name: category.name,
          Category_Path: category.category_path || category.name,
        };

        if (category.category_path) {
          const pathParts = category.category_path.split(" > ");
          pathParts.forEach((part, index) => {
            const level = index + 1;
            categoryContext[`Level_${level}_Category_Name`] = part.trim();
          });
        } else {
          // Fallback if there is no path
          categoryContext["Level_1_Category_Name"] = category.name;
        }
        let generatedContext: { [key: string]: any } = {};

        // Loop through each prompt sent from the frontend
        // for (const prompt of promptPayloads) {
        //   console.log(`-- Using Prompt: ${prompt.name} --`);

        //   try {
        //     // if (prompt.name === 'Industry Keywords' && Array.isArray(prompt.content)) {
        //     //   for (let i = 0; i < prompt.content.length; i++) {
        //     //     let template = prompt.content[i];
        //     //     const level = i + 1;
        //     //     console.log(`  - Executing context-building Level ${level}`);

        //     //     Object.entries(categoryContext).forEach(([key, value]) => {
        //     //       template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
        //     //     });
        //     //     Object.entries(generatedContext).forEach(([key, value]) => {
        //     //       template = template.replace(new RegExp(`{{${key}}}`, 'g'), JSON.stringify(value, null, 2));
        //     //     });
        //     //     console.log(`--- FINAL TEMPLATE FOR AI (Level ${level}) ---\n`, template);
        //     //     const rawSeoData = await generateFacetsWithAI(contextSystemPrompt, "", "", template);
        //     //     let processedSeoDataString = JSON.stringify(rawSeoData);
        //     //      Object.entries(categoryContext).forEach(([key, value]) => {
        //     //       processedSeoDataString = processedSeoDataString.replace(new RegExp(`{{${key}}}`, 'g'), value);
        //     //     });
        //     //     const finalCleanSeoData = JSON.parse(processedSeoDataString);
        //     //     generatedContext[`Level_${level}_Meta_JSON`] = finalCleanSeoData;
        //     //   }
        //     //   console.log('  - Context from "Industry Keywords" built successfully.');

        //     // }
        //     if (
        //       prompt.name === "Industry Keywords" &&
        //       typeof prompt.content === "string"
        //     ) {
        //       console.log(
        //         "  - Starting Stage 1: Industry Keywords SEO extraction"
        //       );

        //       let template = prompt.content as string;

        //       // Replace context variables
        //       Object.entries(categoryContext).forEach(([key, value]) => {
        //         template = template.replace(
        //           new RegExp(`{{${key}}}`, "g"),
        //           value
        //         );
        //       });

        //       console.log(`--- STAGE 1 TEMPLATE FOR AI ---\n`, template);

        //       // Execute Stage 1 - get the 6-level meta JSON
        //       const seoMetaData = await generateFacetsWithAI(
        //         contextSystemPrompt,
        //         category.name,
        //         category.category_path || category.name,
        //         template
        //       );

        //       // Store the complete meta data for use in Stage 2 (Master prompt)
        //       generatedContext["Industry_SEO_Meta"] = seoMetaData;
        //       console.log("  - Stage 1 completed: SEO meta data extracted");
        //     } 
        //     else if (
        //       prompt.name === 'Master' && typeof prompt.content === 'string'
        //     ) {
        //       // This prompt GENERATES FACETS for multiple parts
        //       console.log('  - Starting Stage 2: Master prompt with SEO intelligence');
        //       for (const [country, template] of Object.entries(
        //         prompt.content as Record<string, string>
        //       )) {
        //         console.log(`  - Executing for Country: ${country}`);
        //         const finalTemplate = (template as string).replace(
        //           /{{Category_Name}}/g,
        //           category.name
        //         );
        //         const aiResult = await generateFacetsWithAI(
        //           facetSystemPrompt,
        //           category.name,
        //           category.category_path || category.name,
        //           finalTemplate
        //         );
        //         const facets = aiResult.facets || [];
        //         if (Array.isArray(facets)) {
        //           facets.forEach((facet) =>
        //             categoryFacets.push({
        //               ...facet,
        //               source_prompt: `${prompt.name} (${country})`,
        //             })
        //           );
        //         }
        //       }
        //     } else {
        //       // This is a standard prompt that GENERATES FACETS
        //       let template = prompt.content as string;

        //       Object.entries(categoryContext).forEach(([key, value]) => {
        //         template = template.replace(
        //           new RegExp(`{{${key}}}`, "g"),
        //           value
        //         );
        //       });
        //       Object.entries(generatedContext).forEach(([key, value]) => {
        //         template = template.replace(
        //           new RegExp(`{{${key}}}`, "g"),
        //           JSON.stringify(value, null, 2)
        //         );
        //       });

        //       const aiResult = await generateFacetsWithAI(
        //         facetSystemPrompt,
        //         category.name,
        //         category.category_path || category.name,
        //         template
        //       );
        //       const facets = aiResult.facets || [];
        //       if (Array.isArray(facets)) {
        //         facets.forEach((facet) =>
        //           categoryFacets.push({ ...facet, source_prompt: prompt.name })
        //         );
        //       }
        //     }
        //   } catch (promptError) {
        //     console.error(
        //       `Error executing prompt "${prompt.name}" for category "${category.name}":`,
        //       promptError.message
        //     );
        //   }
        // }
        // Remove the commented-out code and use this instead:
        for (const prompt of promptPayloads) {
          console.log(`-- Using Prompt: ${prompt.name} --`);

          try {
            // STAGE 1: Industry Keywords (Single Level SEO Extraction)
            if (prompt.name === 'Industry Keywords' && typeof prompt.content === 'string') {
              console.log('  - Starting Stage 1: Industry Keywords SEO extraction');

              // Process main template (Level 1)
              let template = prompt.content as string;

              // Replace context variables
              Object.entries(categoryContext).forEach(([key, value]) => {
                template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
              });

              console.log(`--- STAGE 1 TEMPLATE FOR AI (Level 1) ---\n`, template);

              // Execute Stage 1 - get SEO meta data for Level 1
              const seoMetaData = await generateFacetsWithAI(
                contextSystemPrompt,
                category.name,
                category.category_path || category.name,
                template
              );

              // Store for Stage 2
              generatedContext['Industry_SEO_Meta'] = seoMetaData;
              generatedContext['Latest_Level_Result'] = seoMetaData; // Track the latest result

              // Process additional levels if they exist in metadata
              const additionalLevels = (prompt.metadata as any)?.industry_levels || {};

              if (Object.keys(additionalLevels).length > 0) {
                console.log(`  - Processing ${Object.keys(additionalLevels).length} additional levels`);

                // Sort levels numerically to ensure proper order
                const sortedLevels = Object.keys(additionalLevels)
                  .map(Number)
                  .sort((a, b) => a - b);

                for (const levelNum of sortedLevels) {
                  let levelTemplate = additionalLevels[levelNum];

                  // Replace context variables in level template
                  Object.entries(categoryContext).forEach(([key, value]) => {
                    levelTemplate = levelTemplate.replace(new RegExp(`{{${key}}}`, 'g'), value);
                  });

                  // Replace previous level results
                  if (generatedContext['Latest_Level_Result']) {
                    levelTemplate = levelTemplate.replace(
                      /\$\{previousLevelResult\}/g,
                      JSON.stringify(generatedContext['Latest_Level_Result'], null, 2)
                    );
                  }

                  console.log(`--- STAGE 1 TEMPLATE FOR AI (Level ${levelNum}) ---\n`, levelTemplate);

                  // Execute AI for this level
                  const levelSeoData = await generateFacetsWithAI(
                    contextSystemPrompt,
                    category.name,
                    category.category_path || category.name,
                    levelTemplate
                  );

                  // Store this level's results
                  generatedContext[`Level_${levelNum}_SEO_Meta`] = levelSeoData;

                  // Update the latest result for the next level to use
                  generatedContext['Latest_Level_Result'] = levelSeoData;

                  // For the final level, this becomes our SEO metadata for Stage 2
                  if (levelNum === Math.max(...sortedLevels)) {
                    generatedContext['Industry_SEO_Meta'] = {
                      ...generatedContext['Industry_SEO_Meta'],
                      ...levelSeoData
                    };
                  }
                }
              }

              console.log('  - Stage 1 completed: SEO meta data extracted for all levels');
            } if (prompt.name === 'Output Format-1' && typeof prompt.content === 'string') {
              console.log('  - Starting Stage 2: Output Format-1 prompt with SEO intelligence');

              let template = prompt.content as string;

              // Replace all context variables
              Object.entries(categoryContext).forEach(([key, value]) => {
                template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
              });

              // NEW CODE: Handle meta information placeholders dynamically
              // First, extract the META INFORMATIONS section
              const metaInfoRegex = /META\s+INFORMATIONS:\s*\n([\s\S]*?)(?=\n\w+|\n$)/i;
              const metaInfoMatch = template.match(metaInfoRegex);

              if (metaInfoMatch && metaInfoMatch[1]) {
                // Get the original meta info section
                const originalMetaSection = metaInfoMatch[0];

                // Build a new meta section with only available data
                let newMetaSection = "META INFORMATIONS:\n";

                // Add Level 1 meta if available
                if (generatedContext['Industry_SEO_Meta']) {
                  newMetaSection += JSON.stringify(generatedContext['Industry_SEO_Meta'], null, 2) + "\n";
                }

                // Add any additional level meta that exists
                for (let i = 2; i <= 10; i++) {
                  if (generatedContext[`Level_${i}_SEO_Meta`]) {
                    newMetaSection += JSON.stringify(generatedContext[`Level_${i}_SEO_Meta`], null, 2) + "\n";
                  }
                }

                // Replace the original section with our new one
                template = template.replace(originalMetaSection, newMetaSection);
              }

              // Also handle any remaining specific level placeholders
              for (let i = 1; i <= 10; i++) {
                const placeholder = `{{Level_${i}_Meta_JSON}}`;
                if (template.includes(placeholder)) {
                  if (i === 1 && generatedContext['Industry_SEO_Meta']) {
                    template = template.replace(
                      new RegExp(placeholder, 'g'),
                      JSON.stringify(generatedContext['Industry_SEO_Meta'], null, 2)
                    );
                  } else if (generatedContext[`Level_${i}_SEO_Meta`]) {
                    template = template.replace(
                      new RegExp(placeholder, 'g'),
                      JSON.stringify(generatedContext[`Level_${i}_SEO_Meta`], null, 2)
                    );
                  } else {
                    // Remove the placeholder if we don't have data for this level
                    template = template.replace(new RegExp(placeholder, 'g'), "");
                  }
                }
              }

              // Handle other generic placeholders
              template = template.replace(/\$\{categoryName\}/g, category.name);
              template = template.replace(/\$\{categoryPath\}/g, category.category_path || category.name);
              template = template.replace(/\$\{stage1MetaResult\}/g,
                JSON.stringify(generatedContext['Industry_SEO_Meta'] || {}, null, 2));

              console.log(`--- STAGE 2 TEMPLATE FOR AI ---\n`, template);

              // Execute Master prompt to generate facets
              const aiResult = await generateFacetsWithAI(
                facetSystemPrompt,
                category.name,
                category.category_path || category.name,
                template
              );

              // NEW CODE: Check if we have enough facets, if not, request more
              // NEW CODE: Check if we have enough facets based on the prompt requirements
              let facets = aiResult.facets || [];
              console.log(`  - Initial facet generation: ${facets.length} facets`);

              // Extract the required facet count from the prompt
              let minFacets = 0; // Default to no minimum
              let maxFacets = 0; // Default to no maximum
              const facetCountMatch = template.match(/contain\s+(\d+)–(\d+)\s+filters/i) ||
                template.match(/contain\s+(\d+)-(\d+)\s+filters/i) ||
                template.match(/contain\s+(\d+)\s+filters/i);

              if (facetCountMatch) {
                if (facetCountMatch.length >= 3) {
                  // Range format: "contain X-Y filters"
                  minFacets = parseInt(facetCountMatch[1], 10);
                  maxFacets = parseInt(facetCountMatch[2], 10);
                } else if (facetCountMatch.length >= 2) {
                  // Single number format: "contain X filters"
                  minFacets = parseInt(facetCountMatch[1], 10);
                  maxFacets = minFacets;
                }
              }
              if (maxFacets > 0 && facets.length > maxFacets) {
  console.log(`  - Generated ${facets.length} facets, trimming to ${maxFacets} as per requirements`);
  
  // Sort by priority first, then by confidence score
  const priorityOrder = { "High": 1, "Medium": 2, "Low": 3 };
  facets.sort((a, b) => {
    // First by priority
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by confidence score (descending)
    return b.confidence_score - a.confidence_score;
  });
  
  // Keep only the top maxFacets
  facets = facets.slice(0, maxFacets);
  console.log(`  - Trimmed to ${maxFacets} facets based on priority and confidence score`);
}
              // Only request more facets if a minimum is specified and we don't have enough
              if (minFacets > 0 && facets.length < minFacets) {
                console.log(`  - Warning: Only ${facets.length} facets generated, requirement is ${minFacets}${maxFacets > minFacets ? `-${maxFacets}` : ''}, requesting more...`);

                const additionalPrompt = `
You previously generated ${facets.length} facets for ${category.name}. 
This is INSUFFICIENT based on the requirements. You MUST generate AT LEAST ${minFacets - facets.length} MORE UNIQUE facets.

Current facets: ${facets.map(f => f.facet_name).join(', ')}

Focus on additional attributes like:
- Marine-specific features
- Environmental considerations
- Application scenarios
- Safety features
- Compatibility with specific boat materials
- Usage conditions (saltwater vs freshwater)
- Certifications and standards

Follow the same format as before for each facet.
`;

                const additionalResult = await generateFacetsWithAI(
                  facetSystemPrompt,
                  category.name,
                  category.category_path || category.name,
                  additionalPrompt
                );

                if (additionalResult.facets && Array.isArray(additionalResult.facets)) {
                  const existingFacetNames = new Set(facets.map(f => f.facet_name));
                  const uniqueAdditionalFacets = additionalResult.facets.filter(
                    f => !existingFacetNames.has(f.facet_name)
                  );
                  console.log(`  - Generated ${uniqueAdditionalFacets.length} additional unique facets`);
                  facets = [...facets, ...uniqueAdditionalFacets];
                }
              }

              if (Array.isArray(facets)) {
                facets.forEach(facet => categoryFacets.push({
                  ...facet,
                  source_prompt: 'Master (with SEO intelligence)'
                }));
              }
              console.log(`  - Stage 2 completed: Generated ${facets.length} facets`);
            } else {
              // This handles any other standard prompts (if any)
              let template = prompt.content as string;

              Object.entries(categoryContext).forEach(([key, value]) => {
                template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
              });
              Object.entries(generatedContext).forEach(([key, value]) => {
                template = template.replace(new RegExp(`{{${key}}}`, 'g'), JSON.stringify(value, null, 2));
              });

              const aiResult = await generateFacetsWithAI(
                facetSystemPrompt,
                category.name,
                category.category_path || category.name,
                template
              );

              const facets = aiResult.facets || [];
              if (Array.isArray(facets)) {
                facets.forEach(facet => categoryFacets.push({ ...facet, source_prompt: prompt.name }));
              }
            }
          } catch (promptError) {
            console.error(`Error executing prompt "${prompt.name}" for category "${category.name}":`, promptError.message);
          }
        }

        for (const rawFacet of categoryFacets) {
          const cleanFacet = {
            ...rawFacet,
            confidence_score: Math.round(
              Math.max(1, Math.min(10, Number(rawFacet.confidence_score) || 0))
            ),

            filling_percentage: Math.round(
              Math.max(
                0,
                Math.min(
                  100,
                  Number(rawFacet.filling_percentage) < 1
                    ? Number(rawFacet.filling_percentage) * 100
                    : Number(rawFacet.filling_percentage) || 0
                )
              )
            ),
          };
          allFacetsToInsert.push({
            job_id,
            category_id: category.id,
            client_id: job.client_id,
            prompt_used: selectedPromptIds.join(", "),
            ...cleanFacet,
          });
        }

        processedCount++;
        const progress = Math.round(
          (processedCount / category_ids.length) * 100
        );
        await supabase
          .from("facet_generation_jobs")
          .update({ progress, processed_categories: processedCount })
          .eq("id", job_id);
      } catch (error) {
        console.error(
          `Error processing category ${category.id}:`,
          error.message
        );
      }
    }

      if (allFacetsToInsert.length > 0) {
      const priorityOrder = { High: 1, Medium: 2, Low: 3 };
      allFacetsToInsert.sort((a, b) => {
        const pA = priorityOrder[a.priority] || 4;
        const pB = priorityOrder[b.priority] || 4;
        if (pA !== pB) return pA - pB;
        if ((b.confidence_score || 0) !== (a.confidence_score || 0))
          return (b.confidence_score || 0) - (a.confidence_score || 0);
        return (b.filling_percentage || 0) - (a.filling_percentage || 0);
      });
      allFacetsToInsert.forEach((facet, index) => {
        facet.sort_order = index + 1;
      });

      const { error: insertError } = await supabase
        .from("recommended_facets")
        .insert(allFacetsToInsert);
      if (insertError) throw insertError;
    }

    await supabase
      .from("facet_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    return new Response(
      JSON.stringify({
        success: true,
        facets_generated: allFacetsToInsert.length,
        categories_processed: processedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Function error:", error);
    if (jobIdFromRequest) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("facet_generation_jobs")
          .update({ status: "failed", error_message: error.message })
          .eq("id", jobIdFromRequest);
      } catch (e) {
        console.error("Failed to update job status to failed:", e);
      }
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
