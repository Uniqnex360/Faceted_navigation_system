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
    const hash = window.location.hash;
    if (hash && (hash.includes('type=invite') || hash.includes('access_token'))) {
      setIsResettingPassword(true);
      window.history.replaceState({ screen: 'reset' }, "", "");
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (state?.screen === 'reset') {
        setIsResettingPassword(true);
      } else {
        setIsResettingPassword(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const toggleResetScreen = (val: boolean) => {
    if (val) {
      window.history.pushState({ screen: 'reset' }, "", "");
    } else {
      window.history.pushState({ screen: 'main' }, "", "");
    }
    setIsResettingPassword(val);
  };

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

  if (isResettingPassword) {
    return <SetPassword onComplete={() => toggleResetScreen(false)} />;
  }

  return user ? <Dashboard /> : <Login />;
}

export default App;