import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  LayoutDashboard,
  FolderOpen,
  Upload,
  Settings,
  LogOut,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
  Users,
  FileText,
  Building2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import ProjectManagement from "../components/ProjectManagement";
import PromptManagement from "../components/PromptManagement";
import FacetGeneration from "../components/FacetGeneration";
import ClientManagement from "../components/ClientManagement";
import CategoryUpload from "../components/CategoryUpload.tsx";

type View =
  | "dashboard"
  | "projects"
  | "upload"
  | "prompts"
  | "generate"
  | "clients";
interface Client {
  id: string;
  name: string;
  company_name: string;
}
interface DashboardStats {
  facets_recommended: number;
  jobs_in_progress: number;
  jobs_yet_to_start: number;
  pending_categories: number;
  downloads: number;
  total_projects: number;
  total_users?: number;
  total_active_clients?: number; 
  queue_count: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [client, setClient] = useState<Client | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    facets_recommended: 0,
    jobs_in_progress: 0,
    jobs_yet_to_start: 0,
    pending_categories: 0,
    downloads: 0,
    total_projects: 0,
    queue_count: 0,
  });
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setCurrentView(event.state.view);
      } else {
        setCurrentView("dashboard");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const navigateTo = (view: View) => {
    if (view !== currentView) {
      window.history.pushState({ view }, "", "");
      setCurrentView(view);
    }
  };
  useEffect(() => {
    loadDashboardStats();
    if (user && user.role !== "super_admin") {
      loadClientInfo();
    }
  }, [user]);

    const loadDashboardStats = async () => {
    if (!user) return;

    const clientFilter =
      user.role === "super_admin" ? {} : { client_id: user.client_id };

    const [
      jobsData,
      categoriesData,
      exportsData,
      projectsData,
      adminSpecificData, 
      queueData,
    ] = await Promise.all([
      supabase
        .from("facet_generation_jobs")
        .select("status")
        .match(clientFilter),
      supabase.from("categories").select("id").match(clientFilter),
      supabase.from("export_history").select("id").match(clientFilter),
      supabase.from("facet_generation_jobs").select("id").match(clientFilter),
      
      user.role === "super_admin"
        ? supabase.from("clients").select("id") 
        : user.role === "client_admin"
        ? supabase.from("user_profiles").select("id").eq("client_id", user.client_id) 
        : Promise.resolve({ data: [] }), 
      supabase
        .from("user_queues")
        .select("queue")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const jobs = jobsData.data || [];
    const completed = jobs.filter((j) => j.status === "completed").length;
    const inProgress = jobs.filter((j) => j.status === "processing").length;
    const pending = jobs.filter((j) => j.status === "pending").length;
    const queueCount = (queueData.data?.queue as any[])?.length || 0;

    const totalClients = user.role === "super_admin" ? (adminSpecificData.data?.length || 0) : 0;
    const totalTeamMembers = user.role === "client_admin" ? (adminSpecificData.data?.length || 0) : 0;

    setStats({
      facets_recommended: completed,
      jobs_in_progress: inProgress,
      jobs_yet_to_start: pending,
      pending_categories: categoriesData.data?.length || 0,
      downloads: exportsData.data?.length || 0,
      total_projects: projectsData.data?.length || 0,
      total_users: totalTeamMembers,
      total_active_clients: totalClients,
      queue_count: queueCount,
    });
  };
  const loadClientInfo = async () => {
    if (!user?.client_id) return;
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("id", user.client_id)
      .single();
    if (!error && data) {
      setClient(data as Client);
    }
  };
  const menuItems = [
    { id: "dashboard" as View, label: "Dashboard", icon: LayoutDashboard },
    { id: "projects" as View, label: "Projects", icon: FolderOpen },
    { id: "upload" as View, label: "Upload Categories", icon: Upload },
    { id: "prompts" as View, label: "Prompt Templates", icon: FileText },
    { id: "generate" as View, label: "Generate Facets", icon: Settings },
  ];

  if (user?.role === "super_admin" || user?.role === "client_admin") {
    menuItems.push({
      id: "clients" as View,
      label: user.role === "super_admin" ? "Manage Clients" : "Manage Team",
      icon: Users,
    });
  }

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return (
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              {user?.role === "super_admin" ? "Admin Dashboard" : "Dashboard"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Facets Recommended - goes to Generate */}
              <div
                onClick={() => navigateTo("generate")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-3xl font-bold text-slate-900">
                    {stats.facets_recommended}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Facets Recommended
                </h3>
                <p className="text-sm text-slate-600">Successfully generated</p>
              </div>

              {/* In Progress - goes to Generate */}
               <div
                onClick={() => navigateTo("generate")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-slate-900 block">
                      {stats.queue_count}
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  In Progress
                </h3>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Processing</span>
                  {stats.queue_count > 0 && (
                     <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                       + {stats.queue_count} in queue
                     </span>
                  )}
                </div>
              </div>

              {/* Yet to Start - goes to Generate */}
              <div
                onClick={() => navigateTo("generate")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <Clock className="w-6 h-6 text-yellow-600" />
                  </div>
                  <span className="text-3xl font-bold text-slate-900">
                    {stats.jobs_yet_to_start}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Yet to Start
                </h3>
                <p className="text-sm text-slate-600">Pending jobs</p>
              </div>

              {(user?.role === "super_admin" || user?.role === "client_admin") && (
                <div
                  onClick={() => navigateTo("clients")}
                  className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg ${user.role === 'super_admin' ? 'bg-teal-100' : 'bg-purple-100'}`}>
                      {user.role === 'super_admin' ? (
                        <Building2 className="w-6 h-6 text-teal-600" />
                      ) : (
                        <Users className="w-6 h-6 text-purple-600" />
                      )}
                    </div>
                    <span className="text-3xl font-bold text-slate-900">
                      {user.role === 'super_admin' 
                        ? stats.total_active_clients 
                        : stats.total_users}
                    </span>
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-1">
                    {user.role === 'super_admin' ? "Total Clients" : "Team Members"}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {user.role === 'super_admin' ? "Active companies" : "Managed users"}
                  </p>
                </div>
              )}

              <div
                onClick={() => navigateTo("upload")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-slate-100 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-slate-600" />
                  </div>
                  <span className="text-3xl font-bold text-slate-900">
                    {stats.pending_categories}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Categories
                </h3>
                <p className="text-sm text-slate-600">Total uploaded</p>
              </div>

              {/* Downloads - goes to Projects */}
              <div
                onClick={() => navigateTo("projects")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-indigo-100 rounded-lg">
                    <Download className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-3xl font-bold text-slate-900">
                    {stats.downloads}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Downloaded Outputs
                </h3>
                <p className="text-sm text-slate-600">Export history</p>
              </div>

              {/* Total Projects - goes to Projects */}
              <div
                onClick={() => navigateTo("projects")}
                className="bg-white p-6 rounded-lg border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <FolderOpen className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-3xl font-bold text-slate-900">
                    {stats.total_projects}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">
                  Total Projects
                </h3>
                <p className="text-sm text-slate-600">All time</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                Quick Actions
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => navigateTo("projects")}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create New Project
                </button>
                <button
                  onClick={() => navigateTo("upload")}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Upload Categories
                </button>
                <button
                  onClick={() => navigateTo("generate")}
                  className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Generate Facets
                </button>
              </div>
            </div>
          </div>
        );
      case "projects":
        return <ProjectManagement />;
      case "upload":
        return <CategoryUpload />;
      case "prompts":
        return <PromptManagement />;
      case "generate":
        return (
          <FacetGeneration onComplete={() => setCurrentView("dashboard")} />
        );
      case "clients":
        return user?.role === "super_admin" || user?.role === "client_admin" ? (
          <ClientManagement />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shrink-0">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-900">
            Facet Builder Pro
          </h1>
          <p className="text-sm text-slate-600 mt-1 truncate">{user?.email}</p>
          {user?.role === "super_admin" && (
            <span className="inline-block mt-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
              Super Admin
            </span>
          )}
          {user?.role === "client_admin" && (
            <span className="inline-block mt-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
              Admin
            </span>
          )}
          {user?.role !== "super_admin" && client && (
            <div className="flex items-center gap-2 mt-2 px-2 py-1 bg-slate-100 rounded text-xs">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span className="text-slate-700 font-medium truncate">
                {client.name || client.company_name || "Unknown client"}
              </span>
            </div>
          )}
        </div>

        <nav className="p-4 flex-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                  currentView === item.id
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-white">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto h-full scroll-smooth">
        {renderContent()}
      </main>
    </div>
  );
}
