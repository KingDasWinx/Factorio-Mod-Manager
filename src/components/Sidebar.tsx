import { Store, Package, Settings, User, ChevronLeft, ChevronRight, Download, Play } from "lucide-react";
import { ActiveTab, Profile } from "../types";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onProfileClick: () => void;
  activeProfile: Profile;
}

export default function Sidebar({ activeTab, setActiveTab, onProfileClick, activeProfile }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Auto-collapse quando a tela fica pequena (mas não abre automaticamente)
  useEffect(() => {
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 1024; // 1024px é nosso breakpoint
      
      // Só colapsa automaticamente se a tela ficou pequena e não está colapsada
      if (isSmallScreen && !isCollapsed) {
        setIsCollapsed(true);
      }
      // Não abre automaticamente - usuário deve fazer isso manualmente
    };

    // Verificar o tamanho inicial da janela
    handleResize();

    // Adicionar listener para mudanças de tamanho
    window.addEventListener('resize', handleResize);

    // Limpar o listener quando o componente for desmontado
    return () => window.removeEventListener('resize', handleResize);
  }, [isCollapsed]); // Dependência do isCollapsed para verificar o estado atual

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <button 
          className="nav-item profile-button-header"
          onClick={onProfileClick}
        >
          <User className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">{activeProfile.name}</span>}
        </button>
        <button
          className="nav-item run-button"
          onClick={async () => {
            try {
              await invoke<string>('run_factorio');
            } catch (e: any) {
              // Tentar obter caminho do exe via seletor e salvar em .config
              const selected = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Executável do Factorio', extensions: ['exe'] }]
              });
              if (typeof selected === 'string') {
                try {
                  const exists = await invoke<boolean>('validate_path_exists', { path: selected });
                  if (!exists) throw new Error('invalid');
                  // Carregar config atual, atualizar game_exe_path e salvar
                  const cfg = await invoke<any>('load_config');
                  const newCfg = { ...cfg, game_exe_path: selected };
                  await invoke('save_config', { config: newCfg });
                  // Tentar rodar novamente
                  await invoke<string>('run_factorio');
                  return;
                } catch {
                  // Se falhar, abrir tela de Config
                  setActiveTab('config');
                  return;
                }
              }
              // Usuário cancelou: abrir Config
              setActiveTab('config');
            }
          }}
          title={isCollapsed ? 'Run' : undefined}
        >
          <Play className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">Run</span>}
        </button>
      </div>
      {/* Edge-pinned small circular toggle button */}
      <button
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        title={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
        
      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${activeTab === 'all-mods' ? 'active' : ''}`}
          onClick={() => setActiveTab('all-mods')}
          title={isCollapsed ? "Todos os Mods" : undefined}
        >
          <Store className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">Todos os Mods</span>}
        </button>
        
        <button 
          className={`nav-item ${activeTab === 'my-mods' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-mods')}
          title={isCollapsed ? "Meus Mods" : undefined}
        >
          <Package className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">Meus Mods</span>}
        </button>

        <button 
          className={`nav-item ${activeTab === 'download-queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('download-queue')}
          title={isCollapsed ? "Fila de Download" : undefined}
        >
          <Download className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">Fila de Download</span>}
        </button>
      </nav>

  <div className="sidebar-footer ado">
        <button 
          className={`nav-item ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
          title={isCollapsed ? "Config" : undefined}
        >
          <Settings className="nav-icon" size={18} />
          {!isCollapsed && <span className="nav-text">Config</span>}
        </button>
      </div>
    </aside>
  );
}
