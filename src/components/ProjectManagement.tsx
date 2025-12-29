import { useState, useEffect } from 'react';
import { FolderPlus, Trash2, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { FacetGenerationJob } from '../types';

export default function ProjectManagement() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<FacetGenerationJob[]>([]);
  const [projectName, setProjectName] = useState('');
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
                    <button className="p-1 text-blue-600 hover:bg-blue-50 rounded">
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
    </div>
  );
}
