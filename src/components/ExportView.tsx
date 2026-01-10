import { useState, useEffect } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Project, Facet } from '../types';

interface ExportViewProps {
  project: Project;
}

export default function ExportView({ project }: ExportViewProps) {
  const [facets, setFacets] = useState<Facet[]>([]);

  useEffect(() => {
    loadFacets();
  }, [project.id]);

  const loadFacets = async () => {
    const { data } = await supabase
      .from('facets')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true });

    if (data) {
      setFacets(data as Facet[]);
    }
  };

  const exportToCSV = () => {
    const taxonomy = [
      project.l1_category,
      project.l2_category,
      project.l3_category,
    ].filter(Boolean).join(' > ');

    const endCategory = project.l3_category || project.l2_category || project.l1_category;

    const headers = [
      'Input Taxonomy',
      'End Category',
      'Filter Attributes',
      'Possible Values',
      'Filling Percentage (Approx.)',
      'Priority (High / Medium / Low)',
      'Confidence Score (1-10)',
      '# of available sources',
      'Sources URLs',
    ];

    const rows = facets.map((facet) => [
      taxonomy,
      endCategory,
      facet.filter_attribute,
      facet.possible_values,
      `${facet.filling_percentage}%`,
      facet.priority,
      facet.confidence_score,
      facet.num_sources,
      facet.source_urls.join(', '),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell =>
          typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        ).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `facet-analysis-${project.name.replace(/\s+/g, '-').toLowerCase()}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = () => {
    const taxonomy = [
      project.l1_category,
      project.l2_category,
      project.l3_category,
    ].filter(Boolean).join(' > ');

    const endCategory = project.l3_category || project.l2_category || project.l1_category;

    const headers = [
      'Input Taxonomy',
      'End Category',
      'Filter Attributes',
      'Possible Values',
      'Filling Percentage (Approx.)',
      'Priority (High / Medium / Low)',
      'Confidence Score (1-10)',
      '# of available sources',
      'Sources URLs',
    ];

    const rows = facets.map((facet) => [
      taxonomy,
      endCategory,
      facet.filter_attribute,
      facet.possible_values,
      `${facet.filling_percentage}%`,
      facet.priority,
      facet.confidence_score,
      facet.num_sources,
      facet.source_urls.join(', '),
    ]);

    const tsvContent = [
      headers.join('\t'),
      ...rows.map(row => row.join('\t')),
    ].join('\n');

    navigator.clipboard.writeText(tsvContent).then(() => {
      alert('Data copied to clipboard! You can paste it directly into Excel.');
    });
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <FileSpreadsheet className="w-12 h-12 text-blue-600 mx-auto mb-4" />
      <h2 className="text-2xl font-semibold text-slate-900 mb-2">
        Export Results
      </h2>
      <p className="text-slate-600 mb-8">
        Download your facet analysis in Excel-compatible format
      </p>

      <div className="bg-slate-50 rounded-lg p-6 mb-8">
        <div className="grid grid-cols-2 gap-6 text-left">
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">Project</h3>
            <p className="text-slate-900">{project.name}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">Category Hierarchy</h3>
            <p className="text-slate-900">
              {project.l1_category}
              {project.l2_category && ` > ${project.l2_category}`}
              {project.l3_category && ` > ${project.l3_category}`}
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">Total Filters</h3>
            <p className="text-slate-900">{facets.length}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-1">High Priority Filters</h3>
            <p className="text-slate-900">
              {facets.filter(f => f.priority === 'High').length}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <button
          onClick={exportToCSV}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-5 h-5" />
          Download CSV
        </button>
        <button
          onClick={copyToClipboard}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors"
        >
          <FileSpreadsheet className="w-5 h-5" />
          Copy for Excel
        </button>
      </div>

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left">
        <h3 className="font-semibold text-slate-900 mb-2">Export Format</h3>
        <ul className="text-sm text-slate-700 space-y-1">
          <li>• CSV format compatible with Excel, Google Sheets, and other spreadsheet applications</li>
          <li>• Contains all 9 required columns as specified in the requirements</li>
          <li>• Filters sorted by Priority (High → Medium → Low) and Confidence Score</li>
          <li>• Ready for professional e-commerce implementation</li>
        </ul>
      </div>
    </div>
  );
}
