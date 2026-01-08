function SearchableSelect({
    options,
    value,
    onChange,
    placeholder,
    disabled,
  }: {
    options: string[];
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
    disabled?: boolean;
  }) {
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const filtered = options.filter((opt) =>
      opt.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="relative w-full">
        <input
          disabled={disabled}
          type="text"
          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-40"
          placeholder={value || placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        />
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <div
                  key={opt}
                  className="px-4 py-2 text-sm hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => {
                    onChange(opt);
                    setSearch("");
                    setIsOpen(false);
                  }}
                >
                  {opt}
                </div>
              ))
            ) : (
              <div className="px-4 py-2 text-xs text-slate-400 italic">
                No results found
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
import { useEffect, useState } from "react";
import {
  Upload,
  Download,
  CheckCircle,
  Plus,
  Keyboard,
  FileUp,
  Loader,
  X,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Category } from "../types/index.ts";

export default function CategoryUpload() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"file" | "manual">("file");
  const [selections, setSelections] = useState<{ [key: number]: string }>({
    1: "",
    2: "",
    3: "",
  });
  const [addingAtLevel, setAddingAtLevel] = useState<number | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<Category[]>([]);
  const [showHiddenPanel, setShowHiddenPanel] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [dbCategories, setDbCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [manualRows, setManualRows] = useState([{ industry: "", path: "" }]);

  const REQUIRED_HEADERS = [
    "industry_name",
    "level-1",
    "level-2",
    "level-3",
    "level-4",
    "level-5",
    "level-6",
    "breadcrumbs",
    "end_category",
  ];

  const addManualRow = () =>
    setManualRows([...manualRows, { industry: "", path: "" }]);

  const removeManualRow = (index: number) => {
    if (manualRows.length > 1) {
      setManualRows(manualRows.filter((_, i) => i !== index));
    }
  };

  const updateManualRow = (
    index: number,
    field: "industry" | "path",
    value: string
  ) => {
    const newRows = [...manualRows];
    newRows[index][field] = value;
    setManualRows(newRows);
  };
  
  const handleManualSubmit = async () => {
    const validRows = manualRows.filter(
      (r) => r.industry.trim() && r.path.trim()
    );
    if (validRows.length === 0) {
      toast.error(
        "Please fill in at least one row with Industry and Breadcrumbs."
      );
      return;
    }

    setIsUploading(true);
    try {
      const categories = validRows.map((row) => {
        const pathParts = row.path.split(">").map((p) => p.trim());
        return {
          client_id: user?.client_id || user?.id,
          category_path: row.path.trim(),
          level: pathParts.length,
          name: pathParts[pathParts.length - 1],
          metadata: { industry: row.industry.trim(), source: "manual_entry" },
        };
      });

      const { error } = await supabase.from("categories").insert(categories);
      if (error) throw error;

      toast.success(`Successfully saved ${categories.length} categories!`);
      setManualRows([{ industry: "", path: "" }]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };
  const fetchCats = async () => {
    if (!user) return;
    const clientFilter =
      user.role === "super_admin" ? {} : { client_id: user.client_id };

    const { data } = await supabase
      .from("categories")
      .select("*")
      .match(clientFilter);

    if (data) {
      setDbCategories(data.filter((c) => c.is_visible !== false));
      setHiddenCategories(data.filter((c) => c.is_visible === false));
    }
  };
  const unhideCategory = async (cat: Category) => {
    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_visible: true })
        .eq("id", cat.id);

      if (error) throw error;

      toast.success(`Restored: ${cat.name}`);
      await fetchCats();
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  useEffect(() => {
    fetchCats();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const name = selectedFile.name.toLowerCase();
      if (
        !name.endsWith(".csv") &&
        !name.endsWith(".xlsx") &&
        !name.endsWith(".txt")
      ) {
        toast.error("Invalid file type. Please upload .csv, .xlsx, or .txt");
        return;
      }
      setFile(selectedFile);
    }
  };

  const processFileData = async (jsonData: any[]) => {
    if (jsonData.length === 0) throw new Error("The file is empty.");

    const fileHeaders = Object.keys(jsonData[0]).map((h) =>
      h.trim().toLowerCase()
    );
    const missingHeaders = REQUIRED_HEADERS.filter(
      (h) => !fileHeaders.includes(h)
    );

    if (missingHeaders.length > 0) {
      throw new Error(
        `Invalid Format. Missing columns: ${missingHeaders.join(", ")}`
      );
    }

    const categories = jsonData
      .map((row, index) => {
        const breadcrumbsKey =
          Object.keys(row).find(
            (k) => k.trim().toLowerCase() === "breadcrumbs"
          ) || "breadcrumbs";
        const industryKey =
          Object.keys(row).find(
            (k) => k.trim().toLowerCase() === "industry_name"
          ) || "industry_name";

        const path = String(row[breadcrumbsKey] || "").trim();
        const industry = String(row[industryKey] || "").trim();

        if (!path || !industry) return null;

        const pathParts = path.split(">").map((p) => p.trim());
        return {
          client_id: user?.client_id || user?.id,
          category_path: path,
          level: pathParts.length,
          name: pathParts[pathParts.length - 1],
          metadata: { industry, source: file?.name, row_index: index + 2 },
        };
      })
      .filter(Boolean);

    if (categories.length === 0)
      throw new Error("No valid data found in the required columns.");
    const { error } = await supabase.from("categories").insert(categories);
    if (error) throw error;
    return categories.length;
  };

  const uploadCategories = async () => {
    if (!file || !user) return;
    setIsUploading(true);
    try {
      let data: any[] = [];
      if (file.name.endsWith(".xlsx")) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        data = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]]
        );
      } else {
        await new Promise((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (r) => {
              data = r.data;
              resolve(null);
            },
            error: reject,
          });
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
  const toggleCategoryVisibility = async () => {
    const activeLevels = Object.values(selections).filter(Boolean);
    const fullPath = activeLevels.join(" > ");

    const targetCategory = dbCategories.find(
      (c) => c.category_path === fullPath
    );

    if (!targetCategory) {
      toast.error(
        "Please select a specific category from the dropdowns first."
      );
      return;
    }

    toast.confirm(
      `Hide "${targetCategory.name}"? It will be removed from all generation dropdowns.`,
      async () => {
        try {
          const { error } = await supabase
            .from("categories")
            .update({ is_visible: false })
            .eq("id", targetCategory.id);

          if (error) throw error;

          toast.success("Category hidden successfully");

          setDbCategories((prev) =>
            prev.filter((c) => c.id !== targetCategory.id)
          );
          setSelections({ 1: "", 2: "", 3: "" });
        } catch (err: any) {
          toast.error(err.message);
        }
      },
      {
        confirmText: "Hide Now",
        cancelText: "Keep Visible",
      }
    );
  };
  const downloadTemplate = () => {
    const headerRow = REQUIRED_HEADERS.join(",");
    const sampleRow = `Marine,Boat Care,Anodes,Anodes - Hull,,,,Boat Care > Anodes > Anodes - Hull,Anodes - Hull`;
    const blob = new Blob([`${headerRow}\n${sampleRow}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "required_template.csv";
    link.click();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Category Management
          </h2>
          <p className="text-slate-500 text-sm">
            Upload bulk files or enter data manually
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("file")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "file"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileUp className="w-4 h-4" /> File Upload
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "manual"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Keyboard className="w-4 h-4" /> Manual Entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {activeTab === "file" ? (
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
              <h3 className="text-lg font-semibold mb-4 text-slate-800">
                Import File
              </h3>
              <label className="flex flex-col items-center justify-center w-full h-56 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-blue-50 transition-all mb-6">
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <span className="text-sm text-slate-600 font-medium">
                  {file ? file.name : "Select CSV, XLSX, or TXT"}
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.txt"
                  onChange={handleFileChange}
                />
              </label>
              <button
                onClick={uploadCategories}
                disabled={!file || isUploading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <Loader className="animate-spin" />
                ) : (
                  "Start Import"
                )}
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-semibold text-slate-800">
                  Hierarchical Category Entry
                </h3>
                <p className="text-xs text-slate-500">
                  Select existing levels or add new ones using the (+) button
                </p>
              </div>
              <div className="p-8 space-y-8">
                {[1, 2, 3].map((level) => {
                  let options: string[] = [];
                  if (level === 1) {
                    options = Array.from(
                      new Set(
                        dbCategories.map((c) =>
                          c.category_path.split(" > ")[0]?.trim()
                        )
                      )
                    ).filter(Boolean);
                  } else {
                    const parentPath = Object.values(selections)
                      .slice(0, level - 1)
                      .join(" > ");
                    if (selections[level - 1]) {
                      options = Array.from(
                        new Set(
                          dbCategories
                            .filter((c) =>
                              c.category_path.startsWith(parentPath + " >")
                            )
                            .map((c) =>
                              c.category_path.split(" > ")[level - 1]?.trim()
                            )
                        )
                      ).filter(Boolean);
                    }
                  }
                  options.sort();
                  const isDisabled = level > 1 && !selections[level - 1];
                  return (
                    <div
                      key={level}
                      className={`space-y-2 ${isDisabled ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                          Level {level}
                        </label>
                        {!isDisabled && (
                          <button
                            onClick={() => setAddingAtLevel(level)}
                            className="p-1 hover:bg-blue-50 rounded-full text-blue-600"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {addingAtLevel === level ? (
                        <div className="flex gap-2 animate-in slide-in-from-left-2">
                          <input
                            autoFocus
                            placeholder={`Name...`}
                            className="flex-1 px-4 py-2 border rounded-lg text-sm outline-none"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                          />
                          <button
                            onClick={async () => {
                              if (!newValue.trim()) return;

                              const parentPath = Object.values(selections)
                                .slice(0, level - 1)
                                .join(" > ");
                              const newPath =
                                level === 1
                                  ? newValue.trim()
                                  : `${parentPath} > ${newValue.trim()}`;

                              const { data: newCategory, error } =
                                await supabase
                                  .from("categories")
                                  .insert({
                                    category_path: newPath,
                                    name: newValue.trim(),
                                    level,
                                    client_id: user?.client_id || user?.id,
                                    is_visible: true,
                                  })
                                  .select() // Add .select() to get the new data back immediately
                                  .single();

                              if (error) {
                                toast.error(error.message);
                              } else {
                                toast.success(
                                  `${newValue} created successfully`
                                );

                                // INTERCONNECTION STEP:
                                // 1. Update selections so the dropdown shows the item you just made
                                const nextSels = {
                                  ...selections,
                                  [level]: newValue.trim(),
                                };
                                setSelections(nextSels);

                                // 2. Immediately add the new category to the local state
                                // so Level 2/3 can see it without waiting for fetchCats()
                                setDbCategories((prev) => [
                                  ...prev,
                                  newCategory,
                                ]);

                                setAddingAtLevel(null);
                                setNewValue("");

                                // 3. Background refresh to keep everything 100% in sync
                                fetchCats();
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                          >
                            Create
                          </button>
                          <button onClick={() => setAddingAtLevel(null)}>
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>
                      ) : (
                        <SearchableSelect
                          disabled={isDisabled}
                          options={options}
                          value={selections[level]}
                          placeholder={`Search Level ${level}...`}
                          onChange={(val) => {
                            const nextSels = {
                              ...selections,
                              [level]: val,
                            };
                            for (let i = level + 1; i <= 3; i++)
                              nextSels[i] = "";
                            setSelections(nextSels);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              {selections[1] && (
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">
                    {Object.values(selections).filter(Boolean).join(" > ")}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={toggleCategoryVisibility}
                      className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <EyeOff className="w-3.5 h-3.5" /> Hide
                    </button>
                    <button
                      onClick={() => setSelections({ 1: "", 2: "", 3: "" })}
                      className="px-3 py-1.5 text-xs text-red-500 font-bold hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ARCHIVE PANEL - Outside the ternary so it's always available below the active tab */}
          <div className="mt-8">
            <div className="flex justify-center">
              <button
                onClick={() => setShowHiddenPanel(!showHiddenPanel)}
                className="text-xs font-bold text-slate-400 hover:text-blue-600 flex items-center gap-2 transition-colors"
              >
                <EyeOff className="w-4 h-4" />{" "}
                {showHiddenPanel
                  ? "Hide Archive"
                  : `View Hidden Categories (${hiddenCategories.length})`}
              </button>
            </div>
            {showHiddenPanel && (
              <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2">
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                    Archived Categories
                  </h3>
                </div>
                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                  {hiddenCategories.length > 0 ? (
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-slate-50">
                        {hiddenCategories.map((cat) => (
                          <tr key={cat.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-3 text-xs text-slate-600 truncate max-w-md">
                              {cat.category_path}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <button
                                onClick={() => unhideCategory(cat)}
                                className="text-blue-600 text-xs font-bold flex items-center gap-1 ml-auto"
                              >
                                <RefreshCw className="w-3 h-3" /> Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-400 italic text-sm">
                      No hidden categories found.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-400" /> Validation Rules
            </h3>
            <div className="space-y-4 text-sm text-slate-300">
              <p>
                1. <strong>Path Format:</strong> Use the <code> {">"} </code>{" "}
                symbol to separate levels (e.g., Electronics {">"} Phones).
              </p>
              <p>
                2. <strong>Headers:</strong> Files must include all 9 required
                columns, even if some levels are empty.
              </p>
              <p>
                3. <strong>Industry:</strong> Every row must have an industry
                name for identification.
              </p>

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
