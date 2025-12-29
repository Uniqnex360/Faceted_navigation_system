import { useState, useEffect } from 'react';
import { Search, Loader, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, MetaLevel2 } from '../types';

interface Level2MetaBuilderProps {
  project: Project;
  onComplete: () => void;
}

export default function Level2MetaBuilder({ project, onComplete }: Level2MetaBuilderProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [metaData, setMetaData] = useState<MetaLevel2 | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadExistingMeta();
  }, [project.id]);

  const loadExistingMeta = async () => {
    const { data } = await supabase
      .from('meta_level2')
      .select('*')
      .eq('project_id', project.id)
      .maybeSingle();

    if (data) {
      setMetaData(data as MetaLevel2);
    }
  };

  const analyzeLevel2 = async () => {
    setIsAnalyzing(true);
    setError('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-level2`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: project.id,
          l1_category: project.l1_category,
          l2_category: project.l2_category,
        }),
      });

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const result = await response.json();
      setMetaData(result.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze category');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!project.l2_category) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-slate-600 mb-4">
          No Level 2 category specified for this project.
        </p>
        <button
          onClick={onComplete}
          className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Skip to Level 3
        </button>
      </div>
    );
  }

  if (metaData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">
            Level 2 Meta Analysis Complete
          </h2>
          <p className="text-slate-600">
            Category: {project.l1_category} &gt; {project.l2_category}
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 rounded-lg p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Meta Title Patterns</h3>
            <div className="flex flex-wrap gap-2">
              {metaData.meta_title_patterns.map((pattern, idx) => (
                <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  {pattern}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Meta Keywords</h3>
            <div className="flex flex-wrap gap-2">
              {metaData.meta_keywords.map((keyword, idx) => (
                <span key={idx} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Meta Description Themes</h3>
            <ul className="space-y-2">
              {metaData.meta_description_themes.map((theme, idx) => (
                <li key={idx} className="text-slate-700">• {theme}</li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-50 rounded-lg p-6">
            <h3 className="font-semibold text-slate-900 mb-3">Customer Intent Signals</h3>
            <ul className="space-y-2">
              {metaData.customer_intent_signals.map((signal, idx) => (
                <li key={idx} className="text-slate-700">• {signal}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={onComplete}
            className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue to Level 3
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto text-center">
      <Search className="w-12 h-12 text-blue-600 mx-auto mb-4" />
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Level 2 Meta Analysis
      </h2>
      <p className="text-slate-600 mb-8">
        Analyze mid-level product family SEO patterns for: <strong>{project.l1_category} &gt; {project.l2_category}</strong>
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={analyzeLevel2}
        disabled={isAnalyzing}
        className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isAnalyzing ? (
          <>
            <Loader className="w-5 h-5 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Search className="w-5 h-5" />
            Start Analysis
          </>
        )}
      </button>
    </div>
  );
}
