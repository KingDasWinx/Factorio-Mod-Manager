import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Profile {
  name: string;
  folder_name: string;
  created_at: string;
  last_used?: string;
}

interface ProfileContextType {
  profiles: Profile[];
  activeProfile: Profile | null;
  activeProfileIndex: number;
  isLoading: boolean;
  setActiveProfileIndex: (index: number) => void;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileIndex, setActiveProfileIndexState] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Função para carregar perfis
  const loadProfiles = async () => {
    try {
      const profilesList = await invoke<Profile[]>('get_profiles');
      setProfiles(profilesList);
      
      // Se não há perfis, criar o padrão
      if (profilesList.length === 0) {
        console.log('Nenhum perfil encontrado, criando perfil padrão...');
        return;
      }
      // Restaurar perfil ativo do backend (.config) por folder_name; fallback ao localStorage
      let applied = false;
      try {
        const selected = await invoke<string | null>('get_selected_profile');
        if (selected) {
          const idx = profilesList.findIndex(p => p.folder_name === selected);
          if (idx >= 0) {
            setActiveProfileIndexState(idx);
            applied = true;
          }
        }
      } catch (e) {
        console.warn('Falha ao carregar perfil selecionado do backend:', e);
      }

      if (!applied) {
        const savedIndex = localStorage.getItem('activeProfileIndex');
        if (savedIndex) {
          const index = parseInt(savedIndex, 10);
          if (index >= 0 && index < profilesList.length) {
            setActiveProfileIndexState(index);
            applied = true;
          }
        }
      }

      if (!applied) {
        setActiveProfileIndexState(0);
        localStorage.setItem('activeProfileIndex', '0');
      }
    } catch (error) {
      console.error('Erro ao carregar perfis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Função para atualizar perfis (chamada externamente)
  const refreshProfiles = async () => {
    setIsLoading(true);
    await loadProfiles();
  };

  // Função para definir perfil ativo
  const setActiveProfileIndex = (index: number) => {
    if (index >= 0 && index < profiles.length) {
      setActiveProfileIndexState(index);
      localStorage.setItem('activeProfileIndex', index.toString());
      // Persistir também no backend (.config) usando folder_name
      const folder = profiles[index]?.folder_name;
      if (folder) {
        invoke('set_selected_profile', { folderName: folder }).catch(() => {
          // Silenciosamente ignorar falha; localStorage já cobre
        });
        // Atualizar link de mods do Factorio para o perfil ativo
        invoke('update_factorio_mods_link', { folderName: folder }).catch((e) => {
          console.warn('Falha ao atualizar link de mods do Factorio:', e);
        });
      }
    }
  };

  // Carregar perfis na inicialização
  useEffect(() => {
    loadProfiles();
  }, []);

  const activeProfile = profiles[activeProfileIndex] || null;

  const value: ProfileContextType = {
    profiles,
    activeProfile,
    activeProfileIndex,
    isLoading,
    setActiveProfileIndex,
    refreshProfiles,
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
}

// Hook customizado para usar o context
export function useProfiles() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfiles deve ser usado dentro de um ProfileProvider');
  }
  return context;
}
