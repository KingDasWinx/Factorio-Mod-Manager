import { useState, useEffect } from 'react';
import { X, Download, Calendar, Tag, Crown } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useProfiles } from '../context/ProfileContext';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ModVersionInfo {
  version: string;
  factorio_version: string;
  released_at: string;
}

interface ModDetails {
  name: string;
  releases: ModVersionInfo[];
}

interface ModVersionModalProps {
  isOpen: boolean;
  onClose: () => void;
  modName: string;
  onDownloadSuccess: (message: string) => void;
  onDownloadError: (error: string) => void;
}

export default function ModVersionModal({ 
  isOpen, 
  onClose, 
  modName,
  onDownloadSuccess,
  onDownloadError 
}: ModVersionModalProps) {
  const [modDetails, setModDetails] = useState<ModDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  // Queueing is handled by backend dependency resolver now
  
  // Usar o perfil ativo do contexto global
  const { activeProfile } = useProfiles();

  // Hook para fechar modal com ESC
  useEscapeKey(isOpen, onClose);

  useEffect(() => {
    if (isOpen && modName) {
      loadModDetails();
    }
  }, [isOpen, modName]);

  const loadModDetails = async () => {
    setIsLoading(true);
    try {
      const details = await invoke<ModDetails>('fetch_mod_details', { modName });
      setModDetails(details);
    } catch (error) {
      console.error('Erro ao carregar detalhes do mod:', error);
      onDownloadError(`Erro ao carregar versões: ${error}`);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (version: string) => {
    setIsDownloading(version);
    try {
      const profileName = activeProfile?.folder_name || 'default';
      // Start background dependency resolution and enqueue chain (root included)
      await invoke<string>('resolve_and_enqueue_dependencies', { rootMod: modName, version, profileName });
      onDownloadSuccess('Dependências analisadas e adicionadas à fila');
      onClose();
    } catch (error) {
      console.error('Erro no download:', error);
      const msg = typeof error === 'string' 
        ? error 
        : (error as any)?.message ?? JSON.stringify(error);
      const profileName = activeProfile?.folder_name || 'default';
      onDownloadError(`Erro no download de ${modName} v${version} (perfil ${profileName}): ${msg}`);
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'Data inválida';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container mod-version-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Download size={24} />
            <div>
              <h2>Selecionar Versão</h2>
              <p>Escolha a versão do mod <strong>{modName}</strong> para baixar</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          {isLoading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Carregando versões disponíveis...</p>
            </div>
          ) : modDetails ? (
            <div className="versions-list">
              <div className="profile-info">
                <p>Perfil de destino: <strong>{activeProfile?.name || 'Padrão'}</strong></p>
              </div>
              
              {modDetails.releases.map((release, index) => (
                <div key={release.version} className="version-item">
                  <div className="version-info">
                    <div className="version-header">
                      <span className="version-number">
                        <Tag size={16} />
                        v{release.version}
                        {index === 0 && (
                          <span className="latest-badge">
                            <Crown size={12} />
                            Mais Recente
                          </span>
                        )}
                      </span>
                      <span className="factorio-version">
                        Factorio {release.factorio_version}
                      </span>
                    </div>
                    <div className="version-date">
                      <Calendar size={14} />
                      {formatDate(release.released_at)}
                    </div>
                  </div>
                  
                  <button
                    className="download-version-btn"
                    onClick={() => handleDownload(release.version)}
                    disabled={isDownloading === release.version}
                  >
                    {isDownloading === release.version ? (
                      <>
                        <div className="spinner small"></div>
                        Baixando...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Baixar
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="error-container">
              <p>Erro ao carregar as versões do mod.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
