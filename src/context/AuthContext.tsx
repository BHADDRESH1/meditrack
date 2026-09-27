import { createContext, useContext } from 'react';
import { UserProfile, UserRole } from '@/types/inventory';
import { Permission } from '@/services/permissions';
import { DataMode } from '@/services/supabaseClient';

export interface AuthContextType {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchDemoRole: (role: UserRole) => void;
  hasPermission: (permission: Permission) => boolean;
  canAccessLocation: (locationId: string) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
