import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project } from '../types';

interface ProjectSetupProps {
  onProjectCreated: (project: Project) => void;
  currentProject: Project | null;
}

export default function ProjectSetup({ onProjectCreated, currentProject }: ProjectSetupProps) {
  const [projectName, setProjectName] = useState('');
  const [l1Category, setL1Category] = useState('');
  const [l2Category, setL2Category] = useState('');
  const [l3Category, setL3Category] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsCreating(true);

    try {
      const { data, error: insertError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          l1_category: l1Category,
          l2_category: l2Category || null,
          l3_category: l3Category || null,
          status: 'in_progress',
        })
        .select()
        .maybeSingle();

      if (insertError) throw insertError;
      if (!data) throw new Error('Failed to create project');

      onProjectCreated(data as Project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  if (currentProject) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center gap-2 px-6 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
          <FolderPlus className="w-5 h-5" />
          <span className="font-medium">Project created successfully</span>
        </div>
        <p className="mt-4 text-slate-600">
          Continue to Level 1 Meta Builder to begin analysis
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <FolderPlus className="w-12 h-12 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          Create New Project
        </h2>
        <p className="text-slate-600">
          Set up your category hierarchy to begin meta and facet analysis
        </p>
      </div>

      <form onSubmit={handleCreateProject} className="space-y-6">
        <div>
          <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 mb-2">
            Project Name
          </label>
          <input
            type="text"
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Marine Safety Equipment Analysis"
            required
          />
        </div>

        <div>
          <label htmlFor="l1Category" className="block text-sm font-medium text-slate-700 mb-2">
            Level 1 Category (Required)
          </label>
          <input
            type="text"
            id="l1Category"
            value={l1Category}
            onChange={(e) => setL1Category(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Marine Safety Equipment"
            required
          />
          <p className="mt-1 text-sm text-slate-500">
            Broad industry / department level
          </p>
        </div>

        <div>
          <label htmlFor="l2Category" className="block text-sm font-medium text-slate-700 mb-2">
            Level 2 Category (Optional)
          </label>
          <input
            type="text"
            id="l2Category"
            value={l2Category}
            onChange={(e) => setL2Category(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Personal Flotation"
          />
          <p className="mt-1 text-sm text-slate-500">
            Mid-level product family
          </p>
        </div>

        <div>
          <label htmlFor="l3Category" className="block text-sm font-medium text-slate-700 mb-2">
            Level 3 Category (Optional)
          </label>
          <input
            type="text"
            id="l3Category"
            value={l3Category}
            onChange={(e) => setL3Category(e.target.value)}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Life Jackets"
          />
          <p className="mt-1 text-sm text-slate-500">
            End-level purchasable category
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isCreating}
          className="w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isCreating ? 'Creating Project...' : 'Create Project & Continue'}
        </button>
      </form>
    </div>
  );
}
