import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { Profile } from "../types";
import { useEscapeKey } from "../hooks/useEscapeKey";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  activeProfileIndex: number;
  setActiveProfileIndex: (index: number) => void;
  onCreateNew: () => void;
  onProfilesChange: () => Promise<void>;
}

export default function ProfileModal({ 
  isOpen, 
  onClose, 
  profiles, 
  activeProfileIndex, 
  setActiveProfileIndex, 
  onCreateNew,
  onProfilesChange 
}: ProfileModalProps) {
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [modsPath, setModsPath] = useState<string>("");
  const [exePath, setExePath] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [exeValid, setExeValid] = useState<boolean | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ index: number; folderName: string; profileName: string } | null>(null);
  
  // Hook para fechar modal com ESC
  useEscapeKey(isOpen, onClose);
  useEscapeKey(!!editingFolder, () => setEditingFolder(null));
  useEscapeKey(!!confirmDelete, () => setConfirmDelete(null));
  
  if (!isOpen) return null;

  const handleActivateProfile = (index: number) => {
    setActiveProfileIndex(index);
    onClose(); // Fechar o modal automaticamente após selecionar um perfil
  };

  const beginEdit = async (folderName: string) => {
    try {
      const cfg = await invoke<any>('get_profile_config', { folderName });
      setEditingFolder(folderName);
      setModsPath(cfg.mods_path ?? "");
      setExePath(cfg.factorio_exe_path ?? "");
      setPathValid(cfg.mods_path ? true : null);
      setExeValid(cfg.factorio_exe_path ? true : null);
    } catch (e) {
      alert(`Erro ao carregar configuração: ${e}`);
    }
  };

  const pickModsFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setModsPath(selected);
      try {
        const exists = await invoke<boolean>('validate_path_exists', { path: selected });
        setPathValid(exists);
      } catch { setPathValid(false); }
    }
  };

  const pickExe = async () => {
    const selected = await open({ directory: false, multiple: false, filters: [{ name: 'Executável do Factorio', extensions: ['exe'] }] });
    if (typeof selected === 'string') {
      setExePath(selected);
      try {
        const exists = await invoke<boolean>('validate_path_exists', { path: selected });
        setExeValid(exists);
      } catch { setExeValid(false); }
    }
  };

  const saveEdit = async () => {
    if (!editingFolder) return;
    setSaving(true);
    try {
      await invoke('update_profile_settings', {
        folderName: editingFolder,
        modsPath: modsPath || null,
        factorioExePath: exePath || null,
      });
      await onProfilesChange();
      setEditingFolder(null);
    } catch (e) {
      alert(`Erro ao salvar: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (index: number, folderName: string) => {
    if (profiles.length <= 1) {
      alert("Não é possível excluir o último perfil. Você deve ter pelo menos um perfil.");
      return;
    }
    const profileName = profiles[index]?.name || "este perfil";
    setConfirmDelete({ index, folderName, profileName });
  };

  const confirmDeleteProfile = async () => {
    if (!confirmDelete) return;
    try {
      await invoke("delete_profile", { folderName: confirmDelete.folderName });
      const { index } = confirmDelete;
      // Se o perfil ativo foi deletado, mudar para o primeiro
      if (index === activeProfileIndex) {
        setActiveProfileIndex(0);
      } else if (index < activeProfileIndex) {
        const newIndex = activeProfileIndex - 1;
        setActiveProfileIndex(newIndex);
      }
      
      // Recarregar lista de perfis
      await onProfilesChange();
      // Atualizar link para o novo perfil ativo (se existir após refresh)
      try {
        const list = await invoke<any>('get_profiles');
        const currentIndex = index === activeProfileIndex ? 0 : (index < activeProfileIndex ? activeProfileIndex - 1 : activeProfileIndex);
        const folder = list[currentIndex]?.folder_name;
        if (folder) {
          await invoke('update_factorio_mods_link', { folderName: folder });
        }
      } catch {}
      setConfirmDelete(null);
    } catch (error) {
      alert(`Erro ao excluir perfil: ${error}`);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  };

  return (
    <div className="modal-overlay profile-modal" onClick={onClose}>
      <div className="modal-content adj" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Gerenciar Perfis</h2>
          <button 
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        
        <div className="modal-body">
          <div className="profiles-list">
            {profiles.map((profile, index) => (
              <div 
                key={profile.folder_name} 
                className={`profile-item ${index === activeProfileIndex ? 'active' : ''}`}
                onClick={() => index !== activeProfileIndex && handleActivateProfile(index)}
              >
                <div className="profile-main">
                  <div className="profile-name-container">
                    <div className="profile-name">{profile.name}</div>
                    {profile.folder_name === 'default' && (
                      <span className="profile-default-badge">Padrão</span>
                    )}
                  </div>
                  {index === activeProfileIndex && <span className="profile-badge">Ativo</span>}
                </div>
                
                <div className="profile-details">
                  <div className="profile-meta">
                    <span className="profile-folder">Pasta: {profile.folder_name}</span>
                    <span className="profile-date">Criado: {formatDate(profile.created_at)}</span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="btn-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(profile.folder_name);
                      }}
                      title="Editar perfil"
                    >
                      Editar
                    </button>
                    {profiles.length > 1 && profile.folder_name !== 'default' && (
                      <button 
                        className="btn-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteProfile(index, profile.folder_name);
                        }}
                        title="Excluir perfil"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-new-profile adi" onClick={onCreateNew}>
            + Novo Perfil
          </button>
        </div>
      </div>
      {editingFolder && (
        <div className="modal-overlay" onClick={() => setEditingFolder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Editar Perfil</h2>
              <button className="modal-close" onClick={() => setEditingFolder(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Diretório dos Mods</label>
                <div className="input-row">
                  <input type="text" value={modsPath} onChange={async (e) => {
                    const v = e.target.value; setModsPath(v);
                    if (!v) { setPathValid(null); return; }
                    try { const ok = await invoke<boolean>('validate_path_exists', { path: v }); setPathValid(ok); } catch { setPathValid(false); }
                  }} className={pathValid === false ? 'error' : ''} />
                  <button className="btn-browse" onClick={pickModsFolder}>Procurar...</button>
                </div>
                {pathValid === false && <small className="error-message">Caminho inválido</small>}
                {pathValid === true && <small className="ok-message">Caminho válido</small>}
                {pathValid === null && <small className="hint">Opcional — deixe vazio para usar a pasta do perfil</small>}
              </div>
              <div className="form-group">
                <label>Path do factorio.exe</label>
                <div className="input-row">
                  <input type="text" value={exePath} onChange={async (e) => {
                    const v = e.target.value; setExePath(v);
                    if (!v) { setExeValid(null); return; }
                    try { const ok = await invoke<boolean>('validate_path_exists', { path: v }); setExeValid(ok); } catch { setExeValid(false); }
                  }} className={exeValid === false ? 'error' : ''} />
                  <button className="btn-browse" onClick={pickExe}>Procurar...</button>
                </div>
                {exeValid === false && <small className="error-message">Arquivo não encontrado</small>}
                {exeValid === true && <small className="ok-message">Caminho válido</small>}
                {exeValid === null && <small className="hint">Opcional — herdará das Configurações</small>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-new-profile" onClick={saveEdit} disabled={saving}>Salvar</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir perfil</h3>
            </div>
            <div className="modal-body">
              <p>Tem certeza que deseja excluir o perfil:</p>
              <div className="mod-delete-info">
                <strong>{confirmDelete.profileName}</strong>
              </div>
              <p className="warning-text">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button className="cancel-button" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="confirm-delete-button" onClick={confirmDeleteProfile}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
