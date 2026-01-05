import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  Mail,
  ArrowLeft,
  Shield,
  Loader,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Client } from "../types";

interface Profile {
  id: string;
  email: string;
  role: "super_admin" | "client_admin" | "client_user";
  full_name: string;
  last_sign_in_at?: string;
  client_id?: string;
}

export default function ClientManagement() {
  const { user } = useAuth();
  const toast = useToast();

  // State
  const [view, setView] = useState<"list" | "details">("list");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientUsers, setClientUsers] = useState<Profile[]>([]);

  // Forms
  const [newClientName, setNewClientName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("client_user");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initComponent();
  }, [user]);

  const initComponent = async () => {
    if (!user) return;

    if (user.role === "super_admin") {
      await loadClients();
      setView("list");
    } else if (user.role === "client_admin") {
      // Direct access for Client Admins to their own company users
      setView("details");
      await loadClientDataForAdmin();
    }
    setIsLoading(false);
  };

  // --- CLIENT ADMIN LOGIC (Loading their own context) ---
  const loadClientDataForAdmin = async () => {
    if (!user?.client_id) return;

    // Fetch Client Details
    const { data: clientData } = await supabase
      .from("clients")
      .select("*")
      .eq("id", user.client_id)
      .single();

    if (clientData) {
      setSelectedClient(clientData);
      // Fetch Users for this specific client
      const { data: usersData } = await supabase
        .from("user_profiles") // Corrected to match your AuthContext table name
        .select("*")
        .eq("client_id", user.client_id);
      
      setClientUsers((usersData as Profile[]) || []);
    }
  };

  // --- SUPER ADMIN OPERATIONS ---
  const loadClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) toast.error("Failed to load clients");
    else setClients((data as Client[]) || []);
  };

  const createClient = async () => {
    if (!newClientName.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("clients").insert({
        name: newClientName.trim(),
        contact_email: contactEmail.trim() || null,
        is_active: true,
        created_by: user?.id,
      });

      if (error) {
        if (error.code === "23505") throw new Error("Client or email already exists.");
        throw error;
      }

      toast.success("Client created successfully");
      setNewClientName("");
      setContactEmail("");
      loadClients();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDeleteClick = (targetUser: Profile) => {
    // 1. Restriction: Don't delete self
    if (targetUser.id === user?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }

    // 2. Restriction: Client Admin can only delete Client Users
    if (user?.role === "client_admin" && targetUser.role !== "client_user") {
      toast.error("You only have permission to delete regular users.");
      return;
    }

    // 3. Use your custom toast.confirm
    toast.confirm(
      `Are you sure you want to remove ${targetUser.email}?`,
      () => executeDelete(targetUser), // onConfirm
      {
        confirmText: "Delete User",
        cancelText: "Keep User"
      }
    );
  };

  const executeDelete = async (targetUser: Profile) => {
    setIsSubmitting(true);
    try {
      // Logic: Remove from database
      const { error } = await supabase
        .from("user_profiles")
        .delete()
        .eq("id", targetUser.id);

      if (error) throw error;

      toast.success(`${targetUser.email} has been removed.`);
      
      // Refresh user list
      const targetClientId = user?.role === "client_admin" ? user.client_id : selectedClient?.id;
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("client_id", targetClientId);
      setClientUsers((data as Profile[]) || []);

    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  const manageClientUsers = async (client: Client) => {
    setSelectedClient(client);
    setView("details");
    setClientUsers([]);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("client_id", client.id);

    if (error) toast.error("Failed to load users");
    else setClientUsers((data as Profile[]) || []);
  };

  // --- USER INVITATION ---
  const inviteUser = async () => {
    const targetClientId = user?.role === "client_admin" ? user.client_id : selectedClient?.id;
    if (!newUserEmail.trim() || !targetClientId) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: newUserEmail,
            role: newUserRole,
            client_id: targetClientId,
            full_name: newUserEmail.split("@")[0],
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      toast.success(`Invitation sent to ${newUserEmail}`);
      setNewUserEmail("");

      // Reload list
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("client_id", targetClientId);
      setClientUsers((data as Profile[]) || []);
    } catch (err: any) {
      toast.error(`Invite failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center"><Loader className="animate-spin mx-auto" /></div>;

  if (user?.role !== "super_admin" && user?.role !== "client_admin") {
    return <div className="p-8 text-center text-slate-500">Access Denied</div>;
  }

  // VIEW 1: SUPER ADMIN CLIENT LIST
  if (view === "list" && user.role === "super_admin") {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Client Management</h2>
        <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
          <h3 className="font-semibold text-slate-900 mb-4">Add New Client</h3>
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Company Name"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Contact Email"
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createClient}
              disabled={isSubmitting || !newClientName}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="w-5 h-5 inline mr-1" /> Create
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-900 font-semibold">
              <tr>
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium">{client.name}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${client.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {client.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => manageClientUsers(client)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Users className="w-4 h-4" /> Manage
                    </button>
                  </td>
                  
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // VIEW 2: USER MANAGEMENT (Both Super Admin and Client Admin)
  return (
    <div>
      {user.role === "super_admin" && (
        <button onClick={() => setView("list")} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Clients
        </button>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{selectedClient?.name || "Loading..."}</h2>
          <p className="text-slate-500">User Management</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-600" /> Invite New User
        </h3>
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="User Email Address"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="client_user">Regular User</option>
            {user.role === "super_admin" && <option value="client_admin">Client Admin</option>}
          </select>
          <button
            onClick={inviteUser}
            disabled={isSubmitting || !newUserEmail}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Send Invite
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {clientUsers.map((profile) => (
              <tr key={profile.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div className="font-medium">{profile.email}</div>
                  <div className="text-xs text-slate-500">{profile.full_name || "Invited"}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${profile.role === "client_admin" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                    {profile.role === "client_admin" && <Shield className="w-3 h-3" />}
                    {profile.role === "client_admin" ? "Admin" : "User"}
                  </span>
                </td>
                 <td className="px-6 py-4">
        {profile.last_sign_in_at ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <Check className="w-3 h-3" /> Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            Pending Setup
          </span>
        )}
      </td>
      <td className="px-6 py-4 text-right">
        <button
          onClick={() => handleDeleteClick(profile)}
          // Disable button UI if delete is fundamentally impossible
          disabled={profile.id === user?.id || (user?.role === 'client_admin' && profile.role !== 'client_user')}
          className={`p-1 rounded-md transition-colors ${
            profile.id === user?.id || (user?.role === 'client_admin' && profile.role !== 'client_user')
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-red-600 hover:bg-red-50'
          }`}
          title={profile.id === user?.id ? "You cannot delete yourself" : "Delete User"}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
                
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}