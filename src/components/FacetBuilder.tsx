import { useState, useEffect } from 'react';
import { Filter, Loader, CheckCircle, ArrowUpDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Facet } from '../types';

interface FacetBuilderProps {
  project: Project;
  onComplete: () => void;
}

export default function FacetBuilder({ project, onComplete }: FacetBuilderProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExistingFacets();
  }, [project.id]);

  const loadExistingFacets = async () => {
    const { data } = await supabase
      .from('facets')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true });

    if (data && data.length > 0) {
      setFacets(data as Facet[]);
    }
  };

  const generateFacets = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-facets`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: project.id,
        }),
      });

      if (!response.ok) {
        throw new Error('Facet generation failed');
      }

      const result = await response.json();
      setFacets(result.facets);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate facets');
    } finally {
      setIsGenerating(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-700';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-700';
      case 'Low':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  if (facets.length > 0) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            Facet Generation Complete
          </h2>
          <p className="text-slate-600">
            {facets.length} filters generated for {project.l3_category || project.l2_category || project.l1_category}
          </p>
        </div>

        <div className="bg-slate-50 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ArrowUpDown className="w-4 h-4" />
            <span>Sorted by: Priority (High → Medium → Low), then Confidence Score (10 → 1)</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse bg-white rounded-lg overflow-hidden">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">#</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Filter Attribute</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Possible Values</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Filling %</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Priority</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Confidence</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Sources</th>
              </tr>
            </thead>
            <tbody>
              {facets.map((facet, idx) => (
                <tr key={facet.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">
                    {facet.filter_attribute}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                    {facet.possible_values}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {facet.filling_percentage}%
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(facet.priority)}`}>
                      {facet.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {facet.confidence_score}/10
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {facet.num_sources}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={onComplete}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue to Export
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <Filter className="w-12 h-12 text-blue-600 mx-auto mb-4" />
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Facet Builder
      </h2>
      <p className="text-slate-600 mb-8">
        Generate comprehensive filter recommendations (15-20 filters) for: <strong>
          {project.l3_category || project.l2_category || project.l1_category}
        </strong>
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={generateFacets}
        disabled={isGenerating}
        className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Generating Facets...
          </>
        ) : (
          <>
            <Filter className="w-5 h-5" />
            Generate Facets
          </>
        )}
      </button>
    </div>
  );
}
