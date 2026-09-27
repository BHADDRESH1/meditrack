import React, { useState } from 'react';
import { UserProfile, UserRole } from '@/types/inventory';
import { authService } from '@/services/authService';
import { Permission, hasPermission as checkPermission, canAccessLocation as checkLocationAccess } from '@/services/permissions';
import { DataMode, getDataMode, setDataMode as setStorageDataMode, onDataModeChange } from '@/services/supabaseClient';
import { inventoryRepo } from '@/services/inventoryRepository';
import { productMasterService } from '@/services/productMasterService';
import { procurementEngine } from '@/services/procurementEngine';
import { purchaseRequestService } from '@/services/purchaseRequestService';
import { recommendationEngine } from '@/services/recommendationEngine';
import { AuthContext } from './AuthContext';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => authService.getCurrentUser());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());

  const isDemoMode = dataMode === 'DEMO';

  React.useEffect(() => {
    return onDataModeChange((newMode) => {
      setDataModeState(newMode);
    });
  }, []);

  const setDataMode = (mode: DataMode) => {
    if (mode === 'SUPABASE') {
      inventoryRepo.clearForSupabase();
      productMasterService.clearForSupabase();
      procurementEngine.clearForSupabase();
      purchaseRequestService.clearForSupabase();
      recommendationEngine.clearForSupabase();
    } else {
      productMasterService.resetToCanonicalSeed();
      inventoryRepo.resetToCanonicalSeed();
      procurementEngine.resetToCanonicalSeed();
      purchaseRequestService.resetToCanonicalSeed();
      recommendationEngine.resetToCanonicalSeed();
    }
    setStorageDataMode(mode);
    setDataModeState(mode);
  };

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    const result = await authService.login(email, password);
    if (result.success && result.user) {
      setCurrentUser(result.user);
    }
    setIsLoading(false);
    return result;
  };

  const logout = () => {
    authService.logout();
    setCurrentUser(null);
  };

  const switchDemoRole = (role: UserRole) => {
    const switchedUser = authService.switchDemoUser(role);
    setCurrentUser(switchedUser);
  };

  const hasPerm = (permission: Permission) => {
    return checkPermission(currentUser, permission);
  };

  const canAccessLoc = (locationId: string) => {
    return checkLocationAccess(currentUser, locationId);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser && currentUser.isActive),
        isLoading,
        isDemoMode,
        dataMode,
        setDataMode,
        login,
        logout,
        switchDemoRole,
        hasPermission: hasPerm,
        canAccessLocation: canAccessLoc,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
