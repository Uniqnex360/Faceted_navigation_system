  import React, { useState } from 'react';
  import { supabase } from '../lib/supabase';
  import { KeyRound, Loader } from 'lucide-react';
  import { useToast } from '../contexts/ToastContext';

  export default function SetPassword({ onComplete }: { onComplete: () => void }) {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const toast=useToast()
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);

      try {
        const { error:authError} = await supabase.auth.updateUser({
          password: password
        });

        if (authError) throw error;
        const {data:{user}}=await supabase.auth.getUser()
        if(user)
        {
          await supabase.from('user_profiles').update({'is_active':true}).eq('id',user.id)
        }

        toast.success("Account activated successfully!");
        onComplete(); // Takes them back to the normal flow (which will now show Dashboard)
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-slate-200">
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-blue-100 rounded-full">
              <KeyRound className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-center text-slate-900 mb-2">Set Your Password</h2>
          <p className="text-center text-slate-500 mb-8">
            Welcome! Please choose a password to complete your account setup.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || password.length < 6}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : "Finish Setup"}
            </button>
          </form>
        </div>
      </div>
    );
  }