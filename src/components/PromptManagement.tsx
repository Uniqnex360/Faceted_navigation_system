import { useState, useEffect } from "react";
import { Edit2, History, Star, Save, Plus, Copy, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PromptTemplate } from "../types";
import { geographyCountries } from "../utils/CountrySelector";
import { PROMPT_EXECUTION_ORDER } from "../utils/PromptOrder";
import { CountryTemplate } from "../types/index";
export default function PromptManagement() {
  const { user } = useAuth();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(
    null
  );
  const [editContent, setEditContent] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [promptVersions, setPromptVersions] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marineLevels, setMarineLevels] = useState<string[]>(Array(5).fill(""));
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    name: "",
    template: "",
    level: 1,
  });
  const [dynamicCountryTemplates, setDynamicCountryTemplates] = useState<
    CountryTemplate[]
  >([]);

  useEffect(() => {
    loadPrompts();
  }, [user]);

  const showHistory = async (prompt: PromptTemplate) => {
    if (!prompt) return;

    setSelectedPrompt(prompt); // Set the prompt we're looking at
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);

    try {
      // Fetch versions and the email of the user who edited it
      const { data, error } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("prompt_template_id", prompt.id)
        .order("version", { ascending: false }); // Show newest first

      if (error) throw error;

      setPromptVersions(data || []);
    } catch (err: any) {
      console.error("Error loading prompt history:", err);
      setError("Failed to load version history.");
    } finally {
      setIsLoadingHistory(false);
    }
  };
  const loadPrompts = async () => {
    if (!user) return;
    setError(null);

    const query = supabase.from("prompt_templates").select("*");

    if (user.role !== "admin") {
      query.or(`client_id.eq.${user.client_id},client_id.is.null`);
    }
    const { data, error: dbError } = await query;
    if (dbError) {
      console.error("Error loading prompts:", dbError);
      setError(`Failed to load prompts: ${dbError.message}`);
      setPrompts([]);
    } else {
      const loadedPrompts = (data as PromptTemplate[]) || [];

      const sortedPrompts = loadedPrompts.sort((a, b) => {
        const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
        const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
        const finalIndexA = indexA === -1 ? Infinity : indexA;
        const finalIndexB = indexB === -1 ? Infinity : indexB;
        return finalIndexA - finalIndexB;
      });
      setPrompts(sortedPrompts);
    }
  };

  const copyText = async (text: string, key: string) => {
    if (!text) {
      alert("There is no content to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
      alert("Failed to copy content to clipboard.");
    }
  };
  const createPrompt = async () => {
    if (!newPrompt.name.trim() || !newPrompt.template.trim()) {
      setError("Prompt name and template content are required.");
      return;
    }
    if (!user) return;

    setError(null);
    setIsSaving(true);
    try {
      const { error: insertError } = await supabase
        .from("prompt_templates")
        .insert({
          name: newPrompt.name,
          template: newPrompt.template,
          level: newPrompt.level,
          client_id: user.client_id,
          current_version: 1,
        });

      if (insertError) throw insertError;

      setIsCreateModalOpen(false);
      setNewPrompt({ name: "", template: "", level: 1 });
      await loadPrompts();
    } catch (error: any) {
      console.error("Error creating prompt:", error);
      setError(`Failed to create prompt: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  const editPrompt = (prompt: PromptTemplate) => {
    setDynamicCountryTemplates([]);
    setError(null);
    setSelectedPrompt(prompt);
    setEditContent(prompt.template);
    setChangeNotes("");
    setIsEditing(true);
    setMarineLevels(Array(5).fill(""));

    if (prompt.name === "Geography") {
      const initialTemplates =(prompt.metadata as any)?.country_templates || [];
       const templatesWithIds = initialTemplates.map((t: Omit<CountryTemplate, 'id'>) => ({
        ...t,
        id: Math.random().toString(36).substring(2, 9),
      }));
      setDynamicCountryTemplates(templatesWithIds);
       setEditContent(''); 
    } else if (prompt.name === "Industry Keywords") {
      const initialLevels = (prompt.metadata as any)?.marine_levels || [];
      const paddedLevels = Array(5)
        .fill("")
        .map((_, i) => initialLevels[i] || "");
      setMarineLevels(paddedLevels);
    }
  };
  const handleDynamicCountryTemplateChange = (
    id: string,
    newTemplate: string
  ) => {
    setDynamicCountryTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, template: newTemplate } : t))
    );
  };
  const handleMarineLevelChange = (index: number, value: string) => {
    const newLevels = [...marineLevels];
    newLevels[index] = value;
    setMarineLevels(newLevels);
  };
  const handleAddCountry = () => {
    // Find the first available country that hasn't been added yet
    const existingCountries = new Set(
      dynamicCountryTemplates.map((t) => t.country)
    );
    const nextCountry = geographyCountries.find(
      (c) => !existingCountries.has(c)
    );

    if (nextCountry) {
      setDynamicCountryTemplates((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          country: nextCountry,
          template: "",
        },
      ]);
    } else {
      alert("All available countries have been added.");
    }
  };

  const handleRemoveCountry = (id: string) => {
    setDynamicCountryTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCountryNameChange = (id: string, newCountry: string) => {
    setDynamicCountryTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, country: newCountry } : t))
    );
  };
  const savePromptVersion = async () => {
    if (!selectedPrompt || !user) return;
    setError(null);
    setIsSaving(true);
    try {
      const newVersion = (selectedPrompt.current_version || 1) + 1;

      let versionContent = editContent;
      if (selectedPrompt.name === "Geography") {
        const templatesForHistory = dynamicCountryTemplates.map(({ id, ...rest }) => rest);
        versionContent = JSON.stringify(templatesForHistory, null, 2);
      }

      await supabase.from("prompt_versions").insert({
        prompt_template_id: selectedPrompt.id,
        version: newVersion,
        template_content: versionContent,
        variables: selectedPrompt.variables,
        edited_by: user.id,
        change_notes: changeNotes,
        is_active: true,
      });

      await supabase
        .from("prompt_versions")
        .update({ is_active: false })
        .eq("prompt_template_id", selectedPrompt.id)
        .neq("version", newVersion);

      const templateUpdate: any = {
        template: editContent,
        current_version: newVersion,
        updated_at: new Date().toISOString(),
        metadata: selectedPrompt.metadata || {},
      };

      if (selectedPrompt.name === "Geography") {
        const templatesToSave = dynamicCountryTemplates.map(
          ({ id, ...rest }) => rest
        );

        templateUpdate.metadata.country_templates = templatesToSave;
        templateUpdate.template =
          "This prompt uses country-specific templates stored in metadata.";
      }

      if (selectedPrompt.name === "Industry Keywords") {
        templateUpdate.metadata.marine_levels = marineLevels.filter(
          (level) => level.trim() !== ""
        );
      }

      const { error: templateUpdateError } = await supabase
        .from("prompt_templates")
        .update(templateUpdate)
        .eq("id", selectedPrompt.id);
      if (templateUpdateError) throw templateUpdateError;

      setIsEditing(false);
      setSelectedPrompt(null);
      await loadPrompts();
    } catch (error: any) {
      console.error("Error saving prompt version:", error);
      setError(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  const toggleMasterTemplate = async (promptId: string, isMaster: boolean) => {
    if (!user) return;

    if (isMaster) {
      await supabase
        .from("master_templates")
        .delete()
        .eq("prompt_template_id", promptId);
    } else {
      await supabase.from("master_templates").insert({
        client_id: user.client_id || user.id,
        prompt_template_id: promptId,
        level_start: 2,
        level_end: 10,
        is_master: true,
      });
    }

    await loadPrompts();
  };

  const checkIsMaster = async (promptId: string): Promise<boolean> => {
    const { data } = await supabase
      .from("master_templates")
      .select("id")
      .eq("prompt_template_id", promptId)
      .maybeSingle();

    return !!data;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          Prompt Template Management
        </h2>
        {!isEditing && (
<button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Prompt
        </button>
        )}
        
      </div>
      {isEditing && selectedPrompt ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">
            Edit: {selectedPrompt.name}
          </h3>

          <div className="space-y-4">
            {selectedPrompt.name !== "Geography" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {selectedPrompt.name === "Industry Keywords"
                    ? "Level 1 Keywords"
                    : "Template Content"}
                </label>
                <div className="relative">
                  <button
                    onClick={() => copyText(editContent, "main-content")}
                    className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                  {copiedKey === "main-content" && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs rounded py-1 px-2">
                      Copied!
                    </span>
                  )}
                </div>

                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
              </div>
            )}

            {selectedPrompt.name === "Geography" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Country-Specific Templates
                </label>
                <div className="space-y-4">
                  {dynamicCountryTemplates.map((templateItem) => (
                    <div
                      key={templateItem.id}
                      className="bg-slate-50 p-4 rounded-lg border border-slate-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        {/* Country Selector Dropdown */}
                        <select
                          value={templateItem.country}
                          onChange={(e) =>
                            handleCountryNameChange(
                              templateItem.id,
                              e.target.value
                            )
                          }
                          className="font-medium text-slate-800 bg-white border border-slate-300 rounded-md px-3 py-1"
                        >
                          {/* Show all available countries plus the currently selected one */}
                          {geographyCountries.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRemoveCountry(templateItem.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={templateItem.template}
                        onChange={(e) =>
                          handleDynamicCountryTemplateChange(
                            templateItem.id,
                            e.target.value
                          )
                        }
                        rows={5}
                        placeholder={`Enter template content for ${templateItem.country}...`}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                      />
                    </div>
                  ))}

                  {/* Add New Country Button */}
                  <button
                    onClick={handleAddCountry}
                    className="w-full text-center py-3 border-2 border-dashed border-slate-300 text-slate-500 rounded-lg hover:bg-slate-50 hover:border-slate-400"
                  >
                    + Add Country Template
                  </button>
                </div>
              </div>
            )}

            {/* UI for Marine Keywords (Levels 2-6) */}
            {selectedPrompt.name === "Industry Keywords" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Sub-Level Keywords (Levels 2-6)
                </label>
                <div className="space-y-3">
                  {marineLevels.map((levelContent, index) => (
                    <div key={index}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Level {index + 2}
                      </label>
                      <div className="relative">
                        <button
                          onClick={() =>
                            copyText(levelContent, `level-${index + 2}`)
                          }
                          className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        {copiedKey === `level-${index + 2}` && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs rounded py-1 px-2">
                            Copied!
                          </span>
                        )}
                      </div>
                      <textarea
                        value={levelContent}
                        onChange={(e) =>
                          handleMarineLevelChange(index, e.target.value)
                        }
                        rows={2}
                        placeholder={`Enter keywords for level ${index + 2}...`}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Notes and Save Buttons */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Change Notes
              </label>
              <input
                type="text"
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="Describe what you changed..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={savePromptVersion}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save New Version"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  setSelectedPrompt(null);
                }}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          {error && (
            <div
              className="bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 rounded-lg mb-4"
              role="alert"
            >
              <strong className="font-bold">Error: </strong>
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Version
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Master Template
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {prompts.map((prompt) => (
                <tr key={prompt.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">
                    {prompt.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    Level {prompt.level}
                  </td>
                  {/* <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {prompt.type}
                    </span>
                  </td> */}
                  <td className="px-6 py-4 text-sm text-slate-600">
                    v{prompt.current_version || 1}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={async () => {
                        const isMaster = await checkIsMaster(prompt.id);
                        toggleMasterTemplate(prompt.id, isMaster);
                      }}
                      className="text-yellow-500 hover:text-yellow-600"
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => editPrompt(prompt)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => showHistory(prompt)}
                        className="p-1 text-slate-600 hover:bg-slate-50 rounded"
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-slate-900 mb-2">Version Control</h4>
        <p className="text-sm text-slate-600">
          All prompt edits are automatically versioned. The system uses the
          latest version for facet generation. Mark prompts with Level 2-10 as
          master templates for comprehensive facet building.
        </p>
      </div>
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-slate-200">
              <h3 className="text-xl font-semibold text-slate-900">
                Create New Prompt Template
              </h3>
            </div>
            <div className="p-6 space-y-4">
              {error && (
                <div
                  className="bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 rounded-lg"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Prompt Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., 'Technical Specifications'"
                  value={newPrompt.name}
                  onChange={(e) =>
                    setNewPrompt({ ...newPrompt, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Template Content (Level 1)
                </label>
                <textarea
                  rows={8}
                  placeholder="Enter the main prompt content here..."
                  value={newPrompt.template}
                  onChange={(e) =>
                    setNewPrompt({ ...newPrompt, template: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Level
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newPrompt.level}
                    onChange={(e) =>
                      setNewPrompt({
                        ...newPrompt,
                        level: parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setError(null);
                  setNewPrompt({ name: "", template: "", level: 1 });
                }}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={createPrompt}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Creating..." : "Create Prompt"}
              </button>
            </div>
          </div>
        </div>
      )}
      {isHistoryModalOpen && selectedPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">
                Version History: {selectedPrompt.name}
              </h3>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              {isLoadingHistory ? (
                <p className="text-center text-slate-500">Loading history...</p>
              ) : (
                <div className="space-y-6">
                  {promptVersions.map((version, index) => (
                    <div
                      key={version.id}
                      className="border border-slate-200 rounded-lg"
                    >
                      <div className="bg-slate-50 p-3 flex justify-between items-center text-sm border-b">
                        <div className="font-semibold">
                          Version {version.version}
                          {index === 0 && (
                            <span className="ml-2 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500">
                          <span className="font-medium">By:</span>{" "}
                          {version.users?.email || "Unknown User"} on{" "}
                          {new Date(version.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div>
                          <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-1">
                            Change Notes
                          </h4>
                          <p className="text-sm text-slate-700 italic">
                            {version.change_notes || "No notes provided."}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-1">
                            Template Content
                          </h4>
                          <pre className="bg-slate-100 p-3 rounded-md text-xs font-mono whitespace-pre-wrap overflow-x-auto">
                            {version.template_content}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                  {promptVersions.length === 0 && (
                    <p className="text-center text-slate-500">
                      No version history found.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-6 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
