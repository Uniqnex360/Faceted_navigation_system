import { useState } from 'react';
import { Upload, Download, CheckCircle, Plus, Trash2, Keyboard, FileUp, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function CategoryUpload() {
  const { user } = useAuth();
  const toast = useToast();
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'file' | 'manual'>('file');
  
  // File Upload State
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Manual Entry State
  const [manualRows, setManualRows] = useState([{ industry: '', path: '' }]);

  const REQUIRED_HEADERS = [
    "industry_name", "level-1", "level-2", "level-3", "level-4", "level-5", 
    "level-6", "breadcrumbs", "end_category"
  ];

  // --- MANUAL ENTRY FUNCTIONS ---
  const addManualRow = () => setManualRows([...manualRows, { industry: '', path: '' }]);
  
  const removeManualRow = (index: number) => {
    if (manualRows.length > 1) {
      setManualRows(manualRows.filter((_, i) => i !== index));
    }
  };

  const updateManualRow = (index: number, field: 'industry' | 'path', value: string) => {
    const newRows = [...manualRows];
    newRows[index][field] = value;
    setManualRows(newRows);
  };

  const handleManualSubmit = async () => {
    const validRows = manualRows.filter(r => r.industry.trim() && r.path.trim());
    if (validRows.length === 0) {
      toast.error("Please fill in at least one row with Industry and Breadcrumbs.");
      return;
    }

    setIsUploading(true);
    try {
      const categories = validRows.map(row => {
        const pathParts = row.path.split('>').map(p => p.trim());
        return {
          client_id: user?.client_id || user?.id,
          category_path: row.path.trim(),
          level: pathParts.length,
          name: pathParts[pathParts.length - 1],
          metadata: { industry: row.industry.trim(), source: 'manual_entry' }
        };
      });

      const { error } = await supabase.from('categories').insert(categories);
      if (error) throw error;

      toast.success(`Successfully saved ${categories.length} categories!`);
      setManualRows([{ industry: '', path: '' }]); 
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const name = selectedFile.name.toLowerCase();
      if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.txt')) {
        toast.error("Invalid file type. Please upload .csv, .xlsx, or .txt");
        return;
      }
      setFile(selectedFile);
    }
  };

  const processFileData = async (jsonData: any[]) => {
    if (jsonData.length === 0) throw new Error("The file is empty.");

    const fileHeaders = Object.keys(jsonData[0]).map(h => h.trim().toLowerCase());
    const missingHeaders = REQUIRED_HEADERS.filter(h => !fileHeaders.includes(h));

    if (missingHeaders.length > 0) {
      throw new Error(`Invalid Format. Missing columns: ${missingHeaders.join(", ")}`);
    }

    const categories = jsonData.map((row, index) => {
      const breadcrumbsKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'breadcrumbs') || 'breadcrumbs';
      const industryKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'industry_name') || 'industry_name';

      const path = String(row[breadcrumbsKey] || '').trim();
      const industry = String(row[industryKey] || '').trim();

      if (!path || !industry) return null;

      const pathParts = path.split('>').map(p => p.trim());
      return {
        client_id: user?.client_id || user?.id,
        category_path: path,
        level: pathParts.length,
        name: pathParts[pathParts.length - 1],
        metadata: { industry, source: file?.name, row_index: index + 2 }
      };
    }).filter(Boolean);

    if (categories.length === 0) throw new Error("No valid data found in the required columns.");
    const { error } = await supabase.from('categories').insert(categories);
    if (error) throw error;
    return categories.length;
  };

  const uploadCategories = async () => {
    if (!file || !user) return;
    setIsUploading(true);
    try {
      let data: any[] = [];
      if (file.name.endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        await new Promise((resolve, reject) => {
          Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => { data = r.data; resolve(null); }, error: reject });
        });
      }
      const count = await processFileData(data);
      toast.success(`Imported ${count} categories successfully!`);
      setFile(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    const headerRow = REQUIRED_HEADERS.join(",");
    const sampleRow = `Marine,Boat Care,Anodes,Anodes - Hull,,,,Boat Care > Anodes > Anodes - Hull,Anodes - Hull`;
    const blob = new Blob([`${headerRow}\n${sampleRow}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'required_template.csv';
    link.click();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Category Management</h2>
          <p className="text-slate-500 text-sm">Upload bulk files or enter data manually</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('file')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'file' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <FileUp className="w-4 h-4" /> File Upload
          </button>
          <button 
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'manual' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Keyboard className="w-4 h-4" /> Manual Entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {activeTab === 'file' ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
              <h3 className="text-lg font-semibold mb-4 text-slate-800">Import File</h3>
              <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-all mb-6">
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <span className="text-sm text-slate-600 font-medium">
                  {file ? file.name : "Click to select CSV, XLSX, or TXT"}
                </span>
                <input type="file" className="hidden" accept=".csv,.xlsx,.txt" onChange={handleFileChange} />
              </label>

              <button
                onClick={uploadCategories}
                disabled={!file || isUploading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading && <Loader className="w-4 h-4 animate-spin" />}
                {isUploading ? "Processing..." : "Start Import"}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-semibold text-slate-800">Manual Record Entry</h3>
                <button onClick={addManualRow} className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Add Row
                </button>
              </div>
              
              <div className="p-6 space-y-4 max-h-[450px] overflow-y-auto">
                {manualRows.map((row, index) => {
  // --- LIVE PREVIEW LOGIC ---
  const pathParts = row.path.split('>').map(p => p.trim()).filter(Boolean);
  const endCategory = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
  const levelCount = pathParts.length;

  return (
    <div key={index} className="p-4 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">
          Record #{index + 1}
        </span>
        <button 
          onClick={() => removeManualRow(index)}
          className="text-slate-300 hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Industry Name</label>
          <input 
            placeholder="e.g. Marine"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={row.industry}
            onChange={(e) => updateManualRow(index, 'industry', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Breadcrumb Path</label>
          <input 
            placeholder="L1 > L2 > L3"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            value={row.path}
            onChange={(e) => updateManualRow(index, 'path', e.target.value)}
          />
        </div>
      </div>

      {/* --- LIVE SYSTEM INTERPRETATION (The "Auto-Fields") --- */}
      {row.path.includes('>') && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-slate-50">
          <div className="bg-slate-50 p-2 rounded">
            <p className="text-[9px] text-slate-400 uppercase font-bold">End Category</p>
            <p className="text-xs font-medium text-blue-600 truncate">{endCategory || '---'}</p>
          </div>
          <div className="bg-slate-50 p-2 rounded">
            <p className="text-[9px] text-slate-400 uppercase font-bold">Total Levels</p>
            <p className="text-xs font-medium text-slate-700">{levelCount}</p>
          </div>
          <div className="col-span-2 bg-slate-50 p-2 rounded">
            <p className="text-[9px] text-slate-400 uppercase font-bold">Level Breakdown</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {pathParts.map((part, i) => (
                <span key={i} className="text-[10px] bg-white border border-slate-200 px-1 rounded text-slate-500">
                  L{i+1}: {part}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
})}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 text-right">
                <button 
                  onClick={handleManualSubmit}
                  disabled={isUploading}
                  className="w-full md:w-auto px-10 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                  {isUploading ? "Saving..." : "Save Categories"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" /> Validation Rules
            </h3>
            <div className="space-y-4 text-sm text-slate-300">
              <p>1. <strong>Path Format:</strong> Use the <code> {'>'} </code> symbol to separate levels (e.g., Electronics {'>'} Phones).</p>
              <p>2. <strong>Headers:</strong> Files must include all 9 required columns, even if some levels are empty.</p>
              <p>3. <strong>Industry:</strong> Every row must have an industry name for identification.</p>
              
              <button 
                onClick={downloadTemplate} 
                className="w-full mt-4 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 py-2 rounded-lg transition-colors text-white font-medium border border-white/10"
              >
                <Download className="w-4 h-4" /> Download Template
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}