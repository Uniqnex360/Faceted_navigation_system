import { useState, useEffect, useMemo } from "react"; // 1. Added useMemo
import { FolderPlus, Trash2, Eye, X, Download } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { FacetGenerationJob, RecommendedFacet } from "../types";
import { useToast } from "../contexts/ToastContext";

export default function ProjectManagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<FacetGenerationJob[]>([]);
  const [activeTab, setActiveTab] = useState<string>("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [projectName, setProjectName] = useState("");
  const [selectedFacetIds, setSelectedFacetIds] = useState<Set<string>>(
    new Set()
  );
  const [selectedProject, setSelectedProject] =
    useState<FacetGenerationJob | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [historicalFacets, setHistoricalFacets] = useState<RecommendedFacet[]>(
    []
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [columns, setColumns] = useState([
    "Input Taxonomy",
    "End Category (C3)",
    "Filter Attributes",
    "Possible Values",
    "Filling Percentage (Approx.)",
    "Priority (High / Medium / Low)",
    "Confidence Score (1–10)",
    "# of available sources",
    "Source URLs",
  ]);

  useEffect(() => {
    loadProjects();
  }, [user]);

  // 2. Define filteredFacets using useMemo so it updates when tabs change
  const filteredFacets = useMemo(() => {
    if (!activeTab) return [];
    return historicalFacets.filter((f: any) =>
      f.categories?.category_path?.startsWith(activeTab)
    );
  }, [historicalFacets, activeTab]);

  const viewProjectDetails = async (project: FacetGenerationJob) => {
    if (!project) return;
    setSelectedProject(project);
    setIsDetailModalOpen(true);
    setIsLoadingDetails(true);
    setHistoricalFacets([]);
    setSelectedFacetIds(new Set());

    if (
      project.metadata?.output_format?.columns &&
      Array.isArray(project.metadata.output_format.columns)
    ) {
      setColumns(project.metadata.output_format.columns);
    } else {
      setColumns([
        "Input Taxonomy",
        "End Category (C3)",
        "Filter Attributes",
        "Possible Values",
        "Filling Percentage (Approx.)",
        "Priority (High / Medium / Low)",
        "Confidence Score (1–10)",
        "# of available sources",
        "Source URLs",
      ]);
    }

    try {
      const { data: facetData, error: facetError } = await supabase
        .from("recommended_facets")
        .select("*, categories (name, category_path)")
        .eq("job_id", project.id)
        .order("sort_order");

      if (facetError) throw facetError;
      const facets = (facetData as any[]) || [];
      setHistoricalFacets(facets);
      const roots = Array.from(
        new Set(
          facets
            .map((f) => f.categories?.category_path?.split(" > ")[0])
            .filter(Boolean)
        )
      ).sort();
      setAvailableTabs(roots);
      if (roots.length > 0) setActiveTab(roots[0]);
    } catch (error) {
      console.error("Error loading project details:", error);
      toast.error("Failed to load project details");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const toggleFacetSelection = (id: string) => {
    const newSet = new Set(selectedFacetIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedFacetIds(newSet);
  };

  const toggleSelectAll = () => {
    const allFilteredSelected =
      filteredFacets.length > 0 &&
      filteredFacets.every((f: any) => selectedFacetIds.has(f.id));
    const newSet = new Set(selectedFacetIds);
    if (allFilteredSelected) {
      filteredFacets.forEach((f: any) => newSet.delete(f.id));
    } else {
      filteredFacets.forEach((f: any) => newSet.add(f.id));
    }
    setSelectedFacetIds(newSet);
  };

  const loadProjects = async () => {
    if (!user) return;

    const query = supabase
      .from("facet_generation_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (user.role !== "super_admin") {
      query.eq("client_id", user.client_id);
    }

    const { data: jobs, error } = await query;
    if (error) return;
    const allCategoryIds = Array.from(
      new Set((jobs || []).flatMap((j) => j.category_ids || []))
    );
    if (allCategoryIds.length > 0) {
      const { data: catData } = await supabase
        .from("categories")
        .select("id,name")
        .in("id", allCategoryIds);
      const mapping: Record<string, string> = {};
      catData?.forEach((c) => (mapping[c.id] = c.name));
      setCategoryMap(mapping);
    }
    setProjects((jobs as FacetGenerationJob[]) || []);
  };

  const createProject = async () => {
    if (!projectName.trim() || !user) return;

    setIsCreating(true);
    try {
      const { error } = await supabase.from("facet_generation_jobs").insert({
        client_id: user.client_id || user.id,
        project_name: projectName,
        category_ids: [],
        status: "pending",
        created_by: user.id,
      });

      if (error) throw error;

      setProjectName("");
      await loadProjects();
    } catch (err) {
      console.error("Error creating project:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteProject = async (projectToDelete: FacetGenerationJob) => {
    toast.confirm(`Are you sure? This action cannot be undone.`, async () => {
      const { error } = await supabase
        .from("facet_generation_jobs")
        .delete()
        .eq("id", projectToDelete.id);
      if (error) {
        console.error("Error deleting project", error);
        toast.error("Failed to delete project");
      } else {
        toast.success(`Project deleted successfully!`);
        await loadProjects();
      }
    });
  };

  const exportFacetsFromModal = () => {
    const dataToExport =
      selectedFacetIds.size > 0
        ? historicalFacets.filter((f: any) => selectedFacetIds.has(f.id))
        : historicalFacets;
    if (dataToExport.length === 0) return;

    const csvRows = [
      columns.join(","),
      ...dataToExport.map((f: any) => {
        const categoryPath = f.categories?.category_path || "N/A";
        const categoryName = f.categories?.name || "Unknown";

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

        const safe = (str: any) => `"${String(str || "").replace(/"/g, '""')}"`;

        return [
          safe(inputTaxonomy),
          safe(endCategory),
          safe(filterAttributes),
          safe(possibleValues),
          fillingPercentage,
          priority,
          confidenceScore,
          numSources,
          safe(sourceUrls),
        ].join(",");
      }),
    ];

    const csv = csvRows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
      selectedProject?.project_name || "project"
    }_facets_export.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(
      selectedFacetIds.size > 0
        ? "Exported selected facets"
        : "Exported all facets"
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "processing":
        return "bg-blue-100 text-blue-700";
      case "failed":
        return "bg-red-100 text-red-700";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Project Management
      </h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">
          Create New Project
        </h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={createProject}
            disabled={isCreating || !projectName.trim()}
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FolderPlus className="w-5 h-5" />
            Create Project
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Breadcrumbs
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Categories
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Progress
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Created
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-1 px-6 py-4">
                    {project.category_ids && project.category_ids.length > 0 ? (
                      project.category_ids.map((id, index) => (
                        <span
                          key={id}
                          className="flex items-center text-[11px] text-slate-500"
                        >
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {categoryMap[id] || "Loading..."}
                          </span>
                          {index < project.category_ids.length - 1 && (
                            <span className="mx-1 text-slate-300">/</span>
                          )}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        No categories linked!
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                      project.status
                    )}`}
                  >
                    {project.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {project.total_categories}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {project.progress}%
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {new Date(project.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => viewProjectDetails(project)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {user?.role === "super_admin" && (
                      <button
                        onClick={() => deleteProject(project)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-500"
                >
                  No projects yet. Create your first project to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isDetailModalOpen && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-[95vw] w-full max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {activeTab
                    ? activeTab
                    : selectedProject.category_ids &&
                      selectedProject.category_ids.length > 0
                    ? selectedProject.category_ids
                        .map((id) => categoryMap[id])
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(", ") +
                      (selectedProject.category_ids.length > 3
                        ? ` + ${selectedProject.category_ids.length - 3} more`
                        : "")
                    : selectedProject.project_name || "Untitled Project"}
                </h3>
                <p className="text-sm text-slate-500">
                  {selectedFacetIds.size > 0
                    ? `${selectedFacetIds.size} selected`
                    : `Showing ${filteredFacets.length} facets`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={exportFacetsFromModal}
                  disabled={historicalFacets.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {selectedFacetIds.size > 0
                    ? `Export Selected (${selectedFacetIds.size})`
                    : "Download CSV"}
                </button>
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-0 overflow-hidden flex-1 flex flex-col">
              {isLoadingDetails ? (
                <div className="text-center py-20">
                  <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-slate-500">Loading...</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto flex flex-col">
                  {availableTabs.length > 0 && (
                    <div className="px-6 pt-4 border-b border-slate-200 bg-white sticky top-0 z-20">
                      <div className="flex gap-6 overflow-x-auto">
                        {availableTabs.map((tab) => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                              activeTab === tab
                                ? "border-blue-600 text-blue-600"
                                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                            }`}
                          >
                            {tab}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredFacets.length > 0 ? (
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                          {/* 4. Added missing TD checkbox cell */}
                          <th className="px-4 py-3 w-10 border-b border-slate-200 bg-slate-50">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={
                                filteredFacets.length > 0 &&
                                filteredFacets.every((f: any) =>
                                  selectedFacetIds.has(f.id)
                                )
                              }
                              onChange={toggleSelectAll}
                            />
                          </th>
                          {columns.map((col, idx) => (
                            <th
                              key={idx}
                              className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap bg-slate-50"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {filteredFacets.map((facet: any) => {
                          const categoryPath =
                            facet.categories?.category_path || "N/A";
                          const categoryName =
                            facet.categories?.name || "Unknown";

                          return (
                            <tr key={facet.id} className="hover:bg-slate-50">
                              {/* 5. Added missing TD for checkbox */}
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={selectedFacetIds.has(facet.id)}
                                  onChange={() =>
                                    toggleFacetSelection(facet.id)
                                  }
                                />
                              </td>

                              <td
                                className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate"
                                title={categoryPath}
                              >
                                {facet["Input Taxonomy"] ||
                                  facet["A. Input Taxonomy"] ||
                                  categoryPath}
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-600">
                                {facet["End Category (C3)"] ||
                                  facet["B. End Category (C3)"] ||
                                  categoryName}
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                {facet.facet_name ||
                                  facet["Filter Attributes"] ||
                                  facet["C. Filter Attributes"] ||
                                  "N/A"}
                              </td>
                              <td
                                className="px-6 py-4 text-sm text-slate-600 max-w-md truncate"
                                title={facet.possible_values}
                              >
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
                                          facet[
                                            "Priority (High / Medium / Low)"
                                          ] ||
                                          facet[
                                            "F. Priority (High / Medium / Low)"
                                          ]) === "Medium"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-green-100 text-green-700"
                                  }`}
                                >
                                  {facet.priority ||
                                    facet["Priority (High / Medium / Low)"] ||
                                    facet[
                                      "F. Priority (High / Medium / Low)"
                                    ] ||
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
                              <td
                                className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate"
                                title={facet.source_urls}
                              >
                                {facet.source_urls ||
                                  facet["Source URLs"] ||
                                  facet["I. Source URLs"] ||
                                  "N/A"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-20">
                      <p className="text-slate-500">
                        No facets found for this category.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-6 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
