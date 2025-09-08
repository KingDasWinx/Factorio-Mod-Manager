import { RefreshCw, Clock, Database, AlertTriangle, CheckCircle } from 'lucide-react';
import { useModsCache } from '../hooks/useModsCache';

export default function CacheStatus() {
  const {
    isLoading,
    isUpdating,
    cacheAge,
    totalMods,
    forceUpdate,
    lastUpdateError,
    isCacheValid,
  } = useModsCache();

  const formatDate = (date: Date | null) => {
    if (!date) return 'Nunca';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffHours === 0) {
      return `${diffMinutes}min atrás`;
    } else if (diffHours < 24) {
      return `${diffHours}h atrás`;
    } else {
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const getStatusIcon = () => {
    if (isLoading || isUpdating) {
      return <RefreshCw className="cache-status-icon spinning" size={16} />;
    } else if (lastUpdateError) {
      return <AlertTriangle className="cache-status-icon error" size={16} />;
    } else if (isCacheValid) {
      return <CheckCircle className="cache-status-icon success" size={16} />;
    } else {
      return <Database className="cache-status-icon warning" size={16} />;
    }
  };

  const getStatusText = () => {
    if (isLoading) {
      return 'Carregando cache...';
    } else if (isUpdating) {
      return 'Atualizando mods...';
    } else if (lastUpdateError) {
      return 'Erro na atualização';
    } else if (!isCacheValid) {
      return 'Cache desatualizado';
    } else {
      return `${totalMods.toLocaleString()} mods`;
    }
  };

  return (
    <div className="cache-status">
      <div className="cache-status-main">
        {getStatusIcon()}
        <div className="cache-status-info">
          <span className="cache-status-text">{getStatusText()}</span>
          {cacheAge && !isLoading && (
            <div className="cache-status-details">
              <Clock size={12} />
              <span>Atualizado {formatDate(cacheAge)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="cache-status-actions">
        <button
          onClick={forceUpdate}
          disabled={isLoading || isUpdating}
          className="cache-refresh-btn"
          title="Atualizar cache de mods"
        >
          <RefreshCw 
            size={14} 
            className={isUpdating ? 'spinning' : ''} 
          />
          {isUpdating ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
    </div>
  );
}
