import { useState, useEffect } from "react";
import { FolderPlus, Trash2, Eye, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { FacetGenerationJob, RecommendedFacet } from "../types";
import { useToast } from "../contexts/ToastContext";

export default function ProjectManagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [projects, setProjects] = useState<FacetGenerationJob[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [projectName, setProjectName] = useState("");
  const [selectedProject, setSelectedProject] =
    useState<FacetGenerationJob | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [historicalFacets, setHistoricalFacets] = useState<RecommendedFacet[]>(
    []
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [user]);

  const viewProjectDetails = async (project: FacetGenerationJob) => {
  if (!project) return;
  setSelectedProject(project);
  setIsDetailModalOpen(true);
  setIsLoadingDetails(true);
  setHistoricalFacets([]);

  try {
    const { data: facetData, error: facetError } = await supabase
      .from("recommended_facets")
      .select("*, categories (name)")
      .eq("job_id", project.id)
      .order("sort_order");

    if (facetError) throw facetError;

    setHistoricalFacets((facetData as any[]) || []);
  } catch (error) {
    console.error("Error loading project details:", error);
  } finally {
    setIsLoadingDetails(false);
  }
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
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-xl font-semibold text-slate-900">
                {/* Project Details:{" "}
                {selectedProject.project_name || "Untitled Project"} */}
              </h3>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {isLoadingDetails ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">Loading project history...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Status
                      </p>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          selectedProject.status
                        )}`}
                      >
                        {selectedProject.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Created
                      </p>
                      <p className="text-slate-800">
                        {new Date(
                          selectedProject.created_at
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">
                      Generated Facet History
                    </h4>
                    {historicalFacets.length > 0 ? (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-slate-600">
                                Category
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-slate-600">
                                Facet Name
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-slate-600">
                                Priority
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {historicalFacets.map((facet) => (
                              <tr key={facet.id}>
                                <td className="px-4 py-2 text-sm text-slate-500">
                                  {facet.categories?.name || "N/A"}
                                </td>
                                <td className="px-4 py-2 text-sm font-medium text-slate-800">
                                  {facet.facet_name}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                                      facet.priority === "High"
                                        ? "bg-red-100 text-red-700"
                                        : facet.priority === "Medium"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-green-100 text-green-700"
                                    }`}
                                  >
                                    {facet.priority}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-lg">
                        <p className="text-slate-500">
                          No facets have been generated for this project yet.
                        </p>
                      </div>
                    )}
                  </div>
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
