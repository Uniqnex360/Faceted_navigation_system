import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Client } from '../types';

export default function ClientManagement() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientName, setClientName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadClients();
    }
  }, [user]);

  const loadClients = async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    setClients((data as Client[]) || []);
  };

  const createClient = async () => {
    if (!clientName.trim() || !user) return;

    setIsCreating(true);
    try {
      const { error } = await supabase
        .from('clients')
        .insert({
          name: clientName,
          contact_email: contactEmail,
          is_active: true,
          created_by: user.id,
        });

      if (error) throw error;

      setClientName('');
      setContactEmail('');
      await loadClients();
    } catch (err) {
      console.error('Error creating client:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleClientStatus = async (id: string, currentStatus: boolean) => {
    await supabase
      .from('clients')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    await loadClients();
  };

  const deleteClient = async (id: string) => {
    if (!confirm('Are you sure? This will delete all data associated with this client.')) return;

    await supabase.from('clients').delete().eq('id', id);
    await loadClients();
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-8 text-slate-500">
        Access denied. Admin privileges required.
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Client Management</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-4">Create New Client</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Client Name"
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Contact Email"
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          onClick={createClient}
          disabled={isCreating || !clientName.trim()}
          className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Client
        </button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Client Name
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Contact Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Status
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Created
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {clients.map((client) => (
              <tr key={client.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-medium text-slate-900">
                  {client.name}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {client.contact_email || '-'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    client.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                  }`}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {new Date(client.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleClientStatus(client.id, client.is_active)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title={client.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {client.is_active ? (
                        <ToggleRight className="w-4 h-4" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => deleteClient(client.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No clients yet. Create your first client to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
