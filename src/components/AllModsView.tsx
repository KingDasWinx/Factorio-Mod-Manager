import React, { useState, useEffect, useRef } from 'react';
import { Search, Download, Star, Clock, User, ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { useModsSearch } from '../hooks/useModsSearch';
import { useModThumbnails } from '../hooks/useModThumbnails';
import ModVersionModal from './ModVersionModal';

interface ModRelease {
  download_url: string;
  file_name: string;
  info_json: {
    factorio_version: string;
  };
  released_at: string;
  version: string;
  sha1: string;
  feature_flags?: string[];
}

interface Mod {
  name: string;
  title: string;
  owner: string;
  summary: string;
  downloads_count: number;
  latest_release?: ModRelease; // Pode ser undefined para alguns mods
  created_at?: string;
  updated_at?: string;
  category: string;
  score: number;
  thumbnail?: string;
  enhanced_thumbnail?: string; // Da API re146.dev
  last_highlighted_at?: string;
  requires_space_age?: boolean;
}

export default function AllModsView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const {
    searchTerm,
    setSearchTerm,
    searchResults,
    isSearching,
    totalResults,
    currentPage,
    totalPages,
    goToPage,
    clearSearch,
    hasSearched,
  } = useModsSearch(20);

  const { fetchModThumbnail } = useModThumbnails();
  
  // Estados para o modal de versões
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModName, setSelectedModName] = useState('');
  const [downloadMessage, setDownloadMessage] = useState('');
  const [downloadError, setDownloadError] = useState('');

  // Função para abrir o modal de download
  const handleDownloadClick = (modName: string) => {
    setSelectedModName(modName);
    setIsModalOpen(true);
    setDownloadMessage('');
    setDownloadError('');
  };

  // Callbacks do modal
  const handleDownloadSuccess = (message: string) => {
    setDownloadMessage(message);
    setTimeout(() => setDownloadMessage(''), 5000);
  };

  const handleDownloadError = (error: string) => {
    setDownloadError(error);
    setTimeout(() => setDownloadError(''), 5000);
  };

  // Componente inline para thumbnail simples
  const ModThumbnailImg: React.FC<{ mod: Mod }> = ({ mod }) => {
    const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

    useEffect(() => {
      const loadThumbnail = async () => {
        // Primeiro, verificar se já tem enhanced_thumbnail ou thumbnail
        if (mod.enhanced_thumbnail) {
          setThumbnailUrl(mod.enhanced_thumbnail);
          return;
        }

        if (mod.thumbnail) {
          const fullUrl = mod.thumbnail.startsWith('http') 
            ? mod.thumbnail 
            : `https://assets-mod.factorio.com${mod.thumbnail}`;
          setThumbnailUrl(fullUrl);
          return;
        }

        // Se não tem thumbnail, tentar buscar da API re146.dev
        try {
          const fetchedThumbnail = await fetchModThumbnail(mod.name);
          if (fetchedThumbnail) {
            setThumbnailUrl(fetchedThumbnail);
          }
        } catch (error) {
          console.error(`Erro ao buscar thumbnail para ${mod.name}:`, error);
        }
      };

      loadThumbnail();
    }, [mod.name, mod.enhanced_thumbnail, mod.thumbnail]);

    const placeholderSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Crect width='200' height='200' fill='%23f3f4f6'/%3E%3Ctext x='100' y='100' font-family='Arial' font-size='60' text-anchor='middle' dy='.3em' fill='%236b7280'%3E📦%3C/text%3E%3C/svg%3E";

    return (
      <img 
        src={thumbnailUrl || placeholderSvg} 
        alt={mod.title}
        className="w-full h-auto object-fill"
        onError={(e) => {
          e.currentTarget.src = placeholderSvg;
        }}
      />
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatDownloads = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const openDetails = (modName: string) => {
    // Save current scroll position so we can restore when coming back from details
    try {
      const key = `allModsScroll:${searchTerm}:${currentPage}`;
      const scrollTop = containerRef.current?.scrollTop || 0;
      sessionStorage.setItem(key, String(scrollTop));
    } catch {}
    const event = new CustomEvent('open-mod-details', { detail: { modName, fromTab: 'all-mods' } });
    window.dispatchEvent(event);
  };

  // On mount or when results change, try to restore the scroll position for the current search/page
  useEffect(() => {
    const key = `allModsScroll:${searchTerm}:${currentPage}`;
    const saved = sessionStorage.getItem(key);
    if (saved && containerRef.current) {
      const n = parseInt(saved, 10);
      // Restore after paint
      requestAnimationFrame(() => {
        if (containerRef.current) containerRef.current.scrollTop = isNaN(n) ? 0 : n;
      });
    } else if (containerRef.current) {
      // Default to top for new searches/pages
      containerRef.current.scrollTop = 0;
    }
  }, [searchResults, searchTerm, currentPage]);

  return (
    <div className="all-mods-container" ref={containerRef}>      
      <div className="mods-header">
        <h1>Todos os Mods</h1>
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-input-group">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Buscar mods por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={clearSearch}
                className="search-clear"
                title="Limpar busca"
              >
                ×
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Estatísticas da busca */}
      {hasSearched && (
        <div className="search-stats">
          <div className="search-results-info">
            {isSearching ? (
              <span>Buscando...</span>
            ) : (
              <span>
                {totalResults.toLocaleString()} resultados
                {searchTerm && ` para "${searchTerm}"`}
              </span>
            )}
          </div>
          
          {totalPages > 1 && (
            <div className="search-pagination-info">
              Página {currentPage} de {totalPages}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {isSearching && (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Buscando mods...</p>
        </div>
      )}

      {/* Resultados da busca */}
      {!isSearching && hasSearched && searchResults.length > 0 && (
        <>
          <div className="mods-grid">
            {searchResults.map((mod: Mod) => (
              <div key={mod.name} className="mod-card" onClick={() => openDetails(mod.name)}>
                <div className="mod-thumbnail">
                  <ModThumbnailImg mod={mod} />
                </div>
                
                <div className="mod-info">
                  <div className="mod-title-container">
                    <h3 className="mod-title">{mod.title}</h3>
                    {mod.category === "mod-packs" && (
                      <span className="modpack-badge">
                        <Package size={12} />
                        Modpack
                      </span>
                    )}
                  </div>
                  <p className="mod-summary">{mod.summary}</p>
                  
                  <div className="mod-meta">
                    <div className="mod-meta-item">
                      <User size={14} />
                      <span>{mod.owner}</span>
                    </div>
                    <div className="mod-meta-item">
                      <Download size={14} />
                      <span>{formatDownloads(mod.downloads_count)}</span>
                    </div>
                    <div className="mod-meta-item">
                      <Clock size={14} />
                      <span>{mod.updated_at ? formatDate(mod.updated_at) : 'N/A'}</span>
                    </div>
                    <div className="mod-meta-item">
                      <Star size={14} />
                      <span>{mod.score.toFixed(1)}</span>
                    </div>
                  </div>

                  <div className="mod-version">
                    {mod.latest_release ? (
                      <>v{mod.latest_release.version} • Factorio {mod.latest_release.info_json.factorio_version}</>
                    ) : (
                      <span className="no-release">Sem release disponível</span>
                    )}
                  </div>

                  <div className="mod-actions" onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="btn-download"
                      onClick={() => handleDownloadClick(mod.name)}
                    >
                      <Download size={16} />
                      Download
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              
              <div className="pagination-pages">
                {/* Mostra páginas próximas */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const startPage = Math.max(1, currentPage - 2);
                  const page = startPage + i;
                  if (page > totalPages) return null;
                  
                  return (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`pagination-page ${page === currentPage ? 'active' : ''}`}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
              
              <button 
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Próxima
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Estado vazio */}
      {!isSearching && hasSearched && searchResults.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>Nenhum mod encontrado</h3>
          <p>Tente buscar com termos diferentes ou verifique a ortografia.</p>
        </div>
      )}

      {/* Estado inicial */}
      {!hasSearched && (
        <div className="initial-state">
          <h3>Buscar Mods do Factorio</h3>
        </div>
      )}

      {/* Mensagens de feedback */}
      {downloadMessage && (
        <div className="download-message success">
          <div className="message-content">
            <span className="message-icon">✅</span>
            <span>{downloadMessage}</span>
          </div>
        </div>
      )}
      
      {downloadError && (
        <div className="download-message error">
          <div className="message-content">
            <span className="message-icon">❌</span>
            <span>{downloadError}</span>
          </div>
        </div>
      )}

      {/* Modal de seleção de versão */}
      <ModVersionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modName={selectedModName}
        onDownloadSuccess={handleDownloadSuccess}
        onDownloadError={handleDownloadError}
      />
    </div>
  );
}
