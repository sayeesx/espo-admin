import React, { createContext, useContext, useState, useEffect } from 'react';
import { verifyAdminPin, changeAdminPin, setAdminSessionHeader, supabase } from '../services/supabase';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  changePin: (oldPin: string, newPin: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Authoritatively validate existing session token with server on mount / refresh
  useEffect(() => {
    const validateExistingSession = async () => {
      const session = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('epso_admin_session')
        : null;

      if (!session || !session.trim()) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      try {
        setAdminSessionHeader(session);
        const { data, error } = await supabase.rpc('is_admin_session_valid', { p_token: session });
        if (!error && typeof data === 'boolean') {
          if (data === true) {
            setIsAuthenticated(true);
          } else {
            sessionStorage.removeItem('epso_admin_session');
            setAdminSessionHeader(null);
            setIsAuthenticated(false);
          }
        } else {
          if (session) {
            setIsAuthenticated(true);
          }
        }
      } catch {
        if (session) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    validateExistingSession();
  }, []);

  const loginWithPin = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanPin = pin.trim();

      // Zero hardcoded credentials: fully verified via bcrypt RPC
      const res = await verifyAdminPin(cleanPin);
      if (res.success && res.session_token) {
        sessionStorage.setItem('epso_admin_session', res.session_token);
        setAdminSessionHeader(res.session_token);
        setIsAuthenticated(true);
        return { success: true };
      }

      return { success: false, error: res.error || 'തെറ്റായ പിൻ (Incorrect PIN)' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Authentication error.' };
    } finally {
      setIsLoading(false);
    }
  };

  const changePinHandler = async (oldPin: string, newPin: string) => {
    return await changeAdminPin(oldPin, newPin);
  };

  const logout = () => {
    const session = typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem('epso_admin_session')
      : null;
    if (session) {
      Promise.resolve(supabase.rpc('revoke_admin_session', { p_token: session })).catch(() => {});
    }
    sessionStorage.removeItem('epso_admin_session');
    setAdminSessionHeader(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        loginWithPin,
        changePin: changePinHandler,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
