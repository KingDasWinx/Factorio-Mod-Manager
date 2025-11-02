import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, AlertCircle, Power, PowerOff, Search, CheckCircle2, XCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useProfiles } from '../context/ProfileContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import './MyModsView.css';

interface InstalledMod {
  name: string;
  version: string;
  enabled: boolean;
  file_name: string;
  download_date: string;
  factorio_version: string;
}

export default function MyModsView() {
  const [installedMods, setInstalledMods] = useState<InstalledMod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeletingMod, setIsDeletingMod] = useState<string | null>(null);
  const [isTogglingMod, setIsTogglingMod] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    modName: string;
    modVersion: string;
    fileName: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkToggling, setBulkToggling] = useState<null | 'enable' | 'disable'>(null);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState(false);

  // Usar perfil ativo do contexto global
  const { activeProfile } = useProfiles();

  // Hook para fechar modais com ESC
  useEscapeKey(!!deleteConfirmation, () => setDeleteConfirmation(null));
  useEscapeKey(deleteAllConfirmation, () => setDeleteAllConfirmation(false));

  useEffect(() => {
    if (activeProfile?.folder_name) {
      loadInstalledMods();
    }
  }, [activeProfile]);

  const loadInstalledMods = async () => {
    if (!activeProfile?.folder_name) return;

    setIsLoading(true);
    setError(null);

    try {
      const mods = await invoke<InstalledMod[]>('get_installed_mods', {
        profileName: activeProfile.folder_name
      });
      setInstalledMods(mods);
    } catch (error) {
      console.error('Erro ao carregar mods instalados:', error);
      setError(`Erro ao carregar mods: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMod = async (modName: string, fileName: string) => {
    if (!activeProfile?.folder_name) return;

    setIsDeletingMod(modName);

    try {
      await invoke('delete_mod_file', {
        profileName: activeProfile.folder_name,
        modName,
        filePath: fileName
      });

      // Recarregar a lista após deletar
      await loadInstalledMods();
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Erro ao deletar mod:', error);
      setError(`Erro ao deletar mod: ${error}`);
    } finally {
      setIsDeletingMod(null);
    }
  };

  const handleDeleteClick = (modName: string, modVersion: string, fileName: string) => {
    setDeleteConfirmation({ modName, modVersion, fileName });
  };

  const handleCancelDelete = () => {
    setDeleteConfirmation(null);
  };

  // Filtrar mods baseado no termo de pesquisa
  const filteredMods = installedMods.filter(mod =>
    mod.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleModStatus = async (modName: string, currentEnabled: boolean) => {
    if (!activeProfile?.folder_name) return;

    setIsTogglingMod(modName);

    try {
      const newStatus = !currentEnabled;
      await invoke('toggle_mod_status', {
        profileName: activeProfile.folder_name,
        modName,
        enabled: newStatus
      });

      // Recarregar a lista após alterar status
      await loadInstalledMods();
    } catch (error) {
      console.error('Erro ao alterar status do mod:', error);
      setError(`Erro ao alterar status do mod: ${error}`);
    } finally {
      setIsTogglingMod(null);
    }
  };

  const handleEnableAll = async () => {
    if (!activeProfile?.folder_name) return;
    setBulkToggling('enable');
    try {
      // Enable only those currently disabled
      const targets = installedMods.filter(m => !m.enabled);
      for (const mod of targets) {
        await invoke('toggle_mod_status', {
          profileName: activeProfile.folder_name,
          modName: mod.name,
          enabled: true,
        });
      }
      await loadInstalledMods();
    } catch (e) {
      setError(`Erro ao ativar todos: ${e}`);
    } finally {
      setBulkToggling(null);
    }
  };

  const handleDisableAll = async () => {
    if (!activeProfile?.folder_name) return;
    setBulkToggling('disable');
    try {
      // Disable only those currently enabled
      const targets = installedMods.filter(m => m.enabled);
      for (const mod of targets) {
        await invoke('toggle_mod_status', {
          profileName: activeProfile.folder_name,
          modName: mod.name,
          enabled: false,
        });
      }
      await loadInstalledMods();
    } catch (e) {
      setError(`Erro ao desativar todos: ${e}`);
    } finally {
      setBulkToggling(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!activeProfile?.folder_name) return;
    setBulkDeleting(true);
    try {
      for (const mod of installedMods) {
        try {
          await invoke('delete_mod_file', {
            profileName: activeProfile.folder_name,
            modName: mod.name,
            filePath: mod.file_name,
          });
        } catch (e) {
          console.error('Falha ao excluir mod', mod.name, e);
        }
      }
      await loadInstalledMods();
      setDeleteAllConfirmation(false);
    } catch (e) {
      setError(`Erro ao excluir todos: ${e}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="my-mods-view">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Carregando mods instalados...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-mods-view">
        <div className="error-container">
          <AlertCircle size={48} />
          <h3>Erro ao carregar mods</h3>
          <p>{error}</p>
          <button
            className="retry-button"
            onClick={loadInstalledMods}
          >
            <RefreshCw size={16} />
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="my-mods-view">
      <div className="header">
        <div className="header-top">
          <div className="header-left">
            <h2>Meus Mods</h2>
          </div>
          <div className="header-info" style={{ gap: 8 }}>
            <div className="search-container">
              <Search size={16} />
              <input
                type="text"
                placeholder="Buscar mods..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
        </div>
        <div className="header-actions-bottom">
          {installedMods.length > 0 && (
            <div className="mods-stats">
              <span className="stat-item active">
                <Power size={14} />
                {installedMods.filter(m => m.enabled).length} ativos
              </span>
              <span className="stat-item inactive">
                <PowerOff size={14} />
                {installedMods.filter(m => !m.enabled).length} inativos
              </span>
              <span className="stat-item total">
                Total: {installedMods.length}
              </span>
            </div>
          )}
          <div className="bulk-actions">
            <button className="resume-all-button" onClick={handleEnableAll} disabled={!activeProfile || bulkToggling !== null || bulkDeleting} title="Ativar todos os mods">
              <CheckCircle2 size={14} /> Ativar todos
            </button>
            <button className="pause-all-button" onClick={handleDisableAll} disabled={!activeProfile || bulkToggling !== null || bulkDeleting} title="Desativar todos os mods">
              <XCircle size={14} /> Desativar todos
            </button>
            <button className="clear-button" onClick={() => setDeleteAllConfirmation(true)} disabled={!activeProfile || bulkToggling !== null || bulkDeleting || installedMods.length === 0} title="Excluir todos os mods">
              <Trash2 size={14} /> Excluir todos
            </button>
            {(bulkToggling || bulkDeleting) && (
              <span className="bulk-progress">
                <div className="spinner micro" style={{ display: 'inline-block', marginRight: 6 }}></div>
                {bulkDeleting ? 'Excluindo...' : bulkToggling === 'enable' ? 'Ativando...' : 'Desativando...'}
              </span>
            )}
          </div>
        </div>
      </div>

      {filteredMods.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>{installedMods.length === 0 ? 'Nenhum mod instalado' : 'Nenhum mod encontrado'}</h3>
          <p>
            {installedMods.length === 0 ? (
              activeProfile
                ? 'Você ainda não baixou nenhum mod para este perfil.'
                : 'Selecione um perfil para ver os mods instalados.'
            ) : (
              'Nenhum mod corresponde ao termo pesquisado.'
            )}
          </p>
          {activeProfile && installedMods.length === 0 && (
            <p>Visite a aba "Todos os Mods" para baixar novos mods.</p>
          )}
        </div>
      ) : (
        <div className="mods-list">
          {filteredMods.map((mod) => (
            <div key={`${mod.name}-${mod.version}`} className="mod-list-item" onClick={() => {
              const evt = new CustomEvent('open-mod-details', { detail: { modName: mod.name, fromTab: 'my-mods' } });
              window.dispatchEvent(evt);
            }}>
              <div className="mod-name">{mod.name} <span className="queue-version">v{mod.version}</span></div>

              <button
                className={`toggle-switch ${mod.enabled ? 'active' : 'inactive'}`}
                onClick={(e) => { e.stopPropagation(); handleToggleModStatus(mod.name, mod.enabled); }}
                disabled={isTogglingMod === mod.name}
                title={mod.enabled ? 'Desativar mod' : 'Ativar mod'}
              >
                <div className="toggle-slider"></div>
                {isTogglingMod === mod.name && (
                  <div className="toggle-loading">
                    <div className="spinner micro"></div>
                  </div>
                )}
              </button>

              <button
                className="delete-icon-button"
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(mod.name, mod.version, mod.file_name); }}
                disabled={isDeletingMod === mod.name}
                title="Deletar mod"
              >
                {isDeletingMod === mod.name ? (
                  <div className="spinner micro"></div>
                ) : (
                  <Trash2 size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {deleteConfirmation && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <div className="modal-header">
              <h3>Confirmar Exclusão</h3>
            </div>
            <div className="modal-body">
              <p>Tem certeza que deseja deletar o mod:</p>
              <div className="mod-delete-info">
                <strong>{deleteConfirmation.modName}</strong>
                <span>Versão {deleteConfirmation.modVersion}</span>
              </div>
              <p className="warning-text">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={handleCancelDelete}
                disabled={isDeletingMod !== null}
              >
                Cancelar
              </button>
              <button
                className="confirm-delete-button"
                onClick={() => handleDeleteMod(deleteConfirmation.modName, deleteConfirmation.fileName)}
                disabled={isDeletingMod !== null}
              >
                {isDeletingMod === deleteConfirmation.modName ? (
                  <>
                    <div className="spinner small"></div>
                    Deletando...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Deletar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação para excluir todos */}
      {deleteAllConfirmation && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <div className="modal-header">
              <h3>Excluir todos os mods</h3>
            </div>
            <div className="modal-body">
              <p>Tem certeza que deseja excluir TODOS os mods deste perfil?</p>
              <p className="warning-text">Esta ação não pode ser desfeita.</p>
            </div>
            <div className="modal-footer">
              <button className="cancel-button" onClick={() => setDeleteAllConfirmation(false)} disabled={bulkDeleting}>Cancelar</button>
              <button className="confirm-delete-button" onClick={handleDeleteAll} disabled={bulkDeleting}>
                {bulkDeleting ? (<><div className="spinner small"></div> Excluindo...</>) : (<><Trash2 size={16} /> Excluir todos</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
