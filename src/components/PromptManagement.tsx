import { useState, useEffect } from "react";
import {
  Edit2,
  History,
  Star,
  Save,
  Plus,
  Copy,
  X,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PromptTemplate } from "../types";
import { geographyCountries } from "../utils/CountrySelector";
import { PROMPT_EXECUTION_ORDER } from "../utils/PromptOrder";
import { useToast } from "../contexts/ToastContext";

export default function PromptManagement() {
  const toast = useToast();

  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(
    null
  );
  const [isRestoring, setIsRestoring] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [industryLevels, setIndustryLevels] = useState<{
    [level: number]: string;
  }>({});
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [promptVersions, setPromptVersions] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [countryTemplates, setCountryTemplates] = useState<{
    [key: string]: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [marineLevels, setMarineLevels] = useState<string[]>(Array(5).fill(""));
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPrompt, setNewPrompt] = useState({
    name: "",
    template: "",
    level: 1,
  });

  useEffect(() => {
    loadPrompts();
  }, [user]);

  useEffect(() => {
    loadPrompts();
  }, [selectedClientId]);

  const showHistory = async (prompt: PromptTemplate) => {
    if (!prompt) return;

    setSelectedPrompt(prompt);
    setIsHistoryModalOpen(true);
    setIsLoadingHistory(true);

    try {
      const historyClientId = isSuperAdmin ? selectedClientId : user?.client_id;

      // 1. Try to fetch client-specific history first
      let { data: clientData, error: clientError } = await supabase
        .from("prompt_versions")
        .select(
          `id, version, template_content, change_notes, created_at, metadata, edited_by`
        )
        .eq("prompt_template_id", prompt.id)
        .eq("client_id", historyClientId) // Only fetch if this ID exists
        .order("version", { ascending: false });

      if (clientError) throw clientError;

      // 2. EDGE CASE: If no client-specific history exists AND we are in a client context
      if ((!clientData || clientData.length === 0) && historyClientId) {
        // Fallback: Fetch Global history instead
        const { data: globalData, error: globalError } = await supabase
          .from("prompt_versions")
          .select(
            `id, version, template_content, change_notes, created_at, metadata, edited_by`
          )
          .eq("prompt_template_id", prompt.id)
          .is("client_id", null) // Fetch the Master history
          .order("version", { ascending: false });

        if (globalError) throw globalError;
        setPromptVersions(globalData || []);
      } else {
        // Show the client-specific history we found
        setPromptVersions(clientData || []);
      }
    } catch (err: any) {
      console.error("History Error:", err);
      setError(err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  const loadPrompts = async () => {
    if (!user) return;
    setError(null);

    // 1. Fetch ALL base templates (Global)
    const { data: baseData, error: dbError } = await supabase
      .from("prompt_templates")
      .select("*")
      .eq("is_active", true);

    if (dbError) {
      setError(`Failed to load prompts: ${dbError.message}`);
      return;
    }

    // 2. Identify the Client ID
    // If Super Admin: use the dropdown selection
    // If Client: use their own assigned client_id
    const activeClientId = isSuperAdmin ? selectedClientId : user.client_id;

    let finalPrompts = [...(baseData || [])];

    // 3. APPLY OVERRIDES (This is the critical part for the client)
    if (activeClientId) {
      const { data: overrides } = await supabase
        .from("prompt_versions")
        .select("*")
        .eq("client_id", activeClientId)
        .eq("is_active", true);

      if (overrides && overrides.length > 0) {
        finalPrompts = finalPrompts.map((base) => {
          const override = overrides.find(
            (o) => o.prompt_template_id === base.id
          );
          if (override) {
            // The client now sees the custom content, but it looks like a standard prompt to them
            return {
              ...base,
              template: override.template_content,
              current_version: override.version,
              metadata: override.metadata || base.metadata,
              is_override: true,
            };
          }
          return base;
        });
      }
    }

    // Filter out any prompts that are strictly for other clients (if any)
    // and sort by execution order
    const filteredAndSorted = finalPrompts
      .filter((p) => !p.client_id || p.client_id === activeClientId)
      .sort((a, b) => {
        const indexA = PROMPT_EXECUTION_ORDER.indexOf(a.name);
        const indexB = PROMPT_EXECUTION_ORDER.indexOf(b.name);
        return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
      });

    setPrompts(filteredAndSorted);
  };
  const restoreVersion = (versionToRestore: any) => {
    if (!selectedPrompt || !user) return;
    toast.confirm(
      `Restore v${versionToRestore.version}? This creates a new version.`,
      async () => {
        setIsRestoring(true);
        try {
          const newVersionNumber = (selectedPrompt.current_version || 0) + 1;
          const metadataToRestore =
            versionToRestore.metadata || selectedPrompt.metadata || {};
          const { error: insertError } = await supabase
            .from("prompt_versions")
            .insert({
              prompt_template_id: selectedPrompt.id,
              version: newVersionNumber,
              template_content: versionToRestore.template_content,
              variables: versionToRestore.variables,
              edited_by: user.id,
              metadata: metadataToRestore,
              change_notes: `Restored from Version ${versionToRestore.version}`,
              is_active: true,
            });
          if (insertError) throw insertError;
          await supabase
            .from("prompt_versions")
            .update({ is_active: false })
            .eq("prompt_template_id", selectedPrompt.id)
            .neq("version", newVersionNumber);
          const { error: parentError } = await supabase
            .from("prompt_templates")
            .update({
              template: versionToRestore.template_content,
              current_version: newVersionNumber,
              metadata: metadataToRestore,
              updated_at: new Date().toISOString(),
            })
            .eq("id", selectedPrompt.id);
          if (parentError) throw parentError;
          toast.success(`Restored successfully as v${newVersionNumber}`);
          setIsHistoryModalOpen(false);
          await loadPrompts();
        } catch (error: any) {
          console.error("Error restoring version", error);
          toast.error(`Failed to restore ${error.message}`);
        } finally {
          setIsRestoring(false);
        }
      },
      { confirmText: "Yes,Restore", cancelText: "Cancel" }
    );
  };
  useEffect(() => {
    if (isSuperAdmin) {
      const fetchClients = async () => {
        const { data } = await supabase.from("clients").select("id, name");
        setClients(data || []);
      };
      fetchClients();
    }
  }, [isSuperAdmin]);
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
          type: newPrompt.type,
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
      toast.error("Prompt created successfully!");
      setError(`Failed to create prompt: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  const hasChanges = selectedPrompt
    ? (() => {
        if (editContent !== selectedPrompt.template) return true;
        if (selectedPrompt.name === "Industry Analysis") {
          const originalLevels =
            (selectedPrompt.metadata as any)?.industry_levels || {};
          return (
            JSON.stringify(industryLevels) !== JSON.stringify(originalLevels)
          );
        }
        return false;
      })()
    : false;
  const editPrompt = (prompt: PromptTemplate) => {
    setError(null);
    setSelectedPrompt(prompt);
    setEditContent(prompt.template);
    setChangeNotes("");
    setIsEditing(true);
    setIndustryLevels({});
    if (prompt.name === "Industry Analysis") {
      const levelsFromMetadata =
        (prompt.metadata as any)?.industry_levels || {};
      setIndustryLevels(levelsFromMetadata);
    }

    // setCountryTemplates({});
    setMarineLevels(Array(5).fill(""));

    // if (prompt.name === "Geography") {
    //   const initialTemplates =
    //     (prompt.metadata as any)?.country_templates || {};
    //   const fullTemplates = geographyCountries.reduce((acc, country) => {
    //     acc[country] = initialTemplates[country] || "";
    //     return acc;
    //   }, {} as { [key: string]: string });
    //   setCountryTemplates(fullTemplates);
    // } else
    // if (prompt.name === "Industry Keywords") {
    //   const initialLevels = (prompt.metadata as any)?.marine_levels || [];
    //   const paddedLevels = Array(5)
    //     .fill("")
    //     .map((_, i) => initialLevels[i] || "");
    //   setMarineLevels(paddedLevels);
    // }
  };
  const addIndustryLevel = () => {
    const currentLevels = Object.keys(industryLevels).map(Number);
    const nextLevel =
      currentLevels.length > 0 ? Math.max(...currentLevels) + 1 : 2;
    setIndustryLevels((prev) => ({
      ...prev,
      [nextLevel]: "",
    }));
  };
  const removeIndustryLevel = (level: number) => {
    setIndustryLevels((prev) => {
      const newLevels = { ...prev };
      delete newLevels[level];
      return newLevels;
    });
  };
  const handleIndustryLevelChange = (level: number, content: string) => {
    setIndustryLevels((prev) => ({
      ...prev,
      [level]: content,
    }));
  };
  const deletePrompt=async(promptId:string)=>{
    if(user?.role!=='super_admin')return 
    toast.confirm(`Are you sure you want to delete the prompt?.This action cannot be undone!`,
      async()=>{
        try {
          const {error:templateError}=await supabase.from('prompt_templates').delete().eq('id',promptId)
          if(templateError)
          {
            throw templateError
          }
          await supabase.from('prompt_verions').delete().eq('prompt_template_id',promptId)
          toast.success("Prompt has been deleted!")
          await loadPrompts()
        } catch (error:any) {
          console.error("Failed to delete the prompt",error)
          toast.error(`Delete failed :${error.message}`)
        }
      },
      {confirmText:"Delete",cancelText:"Cancel"}
    )
  }
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
  const savePromptVersion = async () => {
    if (!selectedPrompt || !user) return;
    setError(null);
    setIsSaving(true);

    // Determine if this is a Global save or a Client Override
    const targetClientId = isSuperAdmin ? selectedClientId : user.client_id;

    try {
      // Calculate version number based on context (Global vs Client)
      const { count } = await supabase
        .from("prompt_versions")
        .select("*", { count: "exact", head: true })
        .eq("prompt_template_id", selectedPrompt.id)
        .filter(
          "client_id",
          targetClientId ? "eq" : "is",
          targetClientId || null
        );

      const newVersion = (count || 0) + 1;
      let metadataToSave = { ...(selectedPrompt.metadata || {}) };

      if (selectedPrompt.name === "Industry Analysis") {
        metadataToSave.industry_levels = Object.fromEntries(
          Object.entries(industryLevels).filter(
            ([_, content]) => content.trim() !== ""
          )
        );
      }

      // 1. Deactivate current active version for this specific context
      const deactivateQuery = supabase
        .from("prompt_versions")
        .update({ is_active: false })
        .eq("prompt_template_id", selectedPrompt.id);

      if (targetClientId) deactivateQuery.eq("client_id", targetClientId);
      else deactivateQuery.is("client_id", null);

      await deactivateQuery;

      // 2. Insert new version
      const { error: versionError } = await supabase
        .from("prompt_versions")
        .insert({
          prompt_template_id: selectedPrompt.id,
          client_id: targetClientId, // This ties it to the client
          version: newVersion,
          template_content: editContent,
          variables: selectedPrompt.variables,
          metadata: metadataToSave,
          edited_by: user.id,
          change_notes: targetClientId
            ? `[Client Override] ${changeNotes}`
            : changeNotes,
          is_active: true,
        });

      if (versionError) throw versionError;

      // 3. Update main template ONLY if editing Global (null client)
      if (!targetClientId) {
        await supabase
          .from("prompt_templates")
          .update({
            template: editContent,
            current_version: newVersion,
            updated_at: new Date().toISOString(),
            metadata: metadataToSave,
          })
          .eq("id", selectedPrompt.id);
      }

      toast.success(
        targetClientId ? "Client override saved!" : "Global version saved!"
      );
      setIsEditing(false);
      setSelectedPrompt(null);
      await loadPrompts();
    } catch (error: any) {
      toast.error(`Save failed: ${error.message}`);
      setError(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };
  // const savePromptVersion = async () => {
  //   if (!selectedPrompt || !user) return;
  //   setError(null);
  //   setIsSaving(true);
  //   const targetClientId = isSuperAdmin ? selectedClientId : user.client_id;
  //   try {
  //     const { count } = await supabase
  //       .from("prompt_versions")
  //       .select("*", { count: "exact", head: true })
  //       .eq("prompt_template_id", selectedPrompt.id)
  //       .filter(
  //         "client_id",
  //         targetClientId ? "eq" : "is",
  //         targetClientId || null
  //       );

  //     const newVersion = (count || 0) + 1;

  //     let versionContent = editContent;
  //     // if (selectedPrompt.name === "Geography") {
  //     //   versionContent = JSON.stringify(countryTemplates, null, 2);
  //     // }
  //     let metadataToSave = { ...(selectedPrompt.metadata || {}) };
  //      if (selectedPrompt.name === "Industry Analysis") {
  //     metadataToSave.industry_levels = Object.fromEntries(
  //       Object.entries(industryLevels).filter(([_, content]) => content.trim() !== "")
  //     );
  //   }
  //     const deactivateQuery = supabase
  //     .from("prompt_versions")
  //     .update({ is_active: false })
  //     .eq("prompt_template_id", selectedPrompt.id);
  //     if (targetClientId) deactivateQuery.eq("client_id", targetClientId);
  //   else deactivateQuery.is("client_id", null);
  //   await deactivateQuery;
  //     await supabase.from("prompt_versions").insert({
  //       prompt_template_id: selectedPrompt.id,
  //       version: newVersion,
  //       template_content: versionContent,
  //       variables: selectedPrompt.variables,
  //       edited_by: user.id,
  //       change_notes: changeNotes,
  //       is_active: true,
  //     });

  //     await supabase
  //       .from("prompt_versions")
  //       .update({ is_active: false })
  //       .eq("prompt_template_id", selectedPrompt.id)
  //       .neq("version", newVersion);

  //     const templateUpdate: any = {
  //       template: editContent,
  //       current_version: newVersion,
  //       updated_at: new Date().toISOString(),
  //       metadata: selectedPrompt.metadata || {},
  //     };

  //     // if (selectedPrompt.name === "Geography") {
  //     //   const templatesToSave = Object.fromEntries(
  //     //     Object.entries(countryTemplates).filter(
  //     //       ([_, content]) => content.trim() !== ""
  //     //     )
  //     //   );
  //     //   templateUpdate.metadata.country_templates = templatesToSave;
  //     //   templateUpdate.template =
  //     //     "This prompt uses country-specific templates stored in metadata.";
  //     // }

  //     // if (selectedPrompt.name === "Industry Keywords") {
  //     //   templateUpdate.metadata.marine_levels = marineLevels.filter(
  //     //     (level) => level.trim() !== ""
  //     //   );
  //     // }
  //     if (selectedPrompt.name === "Industry Analysis") {
  //       // Only include non-empty levels
  //       const nonEmptyLevels = Object.fromEntries(
  //         Object.entries(industryLevels).filter(
  //           ([_, content]) => content.trim() !== ""
  //         )
  //       );
  //       metadataToSave.industry_levels = nonEmptyLevels;
  //     }
  //     const { error: versionError } = await supabase
  //       .from("prompt_versions")
  //       .insert({
  //         prompt_template_id: selectedPrompt.id,
  //         version: newVersion,
  //         template_content: versionContent,
  //         variables: selectedPrompt.variables,
  //         metadata: metadataToSave,
  //         edited_by: user.id,
  //         change_notes: changeNotes,
  //         is_active: true,
  //       });
  //     if (versionError) throw versionError;
  //     await supabase
  //       .from("prompt_versions")
  //       .update({ is_active: false })
  //       .eq("prompt_template_id", selectedPrompt.id)
  //       .neq("version", newVersion);

  //     const { error: templateUpdateError } = await supabase
  //       .from("prompt_templates")
  //       .update({
  //         template: versionContent,
  //         current_version: newVersion,
  //         updated_at: new Date().toISOString(),
  //         metadata: metadataToSave,
  //       })
  //       .eq("id", selectedPrompt.id);
  //     if (templateUpdateError) throw templateUpdateError;
  //     toast.success("New version saved successfully");
  //     setIsEditing(false);
  //     setSelectedPrompt(null);
  //     await loadPrompts();
  //   } catch (error: any) {
  //     toast.error(`Save failed: ${error.message}`);
  //     console.error("Error saving prompt version:", error);
  //     setError(`Save failed: ${error.message}`);
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };
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
        {!isEditing && isSuperAdmin && (
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
            {true && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {selectedPrompt.name === "Industry Analysis"
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

            {/* {selectedPrompt.name === "Geography" && (
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
                        <div className="relative">
                          <button
                            onClick={() =>
                              copyText(
                                countryTemplates[country] || "",
                                `country-${country}`
                              )
                            }
                            className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                          >
                            <Copy className="w-3 h-3" /> Copy
                          </button>
                          {copiedKey === `country-${country}` && (
                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs rounded py-1 px-2">
                              Copied!
                            </span>
                          )}
                        </div>
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
              )} */}

            {/* UI for Marine Keywords (Levels 2-6) */}
            {selectedPrompt.name === "Industry Analysis" && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-medium text-slate-700">
                    Sub-Level Templates
                  </label>
                  <button
                    onClick={addIndustryLevel}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm"
                  >
                    <Plus className="w-3 h-3" /> Add Level
                  </button>
                </div>

                {Object.keys(industryLevels).length === 0 && (
                  <p className="text-sm text-slate-500 italic mb-4">
                    No sub-levels defined. Click "Add Level" to create
                    additional processing levels.
                  </p>
                )}

                <div className="space-y-6">
                  {Object.entries(industryLevels).map(([level, content]) => (
                    <div
                      key={level}
                      className="border border-slate-200 rounded-lg p-4 relative"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <label className="block text-sm font-medium text-slate-700">
                          Level {level}
                        </label>
                        <button
                          onClick={() => removeIndustryLevel(Number(level))}
                          className="text-red-500 hover:text-red-700"
                          title="Remove this level"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="relative mb-1">
                        <button
                          onClick={() => copyText(content, `level-${level}`)}
                          className="text-xs inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                        >
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        {copiedKey === `level-${level}` && (
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-xs rounded py-1 px-2">
                            Copied!
                          </span>
                        )}
                      </div>

                      <textarea
                        value={content}
                        onChange={(e) =>
                          handleIndustryLevelChange(
                            Number(level),
                            e.target.value
                          )
                        }
                        rows={8}
                        placeholder={`Enter template for level ${level}...`}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />

                      {/* <div className="mt-2 text-xs text-slate-500">
              <p>You can use <code className="bg-slate-100 px-1 py-0.5 rounded">{"${previousLevelResult}"}</code> to reference results from previous levels.</p>
            </div> */}
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
              {hasChanges && (
                <button
                  onClick={savePromptVersion}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save New Version"}
                </button>
              )}

              <button
                onClick={() => {
                  setIsEditing(false);
                  setError(null);
                  setSelectedPrompt(null);
                }}
                className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {hasChanges ? "Cancel" : "Close"}
                {/* Changed text to 'Close' if no changes, just for better UX */}
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
          {isSuperAdmin && !isEditing && (
            <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-4">
              <label className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                Editing Context:
              </label>
              <select
                className="max-w-xs w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                value={selectedClientId || ""}
                onChange={(e) => setSelectedClientId(e.target.value || null)}
              >
                <option value="">Global (Master Templates)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {selectedClientId && (
                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
                  Active Override Mode
                </span>
              )}
            </div>
          )}
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
                  <td className="px-6 py-4 text-sm text-slate-600">
                    v{prompt.current_version || 1}
                  </td>

                  <td className="px-6 py-4">
                    <button
                      onClick={async () => {
                        const isMaster = await checkIsMaster(prompt.id);
                        toggleMasterTemplate(prompt.id, isMaster);
                      }}
                      disabled={!isSuperAdmin}
                      className="text-yellow-500 hover:text-yellow-600 disabled:text-slate-300 disabled:cursor-not-allowed"
                      title="Toggle Master Template"
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {isSuperAdmin && (
                        <button
                          onClick={() => editPrompt(prompt)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit Prompt"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => showHistory(prompt)}
                        className="p-1 text-slate-600 hover:bg-slate-50 rounded"
                        title="View History"
                      >
                        <History className="w-4 h-4" />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={()=>deletePrompt(prompt.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                         title={selectedClientId ? "Delete Client Override" : "Delete Global Prompt"}>
                          <Trash2 className='w-4 h-4'/>
                         </button>
                      )}
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
                   {promptVersions.length > 0 && (
        <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center gap-3 ${
          promptVersions[0].client_id 
            ? "bg-amber-50 border-amber-200 text-amber-800" 
            : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>
          <div className="p-2 bg-white rounded-md shadow-sm">
            <History className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {promptVersions[0].client_id ? "Custom Client History" : "Global Master History"}
            </p>
            <p className="text-xs opacity-80">
              {promptVersions[0].client_id 
                ? "This client is using a customized override of this prompt." 
                : "This client is currently using the global master template."}
            </p>
          </div>
        </div>
      )}
                  {promptVersions.map((version, index) => {
                    const isLatest = index === 0;
                    return (
                      <div
                        key={version.id}
                        className={`border rounded-lg transition-all ${
                          isLatest
                            ? "border-blue-300 ring-1 ring-blue-100"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="bg-slate-50 p-3 flex justify-between items-center text-sm border-b rounded-t-lg">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-900">
                              Version {version.version}
                            </span>
                            {isLatest ? (
                              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                                Current Active
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">
                                {new Date(
                                  version.created_at
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-slate-500 hidden sm:block">
                              <span className="font-medium">By:</span>{" "}
                              {version.users?.email || "Unknown"}
                            </div>

                            {/* RESTORE BUTTON - Only show if not the latest version */}
                            {!isLatest && isSuperAdmin && (
                              <button
                                onClick={() => restoreVersion(version)}
                                disabled={isRestoring}
                                className="flex items-center gap-1 text-xs font-medium bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 hover:text-blue-600 transition-colors shadow-sm"
                                title="Restore this version"
                              >
                                <RotateCcw className="w-3 h-3" />
                                {isRestoring ? "Restoring..." : "Restore"}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="p-4 space-y-3 bg-white rounded-b-lg">
                          <div>
                            <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-1">
                              Change Notes
                            </h4>
                            <p className="text-sm text-slate-600 italic">
                              {version.change_notes || "No notes provided."}
                            </p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-1 flex justify-between">
                              <span>Template Content</span>
                              <button
                                onClick={() =>
                                  copyText(
                                    version.template_content,
                                    `v-${version.version}`
                                  )
                                }
                                className="text-blue-600 hover:text-blue-800 normal-case font-normal flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </h4>
                            <div className="relative">
                              <pre className="bg-slate-50 border border-slate-100 p-3 rounded-md text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-60">
                                {version.template_content}
                              </pre>
                              {version.metadata?.industry_levels &&
                                Object.keys(version.metadata.industry_levels)
                                  .length > 0 && (
                                  <div className="mt-3 border-t border-slate-100 pt-3">
                                    <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wider mb-2">
                                      Included Sub-Levels
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                      {Object.keys(
                                        version.metadata.industry_levels
                                      ).map((lvl) => (
                                        <span
                                          key={lvl}
                                          className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200"
                                        >
                                          Level {lvl}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              {copiedKey === `v-${version.version}` && (
                                <span className="absolute top-2 right-2 bg-slate-800 text-white text-[10px] rounded py-0.5 px-1.5 opacity-90">
                                  Copied
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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
