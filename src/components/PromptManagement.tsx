import { useState, useEffect } from "react";
import { Edit2, History, Star, Save } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PromptTemplate } from "../types";

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
  const geographyCountries = ["US", "UK", "AUS", "Ireland", "General European"];
  const [countryTemplates, setCountryTemplates] = useState<{
    [key: string]: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [marineLevels, setMarineLevels] = useState<string[]>(Array(5).fill(""));

  useEffect(() => {
    loadPrompts();
  }, [user]);

  const loadPrompts = async () => {
    if (!user) return;
    setError(null); // Clear previous errors on load

    const query = supabase
      .from("prompt_templates")
      .select("*")
      .order("level", { ascending: true })
      .order("execution_order", { ascending: true });

    if (user.role !== "admin") {
      query.or(`client_id.eq.${user.client_id},client_id.is.null`);
    }

    // Use the error object returned by Supabase
    const { data, error: dbError } = await query;

    if (dbError) {
      console.error("Error loading prompts:", dbError);
      setError(`Failed to load prompts: ${dbError.message}`);
      setPrompts([]); // Clear data on error
    } else {
      setPrompts((data as PromptTemplate[]) || []);
    }
  };

  // Replace the existing editPrompt function with this
  const editPrompt = (prompt: PromptTemplate) => {
    setError(null);
    setSelectedPrompt(prompt);
    setEditContent(prompt.template);
    setChangeNotes("");
    setIsEditing(true);

    // Reset all specific states first
    setCountryTemplates({});
    setMarineLevels(Array(5).fill(""));

    // Load specific data based on prompt name
    if (prompt.name === "Geography") {
      // Load country templates from metadata, defaulting to an empty object
      const initialTemplates =
        (prompt.metadata as any)?.country_templates || {};
      // Ensure an entry exists for every possible country to render all textareas
      const fullTemplates = geographyCountries.reduce((acc, country) => {
        acc[country] = initialTemplates[country] || "";
        return acc;
      }, {} as { [key: string]: string });
      setCountryTemplates(fullTemplates);
    } else if (prompt.name === "Industry Keywords - Marine") {
      const initialLevels = (prompt.metadata as any)?.marine_levels || [];
      const paddedLevels = Array(5)
        .fill("")
        .map((_, i) => initialLevels[i] || "");
      setMarineLevels(paddedLevels);
    }
  };
  const handleCountryTemplateChange = (country: string, value: string) => {
    setCountryTemplates((prev) => ({
      ...prev,
      [country]: value,
    }));
  };
  const handleMarineLevelChange = (index: number, value: string) => {
    const newLevels = [...marineLevels];
    newLevels[index] = value;
    setMarineLevels(newLevels);
  };
  const handleCountryChange = (country: string) => {
    setSelectedCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
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
        versionContent = JSON.stringify(countryTemplates, null, 2);
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

      // Prepare the update payload for the main template table
      const templateUpdate: any = {
        template: editContent,
        current_version: newVersion,
        updated_at: new Date().toISOString(),
        metadata: selectedPrompt.metadata || {},
      };

      if (selectedPrompt.name === "Geography") {
        // Filter out any countries with empty templates before saving
        const templatesToSave = Object.fromEntries(
          Object.entries(countryTemplates).filter(
            ([_, content]) => content.trim() !== ""
          )
        );
        templateUpdate.metadata.country_templates = templatesToSave;
        // Overwrite the main content with a placeholder
        templateUpdate.template =
          "This prompt uses country-specific templates stored in metadata.";
      }

      if (selectedPrompt.name === "Industry Keywords - Marine") {
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
      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Prompt Template Management
      </h2>

      {isEditing && selectedPrompt ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">
            Edit: {selectedPrompt.name}
          </h3>

          <div className="space-y-4">
            {selectedPrompt.name !== "Geography" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {selectedPrompt.name === "Industry Keywords - Marine"
                    ? "Level 1 Keywords"
                    : "Template Content"}
                </label>
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
                <div className="space-y-3">
                  {geographyCountries.map((country) => (
                    <div key={country}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {country}
                      </label>
                      <textarea
                        value={countryTemplates[country] || ""}
                        onChange={(e) =>
                          handleCountryTemplateChange(country, e.target.value)
                        }
                        rows={4}
                        placeholder={`Enter template content for ${country}...`}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* UI for Marine Keywords (Levels 2-6) */}
            {selectedPrompt.name === "Industry Keywords - Marine" && (
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
      <div className="bg-red-50 border border-red-200 text-sm text-red-700 px-4 py-3 rounded-lg mb-4" role="alert">
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
                  Type
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
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {prompt.type}
                    </span>
                  </td>
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
                      <button className="p-1 text-slate-600 hover:bg-slate-50 rounded">
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
    </div>
  );
}
