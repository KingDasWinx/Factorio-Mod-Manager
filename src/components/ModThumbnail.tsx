import React, { useState, useEffect } from 'react';
import { useModThumbnails } from '../hooks/useModThumbnails';
import ModPlaceholder from './ModPlaceholder';

interface ModThumbnailProps {
  mod: any;
  className?: string;
  size?: 'small' | 'medium' | 'large' | 'xl';
  onError?: () => void;
  onLoad?: () => void;
}

const ModThumbnail: React.FC<ModThumbnailProps> = ({ 
  mod, 
  className = '', 
  size = 'medium',
  onError,
  onLoad 
}) => {
  const { getModThumbnail, fetchModThumbnail } = useModThumbnails();
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    small: 'w-12 h-12',
    medium: 'w-16 h-16',
    large: 'w-24 h-24',
    xl: 'w-40 h-40'
  };

  const sizePixels = {
    small: 48,
    medium: 64,
    large: 96,
    xl: 160
  };

  useEffect(() => {
    const loadThumbnail = async () => {
      setIsLoading(true);
      setHasError(false);

      // Primeiro, tentar usar thumbnail já disponível no cache
      const cachedThumbnail = getModThumbnail(mod);
      
      if (cachedThumbnail) {
        setThumbnailUrl(cachedThumbnail);
        setIsLoading(false);
        return;
      }

      // Se não há thumbnail cacheada e não foi tentado ainda, fazer lazy loading
      if (!mod.thumbnail_loaded && !mod.enhanced_thumbnail) {
        try {
          const fetchedThumbnail = await fetchModThumbnail(mod.name);
          if (fetchedThumbnail) {
            setThumbnailUrl(fetchedThumbnail);
          } else {
            setThumbnailUrl(null); // Usar placeholder
          }
        } catch (error) {
          console.error(`Erro ao carregar thumbnail para ${mod.name}:`, error);
          setThumbnailUrl(null); // Usar placeholder
          setHasError(true);
          onError?.();
        }
      } else {
        // Usar placeholder se não há thumbnail
        setThumbnailUrl(null);
      }
      
      setIsLoading(false);
    };

    loadThumbnail();
  }, [mod.name, mod.enhanced_thumbnail, mod.thumbnail_loaded, getModThumbnail, fetchModThumbnail]);

  const handleImageLoad = () => {
    setIsLoading(false);
    onLoad?.();
  };

  const handleImageError = () => {
    setThumbnailUrl(null); // Fallback para placeholder
    setHasError(true);
    setIsLoading(false);
    onError?.();
  };

  // Se a className inclui 'w-full h-full', não usar tamanhos padrão
  const useCustomSize = className.includes('w-full h-full');
  const containerClasses = useCustomSize ? className : `relative ${sizeClasses[size]} ${className}`;

  // Se não há thumbnail ou deu erro, mostrar placeholder
  if (!thumbnailUrl || hasError) {
    return (
      <div className={containerClasses}>
        <ModPlaceholder 
          size={useCustomSize ? 200 : sizePixels[size]} 
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse rounded-lg flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      <img
        src={thumbnailUrl}
        alt={`${mod.title} thumbnail`}
        className={`w-full h-full object-fill border border-gray-200 dark:border-gray-600 ${
          isLoading ? 'opacity-0' : 'opacity-100'
        } transition-opacity duration-200 ${className.includes('rounded-none') ? '' : 'rounded-lg'}`}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading="lazy"
      />
    </div>
  );
};

export default ModThumbnail;
