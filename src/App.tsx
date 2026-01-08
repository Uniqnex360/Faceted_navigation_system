import { useAuth } from './contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { Loader } from 'lucide-react';
import SetPasswordPage from './pages/SetPasswordPage.tsx';

function App() {
  // Get the stable user state and initial loading status from your AuthContext.
  const { user, loading: authContextIsLoading } = useAuth();

  // This is the ONLY state needed to manage the authentication flow.
  // It tracks the live event from the Supabase client.
  const [authEvent, setAuthEvent] = useState<string | null>(null);

  // This is the single, reliable listener for the authentication flow.
  // It captures the event from Supabase and stores it in our state.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      setAuthEvent(event);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []); // This effect runs only once when the app mounts.

  // --- RENDERING LOGIC ---
  // The rendering is now prioritized correctly.

  // Priority 1: Show a loading spinner during the very initial auth check.
  if (authContextIsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Priority 2: If the live auth event is 'PASSWORD_RECOVERY', ALWAYS show the SetPasswordPage.
  // This is the crucial exception that solves the link redirection bug. It overrides all other logic.
  if (authEvent === 'PASSWORD_RECOVERY') {
    return (
      <SetPasswordPage
        onComplete={() => {
          // When the user successfully sets their password, the flow is over.
          // We manually update the event to 'SIGNED_IN' so the component re-renders
          // and the logic can proceed to the dashboard.
          setAuthEvent('SIGNED_IN');
        }}
      />
    );
  }

  // Priority 3: If a stable user object exists AND their profile is active, they are fully authenticated.
  if (user && user.is_active) {
    return <Dashboard />;
  }

  // Final Fallback: If none of the above conditions are met, the user is not logged in.
  return <Login />;
}

export default App;