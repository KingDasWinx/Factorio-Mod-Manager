import React from 'react';
import { useModThumbnails } from '../hooks/useModThumbnails';
import { Download, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface ThumbnailUpdateButtonProps {
  className?: string;
  limit?: number;
  onUpdateComplete?: (result: string) => void;
}

const ThumbnailUpdateButton: React.FC<ThumbnailUpdateButtonProps> = ({
  className = '',
  limit = 50,
  onUpdateComplete
}) => {
  const { thumbnailState, updatePopularThumbnails } = useModThumbnails();

  const handleUpdate = async () => {
    try {
      const result = await updatePopularThumbnails(limit);
      if (result) {
        onUpdateComplete?.(result);
      }
    } catch (error) {
      console.error('Erro ao atualizar thumbnails:', error);
    }
  };

  const getStatusIcon = () => {
    if (thumbnailState.isUpdatingPopular) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    
    if (thumbnailState.lastUpdateCount > 0) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }

    return <Download className="w-4 h-4" />;
  };

  const getButtonText = () => {
    if (thumbnailState.isUpdatingPopular) {
      return 'Atualizando...';
    }
    
    if (thumbnailState.lastUpdateCount > 0) {
      return `✅ ${thumbnailState.lastUpdateCount} atualizadas`;
    }

    return `Carregar ${limit} Thumbnails`;
  };

  const getButtonClass = () => {
    const baseClass = `
      flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200
      disabled:opacity-50 disabled:cursor-not-allowed
    `;

    if (thumbnailState.isUpdatingPopular) {
      return `${baseClass} bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 cursor-wait`;
    }

    if (thumbnailState.lastUpdateCount > 0) {
      return `${baseClass} bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800`;
    }

    return `${baseClass} bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl`;
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        onClick={handleUpdate}
        disabled={thumbnailState.isUpdatingPopular}
        className={getButtonClass()}
        title={`Buscar thumbnails dos ${limit} mods mais populares`}
      >
        {getStatusIcon()}
        {getButtonText()}
      </button>
      
      {/* Status adicional */}
      {(thumbnailState.errorCount > 0 || thumbnailState.lastUpdateCount > 0) && (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          {thumbnailState.errorCount > 0 && (
            <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <AlertCircle className="w-3 h-3" />
              <span>{thumbnailState.errorCount} erros</span>
            </div>
          )}
          
          {thumbnailState.lastUpdateCount > 0 && thumbnailState.errorCount === 0 && (
            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <CheckCircle className="w-3 h-3" />
              <span>Todas as thumbnails carregadas</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ThumbnailUpdateButton;
