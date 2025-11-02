import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import type { ModDetailsOpenPayload } from "./components/ModDetailsView";
import ProfileModal from "./components/ProfileModal";
import ProfileCreationModal from "./components/ProfileCreationModal";
import ErrorModal from "./components/ErrorModal";
import { ErrorProvider } from "./contexts/ErrorContext";
import { useErrorHandler } from "./hooks/useErrorHandler";
import { ProfileProvider, useProfiles, Profile as ProfileContextType } from "./context/ProfileContext";
import { ActiveTab, Profile } from "./types";
import "./App.css";
import DependencyBanner from "./components/DependencyBanner";

function AppContent() {
  // Load saved tab from localStorage, default to 'all-mods'
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      const savedTab = localStorage.getItem('activeTab');
      return (savedTab as ActiveTab) || 'all-mods';
    } catch {
      return 'all-mods';
    }
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileCreationModalOpen, setIsProfileCreationModalOpen] = useState(false);
  const [detailsPayload, setDetailsPayload] = useState<ModDetailsOpenPayload | null>(null);
  
  const { 
    profiles, 
    activeProfile, 
    activeProfileIndex, 
    isLoading, 
    setActiveProfileIndex, 
    refreshProfiles 
  } = useProfiles();

  const handleProfileCreated = async (created: Profile) => {
    // Find the new profile index first and persist it, then refresh so the provider picks it up.
    try {
      const list = await invoke<Profile[]>("get_profiles");
      const idx = list.findIndex(p => p.folder_name === created.folder_name);
      if (idx >= 0) {
        localStorage.setItem('activeProfileIndex', String(idx));
  // Persistir no backend (.config)
        try { 
          await invoke('set_selected_profile', { folderName: created.folder_name });
          await invoke('update_factorio_mods_link', { folderName: created.folder_name });
        } catch {}
      }
    } catch {
      // ignore – provider will keep current active on failure
    }
    await refreshProfiles();
    setIsProfileCreationModalOpen(false);
    setActiveTab('all-mods');
  };

  const handleBackToMain = () => {
    // If returning from details, go back to the originating tab
    if (activeTab === 'mod-details' && detailsPayload) {
      setActiveTab(detailsPayload.fromTab);
      setDetailsPayload(null);
    } else {
      setActiveTab('all-mods');
    }
  };

  // Open a details view for a given mod
  const openModDetails = (modName: string, fromTab: ActiveTab) => {
    const from: ModDetailsOpenPayload['fromTab'] = (fromTab === 'mod-details' ? 'all-mods' : fromTab) as any;
    setDetailsPayload({ modName, fromTab: from });
    setActiveTab('mod-details');
  };

  // Dependency navigation from within details
  const openDependency = (name: string) => {
    // Keep the original fromTab so Back returns correctly
    setDetailsPayload(prev => ({ modName: name, fromTab: prev?.fromTab || 'all-mods' }));
    setActiveTab('mod-details');
  };

  // Wire window event from child views to open details
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ modName: string; fromTab: ActiveTab }>
      if (!ce.detail) return;
      openModDetails(ce.detail.modName, ce.detail.fromTab);
    };
    window.addEventListener('open-mod-details', handler as EventListener);
    return () => window.removeEventListener('open-mod-details', handler as EventListener);
  }, [activeTab]);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      // Don't save 'mod-details' as it's a temporary state
      if (activeTab !== 'mod-details') {
        localStorage.setItem('activeTab', activeTab);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [activeTab]);

  if (isLoading) {
    return (
      <div className="app-container loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Carregando perfis...</p>
        </div>
      </div>
    );
  }

  // Converter Profile do contexto para Profile da interface
  const convertToProfile = (profile: ProfileContextType | null): Profile => {
    if (!profile) {
      return {
        name: 'Carregando...',
        folder_name: '',
        created_at: '',
        last_used: ''
      };
    }
    return {
      ...profile,
      last_used: profile.last_used || new Date().toISOString()
    };
  };

  const convertProfiles = (profiles: ProfileContextType[]): Profile[] => {
    return profiles.map(p => ({
      ...p,
      last_used: p.last_used || new Date().toISOString()
    }));
  };

  return (
    <div className="app-container">
  <DependencyBanner />
      <Sidebar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onProfileClick={() => setIsProfileModalOpen(true)}
        activeProfile={convertToProfile(activeProfile)}
      />

      <MainContent 
        activeTab={activeTab} 
        modDetailsPayload={detailsPayload}
        onBackFromDetails={handleBackToMain}
        onOpenDependency={openDependency}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        profiles={convertProfiles(profiles)}
        activeProfileIndex={activeProfileIndex}
        setActiveProfileIndex={setActiveProfileIndex}
        onCreateNew={() => {
          setIsProfileCreationModalOpen(true);
          setIsProfileModalOpen(false);
        }}
        onProfilesChange={refreshProfiles}
      />

      <ProfileCreationModal
        isOpen={isProfileCreationModalOpen}
        onClose={() => setIsProfileCreationModalOpen(false)}
        onProfileCreated={handleProfileCreated}
      />
    </div>
  );
}

function App() {
  const errorHandler = useErrorHandler();

  return (
    <ErrorProvider errorHandler={errorHandler}>
      <ProfileProvider>
        <AppContent />
        {errorHandler.error && (
          <ErrorModal
            isOpen={errorHandler.isErrorModalOpen}
            onClose={errorHandler.hideError}
            error={errorHandler.error}
          />
        )}
      </ProfileProvider>
    </ErrorProvider>
  );
}

export default App;
