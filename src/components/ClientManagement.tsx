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
  ToggleRight,
  ToggleLeft,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { Client } from "../types";
import { access } from "node:fs";

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
  const [editingClient, setSelectedEditingClient] = useState<Client | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  // Forms
  const [newClientName, setNewClientName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("client_user");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editUserFullName, setEditUserFullName] = useState("");
  const [editUserRole, setEditUserRole] = useState<
    "client_admin" | "client_user"
  >("client_user");

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
  // --- EDIT CLIENT ---
  const startEdit = (client: Client) => {
    setSelectedEditingClient(client);
    setEditName(client.name);
    setEditEmail(client.contact_email || "");
  };

  const saveEdit = async () => {
    if (!editingClient) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ name: editName, contact_email: editEmail })
        .eq("id", editingClient.id);

      if (error) throw error;
      toast.success("Company updated successfully");
      setSelectedEditingClient(null);
      loadClients();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };
  // --- EDIT USER ---
  const startEditUser = (profile: Profile) => {
    setEditingUser(profile);
    setEditUserFullName(profile.full_name || "");
    setEditUserRole(profile.role as "client_admin" | "client_user");
  };

  const saveUserEdit = async () => {
    if (!editingUser) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ full_name: editUserFullName, role: editUserRole })
        .eq("id", editingUser.id);

      if (error) throw error;
      toast.success("User updated successfully");

      // Refresh local list
      setClientUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? { ...u, full_name: editUserFullName, role: editUserRole }
            : u
        )
      );
      setEditingUser(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- BLOCK / UNBLOCK USER ---
  const toggleUserBlock = async (profile: Profile) => {
    if (profile.id === user?.id) {
      toast.error("You cannot block yourself.");
      return;
    }
    const newStatus = !profile.is_active;
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ is_active: newStatus })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success(`User ${newStatus ? "Unblocked" : "Blocked"}`);
      setClientUsers((prev) =>
        prev.map((u) =>
          u.id === profile.id ? { ...u, is_active: newStatus } : u
        )
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteClient = (client: Client) => {
    toast.confirm(
      `Delete ${client.name}? This will block access for all users under this company.`,
      async () => {
        const { error } = await supabase
          .from("clients")
          .delete()
          .eq("id", client.id);

        if (error) {
          toast.error("Cannot delete client with existing records.");
        } else {
          toast.success("Company deleted successfully");
          loadClients();
        }
      }
    );
  };
  const loadClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) toast.error("Failed to load clients");
    else setClients((data as Client[]) || []);
  };
  const normalizeName = (name: string) =>
    name.toLowerCase().replace(/\s+/g, "");

  const createClient = async () => {
    if (!newClientName.trim()) return;
    const normalizedNewName = normalizeName(newClientName);
    const clientExists = clients.some(
      (client) => normalizeName(client.name) === normalizedNewName
    );
    if (clientExists) {
      toast.error(
        `A client with a similar name to "${newClientName}" already exists.`
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("clients").insert({
        name: newClientName.trim(),
        contact_email: contactEmail.trim() || null,
        is_active: true,
        created_by: user?.id,
      });

      if (error) {
        if (error.code === "23505")
          throw new Error("Client or email already exists.");
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
    if (targetUser.id === user?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }

    if (user?.role === "client_admin" && targetUser.role !== "client_user") {
      toast.error("You only have permission to delete regular users.");
      return;
    }

    toast.confirm(
      `Are you sure you want to remove ${targetUser.email}?`,
      () => executeDelete(targetUser), 
      {
        confirmText: "Delete User",
        cancelText: "Keep User",
      }
    );
  };

  const executeDelete = async (targetUser: Profile) => {
    const {data:{session}}=await supabase.auth.getSession()
    if(!session)throw new Error("Authentication required!")
    setIsSubmitting(true);
    try {
      const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,{
        method:"POST",
        headers:{
          "Content-Type":'application/json',
          'Authorization':`Bearer ${session.access_token}`
        },
        body:JSON.stringify({
          user_id_to_delete:targetUser.id
        })
      })
      const result=await response.json()
      if(!response.ok)
      {
        throw new Error(result.error||"Failed to delete user from authentication system!")
      }
      
      const { error } = await supabase
        .from("user_profiles")
        .delete()
        .eq("id", targetUser.id);

      if (error) throw error;

      toast.success(`${targetUser.email} has been removed.`);

      const targetClientId =
        user?.role === "client_admin" ? user.client_id : selectedClient?.id;
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
  const toggleUserActive = async (
    targetUser: Profile,
    currentStatus: boolean
  ) => {
    if (targetUser.id === user?.id) {
      toast.error("You cannot deactivate your own account.");
      return;
    }

    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ is_active: !currentStatus })
        .eq("id", targetUser.id);

      if (error) throw error;

      toast.success(`User ${!currentStatus ? "activated" : "deactivated"}`);

      // Refresh the local list
      setClientUsers((prev) =>
        prev.map((u) =>
          u.id === targetUser.id ? { ...u, is_active: !currentStatus } : u
        )
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  // --- TOGGLE COMPANY STATUS ---
  const toggleCompanyActive = async (client: Client) => {
    const newStatus = !client.is_active;

    try {
      const { error } = await supabase
        .from("clients")
        .update({ is_active: newStatus })
        .eq("id", client.id);

      if (error) throw error;

      toast.success(
        `${client.name} is now ${newStatus ? "Active" : "Inactive"}`
      );

      // Update local state so the UI flips instantly
      setClients((prev) =>
        prev.map((c) =>
          c.id === client.id ? { ...c, is_active: newStatus } : c
        )
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  // --- USER INVITATION ---
  const inviteUser = async () => {
    const targetClientId =
      user?.role === "client_admin" ? user.client_id : selectedClient?.id;
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

  if (isLoading)
    return (
      <div className="p-8 text-center">
        <Loader className="animate-spin mx-auto" />
      </div>
    );

  if (user?.role !== "super_admin" && user?.role !== "client_admin") {
    return <div className="p-8 text-center text-slate-500">Access Denied</div>;
  }

  // VIEW 1: SUPER ADMIN CLIENT LIST
  if (view === "list" && user.role === "super_admin") {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Client Management
        </h2>
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
                <th className="px-6 py-3">Company Name</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {/* COLUMN 1: NAME */}
                  <td className="px-6 py-4 font-medium">
                    {editingClient?.id === client.id ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-blue-500 uppercase">
                          Company Name
                        </label>
                        <input
                          className="border border-blue-200 rounded px-3 py-2 text-sm w-full outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoFocus
                        />
                      </div>
                    ) : (
                      <span className="text-slate-900">{client.name}</span>
                    )}
                  </td>

                  {/* COLUMN 2: STATUS OR EMAIL (Toggle hidden during edit) */}
                  <td className="px-6 py-4">
                    {editingClient?.id === client.id ? (
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-blue-500 uppercase">
                          Contact Email
                        </label>
                        <input
                          className="border border-blue-200 rounded px-3 py-2 text-sm w-full outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          placeholder="email@company.com"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCompanyActive(client)}
                        className="flex items-center gap-2 group transition-opacity hover:opacity-80"
                        title={
                          client.is_active
                            ? "Deactivate Company"
                            : "Activate Company"
                        }
                      >
                        {client.is_active ? (
                          <>
                            <ToggleRight className="w-7 h-7 text-green-500" />
                            <span className="text-xs font-bold text-green-600 uppercase tracking-tight">
                              Active
                            </span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-7 h-7 text-slate-300" />
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">
                              Inactive
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </td>

                  {/* COLUMN 3: ACTIONS */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end items-center gap-3">
                      {editingClient?.id === client.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={saveEdit}
                            // DISABLED IF: Name AND Email are exactly the same as the original client record
                            disabled={
                              isSubmitting ||
                              (editName === client.name &&
                                editEmail === (client.contact_email || ""))
                            }
                            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                          >
                            {isSubmitting ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            onClick={() => setSelectedEditingClient(null)}
                            className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => manageClientUsers(client)}
                            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm font-semibold"
                          >
                            <Users className="w-4 h-4" /> Manage Users
                          </button>

                          <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>

                          <button
                            onClick={() => startEdit(client)}
                            className="text-slate-500 hover:text-slate-700 text-sm font-medium"
                          >
                            Edit
                          </button>

                          <button
                            onClick={() => handleDeleteClient(client)}
                            className="text-red-400 hover:text-red-600 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
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
        <button
          onClick={() => setView("list")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Clients
        </button>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {selectedClient?.name || "Loading..."}
          </h2>
          <p className="text-slate-500">User Management</p>
        </div>
      </div>
      {user.role === "super_admin" && (
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
              {user.role === "super_admin" && (
                <option value="client_admin">Client Admin</option>
              )}
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
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {clientUsers.map((profile) => (
              <tr
                key={profile.id}
                className="hover:bg-slate-50 transition-colors"
              >
                {/* COLUMN 1: USER INFO */}
                <td className="px-6 py-4">
                  {editingUser?.id === profile.id ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-blue-500 uppercase">
                        Full Name
                      </label>
                      <input
                        className="border border-blue-200 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        value={editUserFullName}
                        onChange={(e) => setEditUserFullName(e.target.value)}
                      />
                      <span className="text-[10px] text-slate-400">
                        {profile.email}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium text-slate-900">
                        {profile.email}
                      </div>
                      <div className="text-xs text-slate-500">
                        {profile.full_name || "Invited"}
                      </div>
                    </>
                  )}
                </td>

                {/* COLUMN 2: ROLE */}
                <td className="px-6 py-4">
                  {editingUser?.id === profile.id ? (
                    <select
                      className="border border-blue-200 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={editUserRole}
                      onChange={(e) => setEditUserRole(e.target.value as any)}
                    >
                      <option value="client_user">User</option>
                      <option value="client_admin">Admin</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        profile.role === "client_admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {profile.role === "client_admin" && (
                        <Shield className="w-3 h-3" />
                      )}
                      {profile.role === "client_admin" ? "Admin" : "User"}
                    </span>
                  )}
                </td>

                {/* COLUMN 3: STATUS (BLOCK/UNBLOCK) */}
                <td className="px-6 py-4">
                  {editingUser?.id === profile.id ? (
                    <span className="text-xs text-slate-400 italic">
                      Save to see status
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleUserBlock(profile)}
                      className="flex items-center gap-2 group"
                      disabled={profile.id === user?.id}
                    >
                      {profile.is_active ? (
                        <>
                          <ToggleRight className="w-7 h-7 text-green-500 group-hover:text-green-600" />
                          <span className="text-xs font-bold text-green-600 uppercase">
                            Active
                          </span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-7 h-7 text-red-400 group-hover:text-red-500" />
                          <span className="text-xs font-bold text-red-500 uppercase">
                            Inactive
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </td>

                {/* COLUMN 4: ACTIONS */}
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {editingUser?.id === profile.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={saveUserEdit}
                          // DISABLED IF: Full Name AND Role are exactly the same as the original profile record
                          disabled={
                            isSubmitting ||
                            (editUserFullName === (profile.full_name || "") &&
                              editUserRole === profile.role)
                          }
                          className="text-blue-600 disabled:text-slate-300 disabled:cursor-not-allowed hover:underline text-xs font-bold"
                        >
                          {isSubmitting ? "..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="text-slate-400 hover:underline text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => startEditUser(profile)}
                          className="text-slate-500 hover:text-slate-700 p-1"
                          disabled={
                            user?.role === "client_admin" &&
                            profile.role === "client_admin" &&
                            profile.id !== user.id
                          }
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(profile)}
                          disabled={
                            profile.id === user?.id ||
                            (user?.role === "client_admin" &&
                              profile.role !== "client_user")
                          }
                          className={`p-1 rounded-md ${
                            profile.id === user?.id
                              ? "text-slate-200"
                              : "text-red-400 hover:text-red-600"
                          }`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
