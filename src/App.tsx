import { useAuth } from './contexts/AuthContext';
import { useEffect, useState } from 'react'; // Added useState/useEffect
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { Loader } from 'lucide-react';
import SetPassword from './pages/SetPasswordPage.tsx';

function App() {
  const { user, loading } = useAuth();
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    // Detect if the user landed here from an invite/recovery email link
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token') || hash.includes('type=invite'))) {
      setIsResettingPassword(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  // 1. If they are coming from an invite link, show Set Password screen
  if (isResettingPassword) {
    return <SetPassword onComplete={() => setIsResettingPassword(false)} />;
  }

  // 2. Otherwise, follow your normal Auth flow
  return user ? <Dashboard /> : <Login />;
}

export default App;