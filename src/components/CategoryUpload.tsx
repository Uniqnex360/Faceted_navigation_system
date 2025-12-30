import { useState } from 'react';
import { Upload, Download, FileText, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function CategoryUpload() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: number; failed: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
    }
  };

  const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split('\n');
    return lines.map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  };

 const uploadCategories = async () => {
    if (!file || !user) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error("CSV file is empty or only contains a header.");
      }

      const headers = rows[0].map(h => h.toLowerCase()); // Normalize headers
      const dataRows = rows.slice(1);

      // --- START: NEW, ROBUST LOGIC ---
      // 1. Find the index of the 'breadcrumbs' column.
      const pathColumnIndex = headers.indexOf('breadcrumbs');
      
      if (pathColumnIndex === -1) {
        throw new Error("CSV must contain a 'breadcrumbs' column.");
      }
      
      const categories = dataRows.map(row => {
        // 2. Use the correct index to get the category path.
        const categoryPath = row[pathColumnIndex] || '';
        
        // This part of your logic is already correct
        const pathParts = categoryPath.split('>').map(p => p.trim());
        const level = pathParts.length;
        const name = pathParts[pathParts.length - 1] || '';

        return {
          client_id: user.client_id || user.id,
          category_path: categoryPath,
          level,
          name,
          metadata: {},
        };
      }).filter(cat => cat.name); // Filter out any rows that result in an empty name
      // --- END: NEW, ROBUST LOGIC ---

      let success = 0;
      let failed = 0;
      
      // The rest of the function (looping and inserting) is correct.
      for (const category of categories) {
        const { error } = await supabase
          .from('categories')
          .insert(category);

        if (error) {
          console.error("Failed to insert category:", category.name, error.message);
          failed++;
        } else {
          success++;
        }
      }

      setUploadResult({ success, failed });
      setFile(null);
    } catch (error: any) {
      console.error('Error uploading categories:', error);
      // Display the specific error to the user
      alert(`Upload failed: ${error.message}`);
      setUploadResult({ success: 0, failed: dataRows.length || 1 }); // Assume all failed
    } finally {
      setIsUploading(false);
    }
  };

const downloadTemplate = () => {
  const template = `industry_name,level-1,level-2,level-3,level-4,level-5,level-6,level-7,level-8,level-9,level-10,bread_crumbs,end_category
"Marine","Marine Electronics","Gps Chart Plotters","Chart Plotters - Multi Function","","","","","","","","Marine Electronics > Gps Chart Plotters > Chart Plotters - Multi Function","Chart Plotters - Multi Function"
"Hardware","Tools","Power Tools","Drills & Drivers","Cordless Pistol-Grip Drills","","","","","","","Power Tools > Drills & Drivers > Cordless Pistol-Grip Drills","Cordless Pistol-Grip Drills"
"Marine","Kayaks & Watersports","Sup Paddle Boards","Jobe & Red Paddle Sups At Best Prices","","","","","","","","Kayaks & Watersports > Sup Paddle Boards > Jobe & Red Paddle Sups At Best Prices","Jobe & Red Paddle Sups At Best Prices"
`;

  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'category-upload-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Upload Categories</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Upload CSV File</h3>

          <div className="mb-4">
            <label className="block w-full cursor-pointer">
              <div className="flex items-center justify-center w-full h-32 px-4 transition bg-white border-2 border-slate-300 border-dashed rounded-lg hover:border-blue-400">
                <div className="text-center">
                  {file ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <FileText className="w-6 h-6" />
                      <span className="font-medium">{file.name}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-600">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-slate-500 mt-1">CSV files only</p>
                    </>
                  )}
                </div>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          <button
            onClick={uploadCategories}
            disabled={!file || isUploading}
            className="w-full py-3 px-6 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isUploading ? 'Uploading...' : 'Upload Categories'}
          </button>

          {uploadResult && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Upload Complete</span>
              </div>
              <p className="text-sm text-slate-600">
                Successfully uploaded: {uploadResult.success} categories
                {uploadResult.failed > 0 && ` (${uploadResult.failed} failed)`}
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">CSV Format Requirements</h3>

          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium text-slate-900 mb-2">Required Columns:</h4>
              <ul className="list-disc list-inside text-slate-600 space-y-1">
                <li>Category Path (e.g., &quot;L1 &gt; L2 &gt; L3&quot;)</li>
                <li>Level (1-10)</li>
                <li>Description (optional)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-slate-900 mb-2">Example:</h4>
              <div className="bg-slate-50 p-3 rounded font-mono text-xs overflow-x-auto">
                Marine Safety Equipment &gt; Life Jackets,2,Category
              </div>
            </div>

            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
