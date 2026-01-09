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

import { useEffect, useState, useMemo } from "react";
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
  List,
  Search,
  FileSpreadsheet,
  FileJson,
  FileText,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Category } from "../types/index.ts";

type SortField = "name" | "category_path" | "level" | "created_at";
type SortDirection = "asc" | "desc";

export default function CategoryUpload() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<"file" | "manual" | "all">("file");
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
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // All Categories Tab State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [filterLevel, setFilterLevel] = useState<number | "all">("all");
  const [filterVisibility, setFilterVisibility] = useState<
    "all" | "visible" | "hidden"
  >("all");
  const itemsPerPage = 15;

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
  useEffect(() => {
    const hasSelection = Object.values(selections).some((val) => val !== "");
    
    if (addingAtLevel !== null) return;

    if (hasSelection) {
      const timer = setTimeout(() => {
        setSelections({ 1: "", 2: "", 3: "" });
        toast.info("Selections cleared due to inactivity"); // Optional: Notify user
      },5000); 

      // 4. Cleanup function: Resets the timer every time 'selections' changes
      return () => clearTimeout(timer);
    }
  }, [selections, addingAtLevel]);
  // Filtered and sorted categories
  const processedCategories = useMemo(() => {
    let result = [...allCategories];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (cat) =>
          cat.name?.toLowerCase().includes(query) ||
          cat.category_path?.toLowerCase().includes(query) ||
          cat.metadata?.industry?.toLowerCase().includes(query)
      );
    }

    // Apply level filter
    if (filterLevel !== "all") {
      result = result.filter((cat) => cat.level === filterLevel);
    }

    // Apply visibility filter
    if (filterVisibility === "visible") {
      result = result.filter((cat) => cat.is_visible !== false);
    } else if (filterVisibility === "hidden") {
      result = result.filter((cat) => cat.is_visible === false);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === "created_at") {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else if (typeof aVal === "string") {
        aVal = aVal?.toLowerCase() || "";
        bVal = bVal?.toLowerCase() || "";
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    allCategories,
    searchQuery,
    sortField,
    sortDirection,
    filterLevel,
    filterVisibility,
  ]);

  // Pagination
  const totalPages = Math.ceil(processedCategories.length / itemsPerPage);
  const paginatedCategories = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return processedCategories.slice(start, start + itemsPerPage);
  }, [processedCategories, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterLevel, filterVisibility, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ChevronUp className="w-3 h-3 opacity-30" />;
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 text-blue-600" />
    ) : (
      <ChevronDown className="w-3 h-3 text-blue-600" />
    );
  };

  // Export Functions
  const prepareExportData = () => {
    return processedCategories.map((cat) => ({
      ID: cat.id,
      Name: cat.name || "",
      "Full Path": cat.category_path || "",
      Level: cat.level || 0,
      Industry: cat.metadata?.industry || "",
      Visible: cat.is_visible !== false ? "Yes" : "No",
      "Created At": cat.created_at
        ? new Date(cat.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "",
    }));
  };

  const exportToCSV = () => {
    setIsExporting(true);
    try {
      const data = prepareExportData();
      const csv = Papa.unparse(data);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      downloadFile(blob, "categories_export.csv");
      toast.success(`Exported ${data.length} categories to CSV`);
    } catch (err: any) {
      toast.error("Failed to export CSV: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToXLSX = () => {
    setIsExporting(true);
    try {
      const data = prepareExportData();
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();

      // Set column widths
      worksheet["!cols"] = [
        { wch: 36 }, // ID
        { wch: 25 }, // Name
        { wch: 50 }, // Full Path
        { wch: 8 }, // Level
        { wch: 20 }, // Industry
        { wch: 10 }, // Visible
        { wch: 22 }, // Created At
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, "Categories");
      const xlsxBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });
      const blob = new Blob([xlsxBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      downloadFile(blob, "categories_export.xlsx");
      toast.success(`Exported ${data.length} categories to Excel`);
    } catch (err: any) {
      toast.error("Failed to export Excel: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToJSON = () => {
    setIsExporting(true);
    try {
      const data = processedCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        category_path: cat.category_path,
        level: cat.level,
        is_visible: cat.is_visible,
        metadata: cat.metadata,
        created_at: cat.created_at,
      }));
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      downloadFile(blob, "categories_export.json");
      toast.success(`Exported ${data.length} categories to JSON`);
    } catch (err: any) {
      toast.error("Failed to export JSON: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fetchCats = async () => {
    if (!user) return;
    const clientFilter =
      user.role === "super_admin" ? {} : { client_id: user.client_id };

    const { data } = await supabase
      .from("categories")
      .select("*")
      .match(clientFilter)
      .order("created_at", { ascending: false });

    if (data) {
      setAllCategories(data);
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

  const toggleVisibilityFromTable = async (cat: Category) => {
    const newVisibility = cat.is_visible === false ? true : false;
    const action = newVisibility ? "restore" : "hide";

    try {
      const { error } = await supabase
        .from("categories")
        .update({ is_visible: newVisibility })
        .eq("id", cat.id);

      if (error) throw error;

      toast.success(`Category ${action}d successfully`);
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
      await fetchCats();
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
          await fetchCats();
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

  // Get unique levels for filter
  const uniqueLevels = useMemo(() => {
    const levels = new Set(allCategories.map((c) => c.level).filter(Boolean));
    return Array.from(levels).sort((a, b) => a - b);
  }, [allCategories]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Category Management
          </h2>
          <p className="text-slate-500 text-sm">
            Upload bulk files, enter manually, or view all categories
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
          <button
            onClick={() => setActiveTab("all")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "all"
                ? "bg-white shadow-sm text-blue-600"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <List className="w-4 h-4" /> All Categories
          </button>
        </div>
      </div>

      {/* ALL CATEGORIES TAB */}
      {activeTab === "all" ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
          {/* Header with Stats */}
          <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">
                  All Categories
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {processedCategories.length} of {allCategories.length}{" "}
                  categories
                  {searchQuery && ` matching "${searchQuery}"`}
                </p>
              </div>

              {/* Export Buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 mr-2">Export:</span>
                <button
                  onClick={exportToCSV}
                  disabled={isExporting || processedCategories.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-colors disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" /> CSV
                </button>
                <button
                  onClick={exportToXLSX}
                  disabled={isExporting || processedCategories.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button
                  onClick={exportToJSON}
                  disabled={isExporting || processedCategories.length === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold hover:bg-purple-100 transition-colors disabled:opacity-50"
                >
                  <FileJson className="w-3.5 h-3.5" /> JSON
                </button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, path, or industry..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>

              {/* Level Filter */}
              <select
                value={filterLevel}
                onChange={(e) =>
                  setFilterLevel(
                    e.target.value === "all" ? "all" : Number(e.target.value)
                  )
                }
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Levels</option>
                {uniqueLevels.map((level) => (
                  <option key={level} value={level}>
                    Level {level}
                  </option>
                ))}
              </select>

              {/* Visibility Filter */}
              <select
                value={filterVisibility}
                onChange={(e) =>
                  setFilterVisibility(
                    e.target.value as "all" | "visible" | "hidden"
                  )
                }
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">All Status</option>
                <option value="visible">Visible Only</option>
                <option value="hidden">Hidden Only</option>
              </select>

              {/* Refresh */}
              <button
                onClick={fetchCats}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-100 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th
                    onClick={() => handleSort("name")}
                    className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Name <SortIcon field="name" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("category_path")}
                    className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Full Path <SortIcon field="category_path" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("level")}
                    className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-1">
                      Level <SortIcon field="level" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Industry
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Status
                  </th>
                  <th
                    onClick={() => handleSort("created_at")}
                    className="px-6 py-3 text-left text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      Created <SortIcon field="created_at" />
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedCategories.length > 0 ? (
                  paginatedCategories.map((cat) => (
                    <tr
                      key={cat.id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {cat.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-md">
                        <div className="truncate" title={cat.category_path}>
                          {cat.category_path}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                          {cat.level}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {cat.metadata?.industry || "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {cat.is_visible !== false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                            <Eye className="w-3 h-3" /> Visible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">
                            <EyeOff className="w-3 h-3" /> Hidden
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {cat.created_at
                          ? new Date(cat.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )
                          : "-"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => toggleVisibilityFromTable(cat)}
                          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                            cat.is_visible !== false
                              ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                              : "text-blue-700 bg-blue-50 hover:bg-blue-100"
                          }`}
                        >
                          {cat.is_visible !== false ? "Hide" : "Restore"}
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-16 text-center text-slate-400 italic"
                    >
                      {searchQuery ||
                      filterLevel !== "all" ||
                      filterVisibility !== "all"
                        ? "No categories match your filters"
                        : "No categories found"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(
                  currentPage * itemsPerPage,
                  processedCategories.length
                )}{" "}
                of {processedCategories.length} results
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-4 py-2 text-sm font-medium">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* EXISTING FILE UPLOAD AND MANUAL ENTRY TABS */
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
                      const parentParts: string[] = [];
                      for (let i = 1; i < level; i++) {
                        if (selections[i]) parentParts.push(selections[i]);
                      }
                      const parentPath = parentParts.join(" > ");
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
                        className={`space-y-2 ${
                          isDisabled ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                            Level {level}
                          </label>
                          {!isDisabled && addingAtLevel !== level && (
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

                                const parentParts: string[] = [];
                                for (let i = 1; i < level; i++) {
                                  if (selections[i]) {
                                    parentParts.push(selections[i]);
                                  }
                                }
                                const parentPath = parentParts.join(" > ");

                                if (
                                  level > 1 &&
                                  parentParts.length !== level - 1
                                ) {
                                  toast.error(
                                    "Please select all parent levels first"
                                  );
                                  return;
                                }

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
                                    .select()
                                    .single();

                                if (error) {
                                  toast.error(error.message);
                                } else {
                                  toast.success(
                                    `"${newPath}" created successfully`
                                  );

                                  const nextSels = {
                                    ...selections,
                                    [level]: newValue.trim(),
                                  };
                                  setSelections(nextSels);
                                  setDbCategories((prev) => [
                                    ...prev,
                                    newCategory,
                                  ]);
                                  setAllCategories((prev) => [
                                    ...prev,
                                    newCategory,
                                  ]);
                                  setAddingAtLevel(null);
                                  setNewValue("");
                                  fetchCats();
                                }
                              }}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => {
                                setAddingAtLevel(null);
                                setNewValue("");
                              }}
                            >
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

            {/* ARCHIVE PANEL */}
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
                  <div className="max-h-64 overflow-y-auto">
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
                <CheckCircle className="w-5 h-5 text-blue-400" /> Validation
                Rules
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

            {/* Quick Stats */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 mb-4">
                Quick Stats
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">
                    Total Categories
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {allCategories.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Visible</span>
                  <span className="text-sm font-bold text-green-600">
                    {dbCategories.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Hidden</span>
                  <span className="text-sm font-bold text-amber-600">
                    {hiddenCategories.length}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">
                      Unique Levels
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      {uniqueLevels.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
