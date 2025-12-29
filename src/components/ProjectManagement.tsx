import { useState, useEffect } from 'react';
import { FolderPlus, Trash2, Eye, X, Calendar, BarChart, Tag, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FacetGenerationJob } from '../types';

export default function ProjectManagement() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<FacetGenerationJob[]>([]);
  const [projectName, setProjectName] = useState('');
  const [selectedProject, setSelectedProject] = useState<FacetGenerationJob | null>(null);
const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [user]);

  const loadProjects = async () => {
    if (!user) return;

    const query = supabase
      .from('facet_generation_jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (user.role !== 'admin') {
      query.eq('client_id', user.client_id);
    }

    const { data } = await query;
    setProjects((data as FacetGenerationJob[]) || []);
  };

  const createProject = async () => {
    if (!projectName.trim() || !user) return;

    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('facet_generation_jobs')
        .insert({
          client_id: user.client_id || user.id,
          project_name: projectName,
          category_ids: [],
          status: 'pending',
          created_by: user.id,
        });

      if (error) throw error;

      setProjectName('');
      await loadProjects();
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    await supabase.from('facet_generation_jobs').delete().eq('id', id);
    await loadProjects();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700';
      case 'processing': return 'bg-blue-100 text-blue-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-yellow-100 text-yellow-700';
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Project Management</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">Create New Project</h3>
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
                Project Name
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
                <td className="px-6 py-4 text-sm font-medium text-slate-900">
                  {project.project_name || 'Untitled Project'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
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
                    <button  onClick={()=>{setSelectedProject(project);setIsDetailModalOpen(true)}}className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                  No projects yet. Create your first project to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {isDetailModalOpen && selectedProject && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h3 className="text-xl font-semibold text-slate-900">
          Project Details: {selectedProject.project_name}
        </h3>
        <button
          onClick={() => {
            setIsDetailModalOpen(false);
            setSelectedProject(null);
          }}
          className="p-2 hover:bg-slate-100 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="p-6">
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">Created At</span>
              </div>
              <p className="text-slate-900">
                {new Date(selectedProject.created_at).toLocaleString()}
              </p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <BarChart className="w-4 h-4" />
                <span className="text-sm font-medium">Status</span>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedProject.status)}`}>
                {selectedProject.status}
              </span>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <Tag className="w-4 h-4" />
                <span className="text-sm font-medium">Total Categories</span>
              </div>
              <p className="text-slate-900">{selectedProject.total_categories || 0}</p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-slate-600 mb-1">
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">Created By</span>
              </div>
              <p className="text-slate-900">{selectedProject.created_by || "N/A"}</p>
            </div>
          </div>
          
          {/* Progress */}
          <div>
            <h4 className="font-medium text-slate-900 mb-2">Progress</h4>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full" 
                style={{ width: `${selectedProject.progress || 0}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-sm text-slate-600">{selectedProject.progress || 0}% complete</span>
              <span className="text-sm text-slate-600">
                {(selectedProject.processed_items || 0)} / {(selectedProject.total_items || 0)} items
              </span>
            </div>
          </div>
          
          {/* Error Details if failed */}
          {selectedProject.status === 'failed' && selectedProject.error_message && (
            <div>
              <h4 className="font-medium text-red-700 mb-2">Error Details</h4>
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <p className="text-sm text-red-700">{selectedProject.error_message}</p>
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={() => {
                setIsDetailModalOpen(false);
                deleteProject(selectedProject.id);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Project
            </button>
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
