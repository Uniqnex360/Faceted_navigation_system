import { useState, useEffect, useMemo } from "react";
import {
  Settings,
  CheckSquare,
  Square,
  Play,
  Download,
  Filter,
  Search,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Category, PromptTemplate, RecommendedFacet } from "../types";
import { PROMPT_EXECUTION_ORDER } from "../utils/PromptOrder";
import { useToast } from "../contexts/ToastContext";

interface FacetGenerationProps {
  onComplete: () => void;
}

export default function FacetGeneration({ onComplete }: FacetGenerationProps) {
  const toast = useToast();
  const { user } = useAuth();
  const [columnMapping, setColumnMapping] = useState({
    input_taxonomy: "A. Input Taxonomy",
    end_category: "B. End Category (C3)",
    facet_name: "C. Filter Attributes",
    possible_values: "D. Possible Values",
    filling_percentage: "E. Filling Percentage (Approx.)",
    priority: "F. Priority (High / Medium / Low)",
    confidence_score: "G. Confidence Score (1–10)",
    num_sources: "H. # of available sources",
    source_urls: "I. List the sources URL",
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(
    new Set()
  );

  const [projectName, setProjectName] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isCategoryListExpanded, setIsCategoryListExpanded] = useState(true);
  const [levelSelections, setLevelSelections] = useState<{
    [key: number]: string;
  }>({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" });

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFacets, setGeneratedFacets] = useState<RecommendedFacet[]>(
    []
  );
  const [groupedFacets, setGroupedFacets] = useState<{
    [categoryId: string]: RecommendedFacet[];
  }>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptSubSelections, setPromptSubSelections] = useState<{
    [promptId: string]: Set<string>;
  }>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedFacetsForExport, setSelectedFacetsForExport] = useState<{
    [categoryId: string]: Set<string>;
  }>({});
  const geographyCountriesFromPrompt = useMemo(() => {
    const geographyPrompt = prompts.find((p) => p.name === "Geography");
    if (
      geographyPrompt &&
      Array.isArray(geographyPrompt.metadata?.country_templates)
    ) {
      const countries = geographyPrompt.metadata.country_templates.map(
        (t: any) => t.country
      );
      return countries.length > 1 ? countries : [];
    }
    return [];
  }, [prompts]);
  useEffect(() => {
    loadData();
  }, [user]);

  const toggleFacetForExport = (categoryId: string, facetId: string) => {
    setSelectedFacetsForExport((prev) => {
      const newSelections = { ...prev };
      const categorySelections = new Set(newSelections[categoryId] || []);

      if (categorySelections.has(facetId)) {
        categorySelections.delete(facetId);
      } else {
        categorySelections.add(facetId);
      }

      newSelections[categoryId] = categorySelections;
      return newSelections;
    });
  };
  const getLevelCategories = (level: number) => {
    if (level === 1) {
      const uniqueL1 = Array.from(
        new Set(
          categories.map((c) => {
            return c.category_path.split(">")[0].trim();
          })
        )
      );
      return uniqueL1.sort().map((name) => ({ id: name, name }));
    }

    const parentPathParts = [];
    for (let i = 1; i < level; i++) {
      if (levelSelections[i]) parentPathParts.push(levelSelections[i]);
      else return [];
    }

    const parentPathString = parentPathParts.join(" > ");

    const children = categories.filter(
      (c) =>
        c.category_path.startsWith(parentPathString + " >") ||
        c.category_path === parentPathString
    );

    const uniqueNames = Array.from(
      new Set(
        children.map((c) => {
          const parts = c.category_path.split(">");
          return parts[level - 1]?.trim();
        })
      )
    ).filter(Boolean);

    return uniqueNames.sort().map((name) => ({ id: name, name }));
  };

  const handleAddToJob = () => {
    // 1. Strict Requirement: Must have Level 1 and 2
    if (!levelSelections[1] || !levelSelections[2]) {
      toast.error("Please select at least Level 1 and Level 2!");
      return;
    }

    const selectedLevels = Object.values(levelSelections).filter(Boolean);
    const fullPath = selectedLevels.join(" > ");

    // 2. Search for the category
    // First try exact match (e.g. if the user actually picked all 3 levels)
    let targetCategory = categories.find(
      (c) => c.category_path.trim() === fullPath.trim()
    );

    // 3. FALLBACK: If user only picked L1 > L2, find the first L3 that belongs to it
    if (!targetCategory) {
      targetCategory = categories.find((c) =>
        c.category_path.trim().startsWith(fullPath.trim())
      );
    }

    // 4. Execution
    if (targetCategory) {
      toggleCategory(targetCategory.id);
      // Logic check: if already in queue, we are removing it, else adding
      const isRemoving = selectedCategories.has(targetCategory.id);
      toast.success(isRemoving ? `Removed: ${fullPath}` : `Added: ${fullPath}`);
    } else {
      // This only shows if the text typed doesn't exist in any category_path string
      toast.error("No matching data found for this selection.");
    }
  };
  const handleLevelChange = (level: number, id: string) => {
    const newSelections = { ...levelSelections, [level]: id };
    for (let i = level + 1; i <= 6; i++) {
      newSelections[i] = "";
    }
    setLevelSelections(newSelections);
  };
  const filteredCategories = categories.filter((c) => {
    const matchSearches =
      c.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
      (c.category_path || "")
        .toLowerCase()
        .includes(categorySearch.toLowerCase());
    if (showSelectedOnly) {
      return matchSearches && selectedCategories.has(c.id);
    }
    return matchSearches;
  });

  const toggleSelectAllForCategory = (
    categoryId: string,
    facetsInCategory: RecommendedFacet[]
  ) => {
    setSelectedFacetsForExport((prev) => {
      const newSelections = { ...prev };
      const currentSelections = newSelections[categoryId] || new Set();
      const allFacetIdsInThisCategory = facetsInCategory.map((f) => f.id);

      if (currentSelections.size === allFacetIdsInThisCategory.length) {
        newSelections[categoryId] = new Set();
      } else {
        newSelections[categoryId] = new Set(allFacetIdsInThisCategory);
      }

      return newSelections;
    });
  };
  const totalSelectedForExport = Object.values(selectedFacetsForExport).reduce(
    (sum, set) => sum + set.size,
    0
  );
  const loadData = async () => {
    if (!user) return;

    const clientFilter =
      user.role === "super_admin" ? {} : { client_id: user.client_id };

    const [categoriesData, promptsData] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .match(clientFilter)
        .order("category_path"),
      supabase
        .from("prompt_templates")
        .select("*")
        .order("level")
        .eq("is_active", true)
        .order("execution_order"),
    ]);
    const loadedPrompts = (promptsData.data as PromptTemplate[]) || [];
    const sortedPrompts = loadedPrompts.sort((a, b) => {
      const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
      const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
      const finalIndexA = indexA === -1 ? Infinity : indexA;
      const finalIndexB = indexB === -1 ? Infinity : indexB;
      return finalIndexA - finalIndexB;
    });
    setCategories((categoriesData.data as Category[]) || []);
    setPrompts(sortedPrompts);
    const targetPrompts = ["Industry Analysis", "Master Prompt"];
    const defaultSelectedIds = sortedPrompts
      .filter((p) => targetPrompts.includes(p.name))
      .map((p) => p.id);
    setSelectedPrompts(new Set(defaultSelectedIds));
  };

  const handlePromptSubSelectionChange = (
    promptId: string,
    subSelection: string
  ) => {
    setPromptSubSelections((prev) => {
      const currentSelections = new Set(prev[promptId] || []);

      if (currentSelections.has(subSelection)) {
        currentSelections.delete(subSelection);
      } else {
        currentSelections.add(subSelection);
      }

      return {
        ...prev,
        [promptId]: currentSelections,
      };
    });
  };
  const toggleCategory = (id: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCategories(newSelected);
  };

  const togglePrompt = (id: string) => {
    const newSelected = new Set(selectedPrompts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
      setPromptSubSelections((prev) => {
        const newSubSelections = { ...prev };
        delete newSubSelections[id];
        return newSubSelections;
      });
    } else {
      newSelected.add(id);
    }
    setSelectedPrompts(newSelected);
  };

  const selectAllCategories = () => {
    if (selectedCategories.size === categories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(categories.map((c) => c.id)));
    }
  };

  const selectAllPrompts = () => {
    if (selectedPrompts.size === prompts.length) {
      setSelectedPrompts(new Set());
    } else {
      setSelectedPrompts(new Set(prompts.map((p) => p.id)));
    }
  };

  const checkForDuplicateJob = async () => {
    if (!user) return null;
    const currentCategoryIds = Array.from(selectedCategories).sort().join(",");
    const currentPromptIds = Array.from(selectedPrompts).sort().join(",");
    const { data: recentJobs } = await supabase
      .from("facet_generation_jobs")
      .select("*")
      .eq("client_id", user.client_id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!recentJobs) return null;
    const duplicateJob = recentJobs.find((job) => {
      const jobCatIds = (job.category_ids || []).sort().join(",");
      const jobPromptIds = (job.selected_prompts || []).sort().join(",");
      return (
        jobCatIds === currentCategoryIds && jobPromptIds === currentPromptIds
      );
    });
    return duplicateJob;
  };
  const loadExistingResult = async (existingJobId: string) => {
    setIsGenerating(true);
    try {
      toast.info("Loading existing results.....");
      const { data: facets } = await supabase
        .from("recommended_facets")
        .select("*")
        .eq("job_id", existingJobId)
        .order("sort_order");
      const fetchedFacets = (facets as RecommendedFacet[]) || [];
      setGeneratedFacets(fetchedFacets);
      setJobId(existingJobId);
      const grouped = fetchedFacets.reduce((acc, facet) => {
        const categoryId = facet.category_id;
        if (!acc[categoryId]) acc[categoryId] = [];
        acc[categoryId].push(facet);
        return acc;
      }, {} as { [categoryId: string]: RecommendedFacet[] });
      setGroupedFacets(grouped);
      toast.success("Loaded existing results successfully!");
    } catch (error: any) {
      console.error("Error loading existing:", error);
      toast.error("Failed to load existing results.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFacets = async (forceNew = false) => {
    if (selectedCategories.size === 0) return;

    if (!forceNew) {
      const duplicateJob = await checkForDuplicateJob();
      if (duplicateJob) {
        const date = new Date(duplicateJob.created_at).toLocaleDateString();
        toast.confirm(
          `Idenfical resuls found from ${date}.Load them to save credits?`,
          () => {
            loadExistingResult(duplicateJob.id);
          },
          {
            confirmText: "Load Existing (Free)",
            cancelText: "Generate New (Cost)",
            onCancel: () => {
              generateFacets(true);
            },
          }
        );
        return;
      }
    }
    if (!user) {
      setError("You must be logged in to perform this action.");
      return;
    }
    const clientIdToSave = user.client_id;
    if (!clientIdToSave) {
      setError(
        "Your user profile is not associated with a client. Cannot create job."
      );
      setIsGenerating(false);
      return;
    }
    if (selectedCategories.size === 0) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      setValidationError(null);
      for (const promptId of selectedPrompts) {
        const prompt = prompts.find((p) => p.id === promptId);
        // if (prompt?.name === "Geography") {
        //   const configuredCountries =
        //     (prompt.metadata as any)?.country_templates || [];
        //   const selectedCountries = promptSubSelections[prompt.id] || new Set();

        //   // The new rule: if more than 1 country is available, at least 1 must be selected.
        //   if (configuredCountries.length > 1 && selectedCountries.size === 0) {
        //     const validationMessage =
        //       "Please select at least one country for the Geography prompt.";
        //     setValidationError(validationMessage);
        //     setIsGenerating(false); // Stop the spinner
        //     return; // Stop the entire function
        //   }
        // }
      }
      // const selectedPromptObjects = prompts.filter((p) =>
      //   selectedPrompts.has(p.id)
      // );
      // selectedPromptObjects.sort((a, b) => {
      //   const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
      //   const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
      //   const finalIndexA = indexA === -1 ? Infinity : indexA;
      //   const finalIndexB = indexB === -1 ? Infinity : indexB;
      //   return finalIndexA - finalIndexB;
      // });
      const selectedPromptObjects = prompts.filter((p) =>
        selectedPrompts.has(p.id)
      );

      selectedPromptObjects.sort((a, b) => {
        const nameA = a.name.trim();
        const nameB = b.name.trim();

        if (nameA === "Industry Analysis") return -1;
        if (nameB === "Industry Analysis") return 1;

        if (nameA === "Master Prompt") return 1;
        if (nameB === "Master Prompt") return -1;

        const indexA = PROMPT_EXECUTION_ORDER.indexOf(nameA);
        const indexB = PROMPT_EXECUTION_ORDER.indexOf(nameB);

        const finalIndexA = indexA === -1 ? 999 : indexA;
        const finalIndexB = indexB === -1 ? 999 : indexB;

        return finalIndexA - finalIndexB;
      });
      const promptsPayload = selectedPromptObjects
        .map((prompt) => {
          if (!prompt) {
            return null;
          }
          const activeLevels = Object.values(levelSelections).filter(Boolean);
          const selectionDepth = activeLevels.length;
          const categoriesForAI = Array.from(selectedCategories)
            .map((id) => {
              const cat = categories.find((c) => c.id === id);
              if (!cat) return null;

              const pathParts = cat.category_path.split(" > ");
              const cleanedPath = pathParts
                .slice(0, selectionDepth)
                .join(" > ");

              return {
                ...cat,
                category_path: cleanedPath,
                level: selectionDepth,
                name: pathParts[selectionDepth - 1],
              };
            })
            .filter(Boolean);
          let assembledContent: string | object | string[];

          if (prompt.name === "Industry Analysis") {
            // const level1Content = prompt.template || "";
            // const otherLevels = (prompt.metadata as any)?.marine_levels || [];
            // assembledContent = [level1Content, ...otherLevels].filter(Boolean);
            assembledContent = prompt.template || "";

            // } else if (prompt.name === "Geography") {
            //   const countryTemplatesArray =
            //     (prompt.metadata as any)?.country_templates || [];
            //   if (countryTemplatesArray.length === 0) {
            //     assembledContent = {};
            //   } else {
            //     // Convert the array of {country, template} to an object for easy lookup
            //     const allCountryTemplates = Object.fromEntries(
            //       countryTemplatesArray.map((t: any) => [t.country, t.template])
            //     );

            //     const selectedCountriesForJob = promptSubSelections[prompt.id] || new Set();

            //     // This rule requires a selection if more than 1 country is available
            //     if (countryTemplatesArray.length > 1 && selectedCountriesForJob.size === 0) {
            //        // This case is handled by the validation loop before this map runs.
            //        // We can default to sending all, but validation is better.
            //        // For safety, we can default to sending an empty object here if validation somehow fails.
            //        assembledContent = {};
            //     } else if (countryTemplatesArray.length === 1) {
            //         assembledContent = allCountryTemplates;
            //     } else { // This means multiple countries are available AND a selection was made.
            //       assembledContent = Object.fromEntries(
            //         Object.entries(allCountryTemplates).filter(([country, _]) =>
            //           selectedCountriesForJob.has(country)
            //         )
            //       );
            //     }
            //   }
            // }
          } else {
            assembledContent = prompt.template;
          }

          return {
            id: prompt.id,
            name: prompt.name,
            content: assembledContent,
            metadata: prompt.metadata,
            context_categories: categoriesForAI,
          };
        })
        .filter((p) => p !== null);

      const { data: job, error: jobError } = await supabase
        .from("facet_generation_jobs")
        .insert({
          client_id: clientIdToSave,
          project_name: projectName,
          category_ids: Array.from(selectedCategories),
          selected_prompts: Array.from(selectedPrompts),
          status: "processing",
          total_categories: selectedCategories.size,
          processed_categories: 0,
          created_by: user.id,
        })
        .select()
        .maybeSingle();

      if (jobError || !job) throw jobError;
      setJobId(job.id);

      const apiUrl = `${
        import.meta.env.VITE_SUPABASE_URL
      }/functions/v1/generate-facets-ai`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: job.id,
          category_ids: Array.from(selectedCategories),
          prompts: promptsPayload,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Generation failed with status ${response.status}: ${errorBody}`
        );
      }
      const responseData = await response.json();
      console.log("🎯 API RESPONSE:", responseData);

      const { data: facets } = await supabase
        .from("recommended_facets")
        .select("*")
        .eq("job_id", job.id)
        .order("sort_order");
      const fetchedFacets = (facets as RecommendedFacet[]) || [];
      setGeneratedFacets(fetchedFacets);
      const { data: jobData } = await supabase
        .from("facet_generation_jobs")
        .select("metadata")
        .eq("id", job.id)
        .single();

      if (jobData?.metadata?.output_format?.columns) {
        const columns = jobData.metadata.output_format.columns;
        setColumnMapping({
          input_taxonomy: columns[0] || "A. Input Taxonomy",
          end_category: columns[1] || "B. End Category (C3)",
          facet_name: columns[2] || "C. Filter Attributes",
          possible_values: columns[3] || "D. Possible Values",
          filling_percentage: columns[4] || "E. Filling Percentage (Approx.)",
          priority: columns[5] || "F. Priority (High / Medium / Low)",
          confidence_score: columns[6] || "G. Confidence Score (1–10)",
          num_sources: columns[7] || "H. # of available sources",
          source_urls: columns[8] || "I. List the sources URL",
        });
      }
      const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
      const grouped = fetchedFacets.reduce((acc, facet) => {
        const categoryId = facet.category_id;
        if (!acc[categoryId]) {
          acc[categoryId] = [];
        }
        acc[categoryId].push(facet);
        return acc;
      }, {} as { [categoryId: string]: RecommendedFacet[] });
      setGroupedFacets(grouped);

      await supabase
        .from("facet_generation_jobs")
        .update({
          status: "completed",
          progress: 100,
          processed_categories: selectedCategories.size,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } catch (error: any) {
      console.error("Error generating facets:", error);
      setError(`Failed to generate facets: ${error.message}`);
      if (jobId) {
        await supabase
          .from("facet_generation_jobs")
          .update({ status: "failed" })
          .eq("id", jobId);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const exportFacets = async () => {
    const allSelectedIds = new Set(
      Object.values(selectedFacetsForExport).flatMap((set) => Array.from(set))
    );

    if (allSelectedIds.size === 0) {
      console.log("No facets selected for export.");
      return;
    }

    const facetsToExport = generatedFacets.filter((facet) =>
      allSelectedIds.has(facet.id)
    );

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    // Updated CSV header with all 9 columns
    const csvRows = [
      "Input Taxonomy,End Category (C3),Filter Attributes,Possible Values,Filling Percentage (Approx.),Priority (High / Medium / Low),Confidence Score (1–10),# of available sources,List the sources URL",
      ...facetsToExport.map((f) => {
        const categoryPath =
          categories.find((c) => c.id === f.category_id)?.category_path ||
          "N/A";
        const categoryName =
          categoryMap.get(f.category_id) || "Unknown Category";

        // Column A: Input Taxonomy
        const inputTaxonomy =
          f["Input Taxonomy"] || f["A. Input Taxonomy"] || categoryPath;

        // Column B: End Category
        const endCategory =
          f["End Category (C3)"] || f["B. End Category (C3)"] || categoryName;

        // Column C: Filter Attributes
        const filterAttributes =
          f.facet_name ||
          f["Filter Attributes"] ||
          f["C. Filter Attributes"] ||
          "";

        // Column D: Possible Values
        const possibleValues =
          f.possible_values ||
          f["Possible Values"] ||
          f["D. Possible Values"] ||
          "";

        // Column E: Filling Percentage
        const fillingPercentage =
          f.filling_percentage ||
          f["Filling Percentage (Approx.)"] ||
          f["E. Filling Percentage (Approx.)"] ||
          0;

        // Column F: Priority
        const priority =
          f.priority ||
          f["Priority (High / Medium / Low)"] ||
          f["F. Priority (High / Medium / Low)"] ||
          "Medium";

        // Column G: Confidence Score
        const confidenceScore =
          f.confidence_score ||
          f["Confidence Score (1–10)"] ||
          f["G. Confidence Score (1–10)"] ||
          5;

        const numSources =
          f.num_sources ||
          f["# of available sources"] ||
          f["H. # of available sources"] ||
          0;

        const sourceUrls =
          f.source_urls ||
          f["List the sources URL"] ||
          f["I. List the sources URL"] ||
          "N/A";

        const safeInputTaxonomy = `"${String(inputTaxonomy).replace(
          /"/g,
          '""'
        )}"`;
        const safeEndCategory = `"${String(endCategory).replace(/"/g, '""')}"`;
        const safeFilterAttributes = `"${String(filterAttributes).replace(
          /"/g,
          '""'
        )}"`;
        const safePossibleValues = `"${String(possibleValues).replace(
          /"/g,
          '""'
        )}"`;
        const safeSourceUrls = `"${String(sourceUrls).replace(/"/g, '""')}"`;

        return [
          safeInputTaxonomy,
          safeEndCategory,
          safeFilterAttributes,
          safePossibleValues,
          fillingPercentage,
          priority,
          confidenceScore,
          numSources,
          safeSourceUrls,
        ].join(",");
      }),
    ];

    const csv = csvRows.join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `facets-${projectName || jobId}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    await supabase.from("export_history").insert({
      job_id: jobId,
      client_id:user?.client_id,
      category_ids: Array.from(selectedCategories),
      format: "csv",
      exported_by: user?.id,
    });
  };

  if (generatedFacets.length > 0) {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Generated Facets
        </h2>

        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">
                {generatedFacets.length} facets generated
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                For {selectedCategories.size} categories
              </p>
            </div>
            <div className="flex gap-3">
              <button
                disabled={totalSelectedForExport === 0}
                onClick={exportFacets}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export{" "}
                {totalSelectedForExport > 0
                  ? `(${totalSelectedForExport})`
                  : ""}
              </button>
              <button
                onClick={onComplete}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {Object.entries(groupedFacets).map(
            ([categoryId, facetsForCategory]) => (
              <div
                key={categoryId}
                className="bg-white rounded-lg border border-slate-200 overflow-hidden"
              >
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                  <h4 className="text-lg font-semibold text-slate-900">
                    {categoryMap.get(categoryId) || "Unknown Category"}
                  </h4>
                  <p className="text-sm text-slate-600">
                    {facetsForCategory.length} facets
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 w-12 text-left">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={
                              (selectedFacetsForExport[categoryId]?.size ||
                                0) === facetsForCategory.length &&
                              facetsForCategory.length > 0
                            }
                            onChange={() =>
                              toggleSelectAllForCategory(
                                categoryId,
                                facetsForCategory
                              )
                            }
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.input_taxonomy}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.end_category}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.facet_name}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.possible_values}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.filling_percentage}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.priority}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.confidence_score}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.num_sources}
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                          {columnMapping.source_urls}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {facetsForCategory.map((facet) => (
                        <tr key={facet.id} className="hover:bg-slate-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={(
                                selectedFacetsForExport[categoryId] || new Set()
                              ).has(facet.id)}
                              onChange={() =>
                                toggleFacetForExport(categoryId, facet.id)
                              }
                            />
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                            {facet["Input Taxonomy"] ||
                              facet["A. Input Taxonomy"] ||
                              categories.find((c) => c.id === categoryId)
                                ?.category_path ||
                              "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {facet["End Category (C3)"] ||
                              facet["B. End Category (C3)"] ||
                              categoryMap.get(categoryId) ||
                              "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">
                            {facet.facet_name ||
                              facet["Filter Attributes"] ||
                              facet["C. Filter Attributes"] ||
                              "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 max-w-md truncate">
                            {facet.possible_values ||
                              facet["Possible Values"] ||
                              facet["D. Possible Values"] ||
                              "N/A"}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {facet.filling_percentage ||
                              facet["Filling Percentage (Approx.)"] ||
                              facet["E. Filling Percentage (Approx.)"] ||
                              0}
                            %
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${
                                (facet.priority ||
                                  facet["Priority (High / Medium / Low)"] ||
                                  facet[
                                    "F. Priority (High / Medium / Low)"
                                  ]) === "High"
                                  ? "bg-red-100 text-red-700"
                                  : (facet.priority ||
                                      facet["Priority (High / Medium / Low)"] ||
                                      facet[
                                        "F. Priority (High / Medium / Low)"
                                      ]) === "Medium"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {facet.priority ||
                                facet["Priority (High / Medium / Low)"] ||
                                facet["F. Priority (High / Medium / Low)"] ||
                                "Medium"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {facet.confidence_score ||
                              facet["Confidence Score (1–10)"] ||
                              facet["G. Confidence Score (1–10)"] ||
                              5}
                            /10
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {facet.num_sources ||
                              facet["# of available sources"] ||
                              facet["H. # of available sources"] ||
                              0}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                            {facet.source_urls ||
                              facet["List the sources URL"] ||
                              facet["I. List the sources URL"] ||
                              "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Generate Facets
      </h2>

      {/* <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Project Name
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Enter project name"
          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div> */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6 flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" /> Category Schema
            </h3>
            <button
              onClick={() =>
                setLevelSelections({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" })
              }
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Reset Filters
            </button>
          </div>

          {/* Multi-Level Cascading Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[1, 2, 3, 4, 5, 6].map((level) => {
              const levelCats = getLevelCategories(level);
              const isDisabled = level > 1 && !levelSelections[level - 1];

              return (
                <div key={level} className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Level {level}
                  </label>
                  <select
                    disabled={isDisabled}
                    value={levelSelections[level]}
                    onChange={(e) => handleLevelChange(level, e.target.value)}
                    className={`w-full p-2 text-sm border rounded-lg outline-none transition-all ${
                      isDisabled
                        ? "bg-slate-50 border-slate-100 text-slate-300"
                        : "bg-white border-slate-200 focus:ring-2 focus:ring-blue-500"
                    }`}
                  >
                    <option value="">Select Category</option>
                    {levelCats.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Active Selection Area */}
          {Object.values(levelSelections).some((v) => v !== "") && (
            <div className="mt-2 p-4 bg-blue-50 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">
                    Current Selection
                  </p>
                  <p className="text-sm font-medium text-blue-900 truncate">
                    {(() => {
                      const ids =
                        Object.values(levelSelections).filter(Boolean);
                      const lastId = ids[ids.length - 1];
                      return categories.find((c) => c.id === lastId)
                        ?.category_path;
                    })()}
                  </p>
                </div>
                <button
                  onClick={handleAddToJob}
                  disabled={!levelSelections[1] || !levelSelections[2]}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    (() => {
                      const fullPath = Object.values(levelSelections)
                        .filter(Boolean)
                        .join(" > ");
                      const cat = categories.find((c) =>
                        c.category_path.startsWith(fullPath)
                      );
                      return cat && selectedCategories.has(cat.id);
                    })()
                      ? "bg-red-100 text-red-600 hover:bg-red-200"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                  }`}
                >
                  {(() => {
                    const fullPath = Object.values(levelSelections)
                      .filter(Boolean)
                      .join(" > ");
                    const cat = categories.find(
                      (c) => c.category_path === fullPath
                    );
                    return cat && selectedCategories.has(cat.id)
                      ? "Remove from Job"
                      : "Add to Job";
                  })()}
                </button>
              </div>
            </div>
          )}

          {/* Persistent Selection Footer */}
          <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-700">
                {selectedCategories.size} Categories Selected
              </span>
              <span className="text-[10px] text-slate-400">
                Total in processing queue
              </span>
            </div>
            {selectedCategories.size > 0 && (
              <button
                onClick={() => setSelectedCategories(new Set())}
                className="text-[10px] text-red-500 font-bold hover:underline uppercase"
              >
                Clear Queue
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">
              Select Prompts ({selectedPrompts.size})
            </h3>
            <button
              onClick={selectAllPrompts}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {selectedPrompts.size === prompts.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
          {validationError && (
            <div
              className="bg-yellow-50 border border-yellow-200 text-sm text-yellow-800 px-4 py-2 rounded-lg mb-4"
              role="alert"
            >
              {validationError}
            </div>
          )}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="p-3 hover:bg-slate-50 rounded-lg transition-colors"
              >
                {/* Main Prompt Checkbox */}
                <button
                  onClick={() => togglePrompt(prompt.id)}
                  className="w-full flex items-center gap-3 text-left"
                >
                  {selectedPrompts.has(prompt.id) ? (
                    <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {prompt.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Level {prompt.level} • {prompt.type}
                    </p>
                  </div>
                </button>

                {/* {prompt.name === "Geography" &&
                  selectedPrompts.has(prompt.id) &&
                  geographyCountriesFromPrompt.length > 0 && (
                    <div className="pl-8 pt-3 space-y-2">
                      <p className="text-xs font-semibold text-slate-600">
                        Select countries to include:
                      </p>
                      {geographyCountriesFromPrompt.map((country) => (
                        <button
                          key={country}
                          onClick={() =>
                            handlePromptSubSelectionChange(prompt.id, country)
                          }
                          className="w-full flex items-center gap-3 text-left"
                        >
                          {(promptSubSelections[prompt.id] || new Set()).has(
                            country
                          ) ? (
                            <CheckSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-sm text-slate-800">
                            {country}
                          </span>
                        </button>
                      ))}
                    </div>
                  )} */}
                {/* --- END: NEW CONDITIONAL UI --- */}
              </div>
            ))}
          </div>
        </div>
      </div>
      {error && (
        <div
          className="text-center bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 rounded-lg mb-4 max-w-4xl mx-auto"
          role="alert"
        >
          <strong className="font-bold">An error occurred: </strong>
          <span>{error}</span>
        </div>
      )}
      <div className="flex justify-center">
        <button
          onClick={() => generateFacets(false)}
          disabled={isGenerating || selectedCategories.size === 0}
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <>
              <Settings className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Generate Facets
            </>
          )}
        </button>
      </div>
    </div>
  );
}
