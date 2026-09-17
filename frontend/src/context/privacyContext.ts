import { createContext, useContext } from 'react';

export interface PrivacyModeContextType {
  isPrivacyMode: boolean;
  togglePrivacyMode: () => void;
}

export const PrivacyModeContext = createContext<PrivacyModeContextType | null>(null);

export const usePrivacyMode = (): PrivacyModeContextType => {
  const context = useContext(PrivacyModeContext);
  if (!context) {
    throw new Error('usePrivacyMode must be used within a PrivacyModeProvider');
  }
  return context;
};
