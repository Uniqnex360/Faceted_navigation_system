import { useState, useEffect, useMemo, useRef } from "react";
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
  const autoResetTimerRef = useRef<NodeJS.Timeout | null>(null);
  const toast = useToast();
  const { user } = useAuth();

  // State
  const [columnMapping, setColumnMapping] = useState({
    input_taxonomy: "A. Input Taxonomy",
    end_category: "B. End Category (C3)",
    facet_name: "C. Filter Attributes",
    possible_values: "D. Possible Values",
    filling_percentage: "E. Filling Percentage (Approx.)",
    priority: "F. Priority (High / Medium / Low)",
    confidence_score: "G. Confidence Score (1–10)",
    num_sources: "H. # of available sources",
    source_urls: "I. Sources URLs",
  });
  const [isQueueLoaded, setIsQueueLoaded] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(
    new Set()
  );
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [levelSearchQueries, setLevelSearchQueries] = useState<{
    [key: number]: string;
  }>({ 1: "", 2: "", 3: "" });
  const [projectName, setProjectName] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
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
  const [activeTab, setActiveTab] = useState<string>("");
  const [promptSubSelections, setPromptSubSelections] = useState<{
    [promptId: string]: Set<string>;
  }>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedFacetsForExport, setSelectedFacetsForExport] = useState<{
    [categoryId: string]: Set<string>;
  }>({});

  useEffect(() => {
    return () => {
      if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    loadData();
  }, [user, onComplete]);

  const toggleFacetForExport = (categoryId: string, facetId: string) => {
    setSelectedFacetsForExport((prev) => {
      const newSelections = { ...prev };
      const categorySelections = new Set(newSelections[categoryId] || []);
      if (categorySelections.has(facetId)) categorySelections.delete(facetId);
      else categorySelections.add(facetId);
      newSelections[categoryId] = categorySelections;
      return newSelections;
    });
  };

  const getLevelCategories = (level: number) => {
    let filtered = [];
    const searchTerm = levelSearchQueries[level].toLowerCase();
    const visibleOnly = categories.filter((c) => c.is_visible !== false);
    if (level === 1) {
      const uniqueL1 = Array.from(
        new Set(visibleOnly.map((c) => c.category_path.split(">")[0].trim()))
      );
      filtered = uniqueL1.sort().map((name) => ({ id: name, name }));
    } else {
      const parentPathParts = [];
      for (let i = 1; i < level; i++) {
        if (levelSelections[i]) parentPathParts.push(levelSelections[i]);
        else return [];
      }
      const parentPathString = parentPathParts.join(" > ");
      const children = visibleOnly.filter(
        (c) =>
          c.category_path.startsWith(parentPathString + " >") ||
          c.category_path === parentPathString
      );
      const uniqueNames = Array.from(
        new Set(
          children.map((c) => c.category_path.split(">")[level - 1]?.trim())
        )
      ).filter(Boolean);
      filtered = uniqueNames.sort().map((name) => ({ id: name, name }));
    }
    return filtered.filter((cat) =>
      cat.name.toLowerCase().includes(searchTerm)
    );
  };

  const globalSearchResults = useMemo(() => {
    const searchTerm = globalSearch.toLowerCase().trim();
    const activeLevels = Object.values(levelSelections).filter(Boolean);
    const constraintPath = activeLevels.join(" > ");
    return categories
      .filter((c) => {
        if (c.is_visible === false) return false;
        const path = c.category_path.toLowerCase();
        const matchesSearch = searchTerm === "" || path.includes(searchTerm);
        const matchesConstraint =
          constraintPath === "" || c.category_path.startsWith(constraintPath);
        return matchesSearch && matchesConstraint;
      })
      .slice(0, 50);
  }, [categories, globalSearch, levelSelections]);

  const selectFromGlobal = (category: Category) => {
    setIsGlobalSearchOpen(false);
    const pathParts = category.category_path.split(" > ").map((p) => p.trim());
    const newSelections: { [key: number]: string } = {
      1: "",
      2: "",
      3: "",
      4: "",
      5: "",
      6: "",
    };
    pathParts.forEach((part, idx) => {
      if (idx < 6) newSelections[idx + 1] = part;
    });
    setLevelSelections(newSelections);
    setGlobalSearch("");
    setIsGlobalSearchOpen(false);
    toast.info(`Navigation synced to: ${category.name}`);
  };

  // Close dropdowns
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdown(null);
      setIsGlobalSearchOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenDropdown(null);
        setIsGlobalSearchOpen(false);
        setGlobalSearch("");
      }
    };
    if (openDropdown !== null || isGlobalSearchOpen) {
      window.addEventListener("click", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("click", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdown, isGlobalSearchOpen]);

  // Queue Persistence
  useEffect(() => {
    if (!user) return;
    const loadQueue = async () => {
      const { data } = await supabase
        .from("user_queues")
        .select("queue")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.queue && Array.isArray(data.queue)) {
        setSelectedCategories(new Set(data.queue));
      }
      setIsQueueLoaded(true);
    };
    loadQueue();
  }, [user]);

  useEffect(() => {
    if (!user || !isQueueLoaded) return;
    const saveQueue = async () => {
      const queueArray = Array.from(selectedCategories);
      const { error } = await supabase.from("user_queues").upsert({
        user_id: user.id,
        queue: queueArray,
        updated_at: new Date(),
      });
      if (error) console.error("Error saving queue:", error);
    };
    const timeoutId = setTimeout(saveQueue, 500);
    return () => clearTimeout(timeoutId);
  }, [selectedCategories, user, isQueueLoaded]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (selectedCategories.size > 0) {
        e.preventDefault();
        e.returnValue =
          "You have items in your processing queue. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [selectedCategories.size]);

  const handleResetFilters = () => {
    if (!Object.values(levelSelections).some(Boolean)) return;
    toast.confirm(
      "Reset all selected levels? Your current navigation path will be cleared.",
      () => {
        setLevelSelections({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" });
        setLevelSearchQueries({ 1: "", 2: "", 3: "" });
        toast.success("Filters reset");
      },
      { confirmText: "Reset", cancelText: "Stay" }
    );
  };

  const handleClearQueue = () => {
    toast.confirm(
      `Remove all ${selectedCategories.size} categories from the queue?`,
      () => {
        setSelectedCategories(new Set());
        toast.success("Queue cleared");
      },
      { confirmText: "Clear All", cancelText: "Keep" }
    );
  };

  const confirmRemoveItem = (id: string, path: string) => {
    toast.confirm(
      `Remove "${path}" from the processing queue?`,
      () => {
        toggleCategory(id);
        toast.success("Item removed");
      },
      { confirmText: "Remove", cancelText: "Cancel" }
    );
  };

  const handleAddToJob = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenDropdown(null);
    if (autoResetTimerRef.current) {
      clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = null;
    }

    if (!levelSelections[1] || !levelSelections[2]) {
      toast.error("Please select at least Level 1 and Level 2!");
      return;
    }

    const selectedLevels = Object.values(levelSelections).filter(Boolean);
    const fullPath = selectedLevels.join(" > ");
    const exactCategory = categories.find(
      (c) => c.category_path.trim() === fullPath.trim()
    );

    if (exactCategory) {
      toggleCategory(exactCategory.id);
      const isRemoving = selectedCategories.has(exactCategory.id);
      if (isRemoving) toast.success(`Removed: ${fullPath}`);
      else {
        toast.success(`Added: ${fullPath}`);
        setLevelSelections({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" });
        setLevelSearchQueries({ 1: "", 2: "", 3: "" });
      }
    } else {
      const childCategories = categories.filter((c) =>
        c.category_path.trim().startsWith(fullPath.trim() + " >")
      );
      if (childCategories.length > 0) {
        toast.confirm(
          `"${fullPath}" is a group with ${childCategories.length} items. Add all of them to the queue?`,
          () => {
            setSelectedCategories((prev) => {
              const newSet = new Set(prev);
              childCategories.forEach((child) => newSet.add(child.id));
              return newSet;
            });
            toast.success(
              `Added ${childCategories.length} categories to queue`
            );
            setLevelSelections({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" });
            setLevelSearchQueries({ 1: "", 2: "", 3: "" });
          },
          { confirmText: "Add All", cancelText: "Cancel" }
        );
      } else {
        toast.error("No valid categories found for this selection.");
      }
    }
  };

  const handleLevelChange = (level: number, id: string) => {
    if (autoResetTimerRef.current) {
      clearTimeout(autoResetTimerRef.current);
      autoResetTimerRef.current = null;
    }
    const newSelections = { ...levelSelections, [level]: id };
    if (level < 3) {
      for (let i = level + 1; i <= 6; i++) newSelections[i] = "";
    }
    setLevelSelections(newSelections);
  };

  const handleLevel3SelectWithAutoReset = (fullPath: string) => {
    handleAddToJobSpecific(fullPath);
    if (autoResetTimerRef.current) clearTimeout(autoResetTimerRef.current);
    autoResetTimerRef.current = setTimeout(() => {
      setOpenDropdown(null);
      setLevelSelections({ 1: "", 2: "", 3: "", 4: "", 5: "", 6: "" });
      setLevelSearchQueries({ 1: "", 2: "", 3: "" });
      toast.info("Filters auto-reset due to inactivity");
      autoResetTimerRef.current = null;
    }, 3000);
  };

  const toggleSelectAllForCategory = (
    categoryId: string,
    facetsInCategory: RecommendedFacet[]
  ) => {
    setSelectedFacetsForExport((prev) => {
      const newSelections = { ...prev };
      const currentSelections = newSelections[categoryId] || new Set();
      const allFacetIdsInThisCategory = facetsInCategory.map((f) => f.id);
      if (currentSelections.size === allFacetIdsInThisCategory.length)
        newSelections[categoryId] = new Set();
      else newSelections[categoryId] = new Set(allFacetIdsInThisCategory);
      return newSelections;
    });
  };

  const totalSelectedForExport = Object.values(selectedFacetsForExport).reduce(
    (sum, set) => sum + set.size,
    0
  );

  //   const loadData = async () => {
  //     if (!user) return;
  //     const clientFilter =
  //       user.role === "super_admin" ? {} : { client_id: user.client_id };
  //     const [categoriesData, promptsData] = await Promise.all([
  //       supabase
  //         .from("categories")
  //         .select("*")
  //         .eq("is_visible", true)
  //         .match(clientFilter)
  //         .order("category_path"),
  //       supabase
  //         .from("prompt_templates")
  //         .select("*")
  //         .order("level")
  //         .eq("is_active", true)
  //         .order("execution_order"),
  //     ]);
  //     let basePrompts = (promptsData.data as PromptTemplate[]) || [];

  //     if (user.client_id) {
  //       const { data: overrides } = await supabase
  //         .from("prompt_versions")
  //         .select("*")
  //         .eq("client_id", user.client_id)
  //         .eq("is_active", true);

  //       if (overrides && overrides.length > 0) {
  //         basePrompts = basePrompts.map((base) => {
  //           const override = overrides.find(
  //             (o) => o.prompt_template_id === base.id
  //           );
  //           if (override) {
  //             return {
  //               ...base,
  //               template: override.template_content,
  //               metadata: override.metadata || base.metadata,
  //               current_version: override.version,
  //               is_override: true,
  //             };
  //           }
  //           return base;
  //         });
  //       }
  //     }
  //     const validPrompts=basePrompts.filter(p=>p.template && p.template.trim().length>0)
  //     const sortedPrompts = validPrompts.sort((a, b) => {
  //       const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
  //       const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
  //       const finalIndexA = indexA === -1 ? Infinity : indexA;
  //       const finalIndexB = indexB === -1 ? Infinity : indexB;
  //       return finalIndexA - finalIndexB;
  //     });
  //     setCategories((categoriesData.data as Category[]) || []);
  //     setPrompts(sortedPrompts);
  //     const targetPrompts = ["Industry Analysis", "Master Prompt"];
  //     const defaultSelectedIds = sortedPrompts
  //   .filter((p) => targetPrompts.includes(p.name))
  //   .map((p) => p.id);
  // setSelectedPrompts(new Set(defaultSelectedIds));
  //   };
  const loadData = async () => {
    if (!user) return;

    // PRODUCTION FIX: Handle Super Admin impersonation context
    // Use selectedClientId if Super Admin, otherwise user's own client_id
    const activeClientId =
      user.role === "super_admin"
        ? (window as any).selectedClientId
        : user.client_id;
    const clientFilter =
      user.role === "super_admin" ? {} : { client_id: user.client_id };

    const [categoriesData, promptsData] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("is_visible", true)
        .match(clientFilter)
        .order("category_path"),
      supabase.from("prompt_templates").select("*").eq("is_active", true),
    ]);

    let basePrompts = (promptsData.data as PromptTemplate[]) || [];

    // Apply Overrides using activeClientId
    if (activeClientId) {
      const { data: overrides } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("client_id", activeClientId)
        .eq("is_active", true);

      if (overrides && overrides.length > 0) {
        basePrompts = basePrompts.map((base) => {
          const override = overrides.find(
            (o) => o.prompt_template_id === base.id
          );
          return override
            ? {
                ...base,
                template: override.template_content,
                metadata: override.metadata || base.metadata,
                current_version: override.version,
                is_override: true,
              }
            : base;
        });
      }
    }

    const validPrompts = basePrompts.filter((p) => {
      const hasTemplate = p.template && p.template.trim().length > 0;
      if (p.name === "Industry Analysis") {
        const levels = (p.metadata as any)?.industry_levels;
        return hasTemplate && levels && Object.keys(levels).length > 0;
      }
      return hasTemplate;
    });

    const sortedPrompts = validPrompts.sort((a, b) => {
      const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
      const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
      return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
    });

    setCategories((categoriesData.data as Category[]) || []);
    setPrompts(sortedPrompts);
    const allValidIds = sortedPrompts.map((p) => p.id);
    // setSelectedPrompts(new Set(sortedPrompts.filter(p => ["Industry Analysis", "Master Prompt"].includes(p.name)).map(p => p.id)));
    setSelectedPrompts(new Set(allValidIds));
  };
  const toggleCategory = (id: string) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedCategories(newSelected);
  };

  const toggleCategoryFromGlobalSearch = (categoryId: string) => {
    setSelectedCategories((prevSelected) => {
      const newSelected = new Set(prevSelected);
      const wasSelected = newSelected.has(categoryId);
      if (wasSelected) newSelected.delete(categoryId);
      else newSelected.add(categoryId);
      const cat = categories.find((c) => c.id === categoryId);
      if (cat)
        toast.success(
          wasSelected ? `Removed: ${cat.name}` : `Added: ${cat.name}`
        );
      else toast.error(`Category not found: ${categoryId}`);
      return newSelected;
    });
  };

  const togglePrompt = (id: string) => {
    const newSelected = new Set(selectedPrompts);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedPrompts(newSelected);
  };

  const selectAllPrompts = () => {
    if (selectedPrompts.size === prompts.length && prompts.length > 0) {
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
    return recentJobs.find((job) => {
      const jobCatIds = (job.category_ids || []).sort().join(",");
      const jobPromptIds = (job.selected_prompts || []).sort().join(",");
      return (
        jobCatIds === currentCategoryIds && jobPromptIds === currentPromptIds
      );
    });
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
      const categoryIds = Object.keys(grouped);
      setActiveTab(categoryIds.length > 0 ? categoryIds[0] : "");
      toast.success("Loaded existing results successfully!");
    } catch (error: any) {
      console.error("Error loading existing:", error);
      toast.error("Failed to load existing results.");
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

    const csvRows = [
      "Input Taxonomy,End Category (C3),Filter Attributes,Possible Values,Filling Percentage (Approx.),Priority (High / Medium / Low),Confidence Score (1–10),# of available sources,Source URLs",
      ...facetsToExport.map((f) => {
        const categoryPath =
          categories.find((c) => c.id === f.category_id)?.category_path ||
          "N/A";
        const categoryName =
          categoryMap.get(f.category_id) || "Unknown Category";

        const inputTaxonomy =
          f["Input Taxonomy"] || f["A. Input Taxonomy"] || categoryPath;

        const endCategory =
          f["End Category (C3)"] || f["B. End Category (C3)"] || categoryName;

        const filterAttributes =
          f.facet_name ||
          f["Filter Attributes"] ||
          f["C. Filter Attributes"] ||
          "";

        const possibleValues =
          f.possible_values ||
          f["Possible Values"] ||
          f["D. Possible Values"] ||
          "";

        const fillingPercentage =
          f.filling_percentage ||
          f["Filling Percentage (Approx.)"] ||
          f["E. Filling Percentage (Approx.)"] ||
          0;

        const priority =
          f.priority ||
          f["Priority (High / Medium / Low)"] ||
          f["F. Priority (High / Medium / Low)"] ||
          "Medium";

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
          f.source_urls || f["Source URLs"] || f["I. Source URLs"] || "N/A";

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
      client_id: user?.client_id,
      category_ids: Array.from(selectedCategories),
      format: "csv",
      exported_by: user?.id,
    });
  };
  const handleAddToJobSpecific = (fullPath: string) => {
    const targetCategory = categories.find((c) =>
      c.category_path.trim().startsWith(fullPath.trim())
    );
    if (targetCategory) {
      toggleCategory(targetCategory.id);
      const isRemoving = selectedCategories.has(targetCategory.id);
      toast.success(isRemoving ? `Removed from queue` : `Added to queue`);
    }
  };

  const generateFacets = async (forceNew = false) => {
    const REQUIRED_PROMPT_NAMES = ["Industry Analysis", "Master Prompt"];
    const selectedPromptObjects = prompts.filter(
      (p) => selectedPrompts.has(p.id) && REQUIRED_PROMPT_NAMES.includes(p.name)
    );
    if (selectedPromptObjects.length === 0) {
      throw new Error(
        "Critical error: 'Industry Analysis' or 'Master Prompt' must be selected to proceed."
      );
    }

    if (selectedCategories.size === 0) return;
    if (!forceNew) {
      const duplicateJob = await checkForDuplicateJob();
      if (duplicateJob) {
        const date = new Date(duplicateJob.created_at).toLocaleDateString();
        toast.confirm(
          `Idenfical results found from ${date}.Load them to save credits?`,
          () => loadExistingResult(duplicateJob.id),
          {
            confirmText: "Load Existing (Free)",
            cancelText: "Generate New (Cost)",
            onCancel: () => generateFacets(true),
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

    setIsGenerating(true);
    setError(null);
    try {
      setValidationError(null);
      const REQUIRED_PROMPT_NAMES = ["Industry Analysis", "Master Prompt"];
      const selectedPromptObjects = prompts.filter(
        (p) =>
          selectedPrompts.has(p.id) && REQUIRED_PROMPT_NAMES.includes(p.name)
      );
      if (selectedPromptObjects.length === 0) {
        throw new Error(
          "Generation requires 'Industry Analysis' or 'Master Prompt' to be selected."
        );
      }
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
          if (!prompt) return null;
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
          return {
            id: prompt.id,
            name: prompt.name,
            content: prompt.template || "",
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
      if (responseData.facets_generated === 0) {
        setIsGenerating(false);
        setError(
          "The AI was unable to generate any facets. Please try again later!"
        );
        toast.error("Generation Failed: 0 facets produced.");
        await supabase
          .from("facet_generation_jobs")
          .update({ status: "failed" })
          .eq("id", job.id);
        return;
      }
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
        setColumnMapping({
          input_taxonomy:
            jobData.metadata.output_format.columns[0] || "A. Input Taxonomy",
          end_category:
            jobData.metadata.output_format.columns[1] || "B. End Category (C3)",
          facet_name:
            jobData.metadata.output_format.columns[2] || "C. Filter Attributes",
          possible_values:
            jobData.metadata.output_format.columns[3] || "D. Possible Values",
          filling_percentage:
            jobData.metadata.output_format.columns[4] ||
            "E. Filling Percentage (Approx.)",
          priority:
            jobData.metadata.output_format.columns[5] ||
            "F. Priority (High / Medium / Low)",
          confidence_score:
            jobData.metadata.output_format.columns[6] ||
            "G. Confidence Score (1–10)",
          num_sources:
            jobData.metadata.output_format.columns[7] ||
            "H. # of available sources",
          source_urls:
            jobData.metadata.output_format.columns[8] || "I. Source URLs",
        });
      }
      const grouped = fetchedFacets.reduce((acc, facet) => {
        const categoryId = facet.category_id;
        if (!acc[categoryId]) acc[categoryId] = [];
        acc[categoryId].push(facet);
        return acc;
      }, {} as { [categoryId: string]: RecommendedFacet[] });
      setGroupedFacets(grouped);
      const categoryIds = Object.keys(grouped);
      setActiveTab(categoryIds.length > 0 ? categoryIds[0] : "");

      await supabase
        .from("facet_generation_jobs")
        .update({
          status: "completed",
          progress: 100,
          processed_categories: selectedCategories.size,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      setSelectedCategories(new Set());
    } catch (error: any) {
      console.error("Error generating facets:", error);
      setError(`Failed to generate facets: ${error.message}`);
      if (jobId)
        await supabase
          .from("facet_generation_jobs")
          .update({ status: "failed" })
          .eq("id", jobId);
    } finally {
      setIsGenerating(false);
    }
  };

  if (generatedFacets.length > 0) {
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const totalSelected = Object.values(selectedFacetsForExport).reduce(
      (sum, set) => sum + set.size,
      0
    );
    const isAllSelected =
      generatedFacets.length > 0 && totalSelected === generatedFacets.length;

    const handleGlobalSelectAll = () => {
      if (isAllSelected) setSelectedFacetsForExport({});
      else {
        const allIdsMap: { [categoryId: string]: Set<string> } = {};
        generatedFacets.forEach((facet) => {
          if (!allIdsMap[facet.category_id])
            allIdsMap[facet.category_id] = new Set();
          allIdsMap[facet.category_id].add(facet.id);
        });
        setSelectedFacetsForExport(allIdsMap);
      }
    };

    const visibleFacets = groupedFacets[activeTab] || [];

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
            <div className="flex items-center gap-2 mr-4 border-r border-slate-200 pr-4">
              <input
                type="checkbox"
                id="global-select"
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                checked={isAllSelected}
                onChange={handleGlobalSelectAll}
              />
              <label
                htmlFor="global-select"
                className="text-sm font-medium text-slate-700 cursor-pointer select-none"
              >
                Select All
              </label>
              <button
                disabled={totalSelectedForExport === 0}
                onClick={exportFacets}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" /> Export{" "}
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

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-slate-50 border-b border-slate-200 px-6 pt-4 sticky top-0 z-10">
            <div className="flex gap-6 overflow-x-auto custom-scrollbar">
              {Object.keys(groupedFacets).map((catId) => (
                <button
                  key={catId}
                  onClick={() => setActiveTab(catId)}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === catId
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {categoryMap.get(catId) || "Unknown"} (
                  {groupedFacets[catId].length})
                </button>
              ))}
            </div>
          </div>

          {visibleFacets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 w-12 text-left">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={
                          (selectedFacetsForExport[activeTab]?.size || 0) ===
                          visibleFacets.length
                        }
                        onChange={() =>
                          toggleSelectAllForCategory(activeTab, visibleFacets)
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
                  {visibleFacets.map((facet) => (
                    <tr key={facet.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={(
                            selectedFacetsForExport[activeTab] || new Set()
                          ).has(facet.id)}
                          onChange={() =>
                            toggleFacetForExport(activeTab, facet.id)
                          }
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {facet["Input Taxonomy"] ||
                          facet["A. Input Taxonomy"] ||
                          categories.find((c) => c.id === activeTab)
                            ?.category_path ||
                          "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {facet["End Category (C3)"] ||
                          facet["B. End Category (C3)"] ||
                          categoryMap.get(activeTab) ||
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
                              facet["F. Priority (High / Medium / Low)"]) ===
                            "High"
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
                          facet["Source URLs"] ||
                          facet["I. Source URLs"] ||
                          "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              No facets found for this category.
            </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-600" /> Category Schema
            </h3>
            <button
              onClick={handleResetFilters}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Reset Filters
            </button>
          </div>
          <div className="relative mb-6" onClick={(e) => e.stopPropagation()}>
            <label className="text-[10px] font-bold text-blue-500 uppercase mb-1 block tracking-widest">
              {levelSelections[1]
                ? `Quick Find in ${levelSelections[1]}`
                : "Quick Find (Full Hierarchy)"}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search full hierarchy..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setIsGlobalSearchOpen(true);
                }}
                onFocus={() => setIsGlobalSearchOpen(true)}
              />
            </div>
            {isGlobalSearchOpen && (
              <div className="absolute z-[70] w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-2 animate-in fade-in slide-in-from-top-2">
                {globalSearchResults.length > 0 ? (
                  globalSearchResults.map((cat) => (
                    <div
                      key={cat.id}
                      className="p-3 hover:bg-blue-50 rounded-lg group border-b border-slate-50 last:border-0 transition-colors flex items-start gap-2"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-1 cursor-pointer"
                        checked={selectedCategories.has(cat.id)}
                        onChange={() => toggleCategoryFromGlobalSearch(cat.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-[10px] text-slate-400 group-hover:text-blue-400 transition-colors mb-0.5 cursor-pointer"
                          onClick={() => selectFromGlobal(cat)}
                        >
                          {cat.category_path.includes(" > ")
                            ? cat.category_path
                                .split(" > ")
                                .slice(0, -1)
                                .join(" / ")
                            : "Root"}
                        </div>
                        <div
                          className="text-sm font-bold text-slate-700 group-hover:text-blue-700 cursor-pointer"
                          onClick={() => selectFromGlobal(cat)}
                        >
                          {cat.name}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 italic">
                    No categories found
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mb-6">
            <div className="h-[1px] bg-slate-100 flex-1"></div>
            <span className="text-[10px] text-slate-300 font-bold uppercase">
              Or Find By Level
            </span>
            <div className="h-[1px] bg-slate-100 flex-1"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {[1, 2, 3].map((level) => {
              const levelCats = getLevelCategories(level);
              const isDisabled = level > 1 && !levelSelections[level - 1];
              const isExpanded = openDropdown === level;
              const selectedName = levelSelections[level];
              return (
                <div
                  key={level}
                  className="relative space-y-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Level {level}
                  </label>
                  <div
                    onClick={() =>
                      !isDisabled && setOpenDropdown(isExpanded ? null : level)
                    }
                    className={`w-full p-2 text-sm border rounded-lg flex justify-between items-center cursor-pointer transition-all ${
                      isDisabled
                        ? "bg-slate-50 border-slate-100 text-slate-300"
                        : "bg-white border-slate-200 hover:border-blue-400"
                    } ${
                      isExpanded ? "ring-2 ring-blue-500 border-blue-500" : ""
                    }`}
                  >
                    <span className="truncate">
                      {selectedName || "Select Category"}
                    </span>
                    <Filter
                      className={`w-3 h-3 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {isExpanded && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-1">
                      <div className="p-2 border-b border-slate-100 sticky top-0 bg-white rounded-t-lg">
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Type to search..."
                            value={levelSearchQueries[level]}
                            onChange={(e) =>
                              setLevelSearchQueries((prev) => ({
                                ...prev,
                                [level]: e.target.value,
                              }))
                            }
                            className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-100 rounded bg-slate-50 outline-none focus:bg-white focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {levelCats.length > 0 ? (
                          levelCats.map((cat) => {
                            const fullPathForThisOpt =
                              level === 1
                                ? cat.name
                                : level === 2
                                ? `${levelSelections[1]} > ${cat.name}`
                                : `${levelSelections[1]} > ${levelSelections[2]} > ${cat.name}`;
                            const actualDbRecord = categories.find((c) =>
                              c.category_path.startsWith(fullPathForThisOpt)
                            );
                            const isInQueue =
                              actualDbRecord &&
                              selectedCategories.has(actualDbRecord.id);
                            return (
                              <div
                                key={cat.id}
                                onClick={() => {
                                  if (level < 3) {
                                    handleLevelChange(level, cat.id);
                                    setOpenDropdown(null);
                                  } else {
                                    const fullPathForThisOpt = `${levelSelections[1]} > ${levelSelections[2]} > ${cat.name}`;
                                    handleLevel3SelectWithAutoReset(
                                      fullPathForThisOpt
                                    );
                                  }
                                }}
                                className={`px-3 py-2 text-xs rounded cursor-pointer flex items-center justify-between transition-colors ${
                                  selectedName === cat.id
                                    ? "bg-blue-50 text-blue-700 font-bold"
                                    : "hover:bg-slate-50 text-slate-700"
                                }`}
                              >
                                <span>{cat.name}</span>
                                {isInQueue && (
                                  <CheckSquare className="w-3 h-3 text-blue-600" />
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-3 py-4 text-xs text-slate-400 text-center italic">
                            No categories found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
          <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-tighter">
                  Processing Queue ({selectedCategories.size})
                </span>
              </div>
              {selectedCategories.size > 0 && (
                <button
                  onClick={handleClearQueue}
                  className="text-[10px] text-red-500 font-bold hover:underline uppercase"
                >
                  Clear Queue
                </button>
              )}
            </div>
            <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {selectedCategories.size > 0 ? (
                Array.from(selectedCategories).map((id) => {
                  const cat = categories.find((c) => c.id === id);
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-md group hover:border-blue-300 transition-colors"
                    >
                      <span className="text-[13px] text-slate-600 truncate flex-1 pr-2 font-medium">
                        {cat?.category_path || "Unknown Category"}
                      </span>
                      <button
                        onClick={() =>
                          confirmRemoveItem(id, cat?.category_path || "")
                        }
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Remove from queue"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="text-[12px] text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded-md">
                  No categories added to the job yet.
                </div>
              )}
            </div>
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
            {prompts.length > 0 ? (
              prompts.map((prompt) => (
                <div
                  key={prompt.id}
                  className="p-3 hover:bg-slate-50 rounded-lg transition-colors"
                >
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
                </div>
              ))
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-slate-100 rounded-x1">
                <Settings className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  No active prompt templates available
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      {error && (
        <div
          className="relative text-center bg-red-50 border border-red-200 text-sm text-red-700 px-10 py-3 rounded-lg mb-4 max-w-4xl mx-auto animate-in fade-in zoom-in duration-300"
          role="alert"
        >
          <strong className="font-bold">An error occurred: </strong>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-red-100 rounded-full transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4 text-red-400" />
          </button>
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
              <Settings className="w-5  h-5 animate-spin" />
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
