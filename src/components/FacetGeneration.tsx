import { useState, useEffect } from 'react';
import { Settings, CheckSquare, Square, Play, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Category, PromptTemplate, RecommendedFacet } from '../types';

interface FacetGenerationProps {
  onComplete: () => void;
}

export default function FacetGeneration({ onComplete }: FacetGenerationProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedPrompts, setSelectedPrompts] = useState<Set<string>>(new Set());
  const [projectName, setProjectName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFacets, setGeneratedFacets] = useState<RecommendedFacet[]>([]);
  const [groupedFacets, setGroupedFacets] = useState<{ [categoryId: string]: RecommendedFacet[] }>({});
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    const clientFilter = user.role === 'admin' ? {} : { client_id: user.client_id };

    const [categoriesData, promptsData] = await Promise.all([
      supabase.from('categories').select('*').match(clientFilter).order('category_path'),
      supabase.from('prompt_templates').select('*').order('level').order('execution_order'),
    ]);

    setCategories((categoriesData.data as Category[]) || []);
    setPrompts((promptsData.data as PromptTemplate[]) || []);
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
    } else {
      newSelected.add(id);
    }
    setSelectedPrompts(newSelected);
  };

  const selectAllCategories = () => {
    if (selectedCategories.size === categories.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(categories.map(c => c.id)));
    }
  };

  const selectAllPrompts = () => {
    if (selectedPrompts.size === prompts.length) {
      setSelectedPrompts(new Set());
    } else {
      setSelectedPrompts(new Set(prompts.map(p => p.id)));
    }
  };

  const generateFacets = async () => {
    if (!user || selectedCategories.size === 0) return;

    setIsGenerating(true);
    try {
      
      const { data: job, error: jobError } = await supabase
        .from('facet_generation_jobs')
        .insert({
          client_id: user.client_id || user.id,
          project_name: projectName,
          category_ids: Array.from(selectedCategories),
          selected_prompts: Array.from(selectedPrompts),
          status: 'processing',
          total_categories: selectedCategories.size,
          processed_categories: 0,
          created_by: user.id,
        })
        .select()
        .maybeSingle();

      if (jobError || !job) throw jobError;
      setJobId(job.id);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-facets-ai`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job_id: job.id,
          category_ids: Array.from(selectedCategories),
          prompt_ids: Array.from(selectedPrompts),
        }),
      });

      if (!response.ok) throw new Error('Generation failed');

      const { data: facets } = await supabase
        .from('recommended_facets')
        .select('*')
        .eq('job_id', job.id)
        .order('sort_order');
      const fetchedFacets = (facets as RecommendedFacet[]) || [];
       setGeneratedFacets(fetchedFacets); 
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
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
        .from('facet_generation_jobs')
        .update({
          status: 'completed',
          progress: 100,
          processed_categories: selectedCategories.size,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);
    } catch (error) {
      console.error('Error generating facets:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const exportFacets = async () => {
    if (!jobId) return;
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));
 const csvRows = [
    // Add "Category Name" to the header
    'Category Name,Facet Name,Possible Values,Priority,Confidence Score,Filling %',
    ...generatedFacets.map(f => {
      // Get the category name from the map
      const categoryName = categoryMap.get(f.category_id) || 'Unknown Category';
      // Escape commas and quotes in values
      const safeValues = `"${(f.possible_values || '').replace(/"/g, '""')}"`;
      const safeFacetName = `"${(f.facet_name || '').replace(/"/g, '""')}"`;
      
      return [
        `"${categoryName}"`,
        safeFacetName,
        safeValues,
        f.priority,
        f.confidence_score,
        f.filling_percentage
      ].join(',');
    })
  ];
    const { data: facets } = await supabase
      .from('recommended_facets')
      .select('*')
      .eq('job_id', jobId)
      .order('sort_order');

    if (!facets) return;

      const csv = csvRows.join('\n');


    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facets-${jobId}.csv`;
    link.click();

    await supabase.from('export_history').insert({
      client_id: user?.client_id || user?.id,
      job_id: jobId,
      category_ids: Array.from(selectedCategories),
      format: 'csv',
      exported_by: user?.id,
    });
  };

  if (generatedFacets.length > 0) {
      const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Generated Facets</h2>

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
                onClick={exportFacets}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
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
        {Object.entries(groupedFacets).map(([categoryId, facetsForCategory]) => (
          <div key={categoryId} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h4 className="text-lg font-semibold text-slate-900">
                {categoryMap.get(categoryId) || 'Unknown Category'}
              </h4>
              <p className="text-sm text-slate-600">{facetsForCategory.length} facets</p>
            </div>
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Facet Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Possible Values
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Confidence
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                    Filling %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {facetsForCategory.map((facet) => (
                  <tr key={facet.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {facet.facet_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-md truncate">
                      {facet.possible_values}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        facet.priority === 'High' ? 'bg-red-100 text-red-700' :
                        facet.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {facet.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {facet.confidence_score}/10
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {facet.filling_percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Generate Facets</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">
              Select Categories ({selectedCategories.size})
            </h3>
            <button
              onClick={selectAllCategories}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {selectedCategories.size === categories.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors text-left"
              >
                {selectedCategories.has(category.id) ? (
                  <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {category.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {category.category_path}
                  </p>
                </div>
              </button>
            ))}
            {categories.length === 0 && (
              <p className="text-center text-slate-500 py-8">
                No categories available. Upload categories first.
              </p>
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
              {selectedPrompts.size === prompts.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto space-y-2">
            {prompts.map((prompt) => (
              <button
                key={prompt.id}
                onClick={() => togglePrompt(prompt.id)}
                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors text-left"
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
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={generateFacets}
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
