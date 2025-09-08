import { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ThumbnailState {
  isUpdatingPopular: boolean;
  lastUpdateCount: number;
  errorCount: number;
}

export function useModThumbnails() {
  const [thumbnailState, setThumbnailState] = useState<ThumbnailState>({
    isUpdatingPopular: false,
    lastUpdateCount: 0,
    errorCount: 0,
  });

  // Cache para evitar múltiplas requisições para o mesmo mod
  const thumbnailCache = useRef<Map<string, string | null>>(new Map());
  const pendingRequests = useRef<Map<string, Promise<string | null>>>(new Map());

  /**
   * Busca thumbnail de um mod específico (lazy loading)
   */
  const fetchModThumbnail = useCallback(async (modName: string): Promise<string | null> => {
    // Verificar se já está em cache
    if (thumbnailCache.current.has(modName)) {
      return thumbnailCache.current.get(modName) || null;
    }

    // Verificar se já há uma requisição pendente para este mod
    if (pendingRequests.current.has(modName)) {
      return await pendingRequests.current.get(modName)!;
    }

    // Criar nova requisição
    const request = invoke<string | null>('fetch_mod_thumbnail_cmd', { modName })
      .then((thumbnail) => {
        thumbnailCache.current.set(modName, thumbnail);
        pendingRequests.current.delete(modName);
        return thumbnail;
      })
      .catch((error) => {
        console.error(`Erro ao buscar thumbnail para ${modName}:`, error);
        thumbnailCache.current.set(modName, null);
        pendingRequests.current.delete(modName);
        return null;
      });

    pendingRequests.current.set(modName, request);
    return await request;
  }, []);

  /**
   * Atualiza thumbnails dos mods mais populares em background
   */
  const updatePopularThumbnails = useCallback(async (limit = 50) => {
    if (thumbnailState.isUpdatingPopular) {
      console.log('Atualização já em andamento...');
      return;
    }

    setThumbnailState(prev => ({ ...prev, isUpdatingPopular: true }));

    try {
      const result = await invoke<string>('update_popular_thumbnails', { limit });
      
      // Extrair números do resultado (ex: "25 thumbnails atualizadas, 5 erros")
      const updateMatch = result.match(/(\d+) thumbnails atualizadas/);
      const errorMatch = result.match(/(\d+) erros/);
      
      const updateCount = updateMatch ? parseInt(updateMatch[1]) : 0;
      const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;

      setThumbnailState(prev => ({
        ...prev,
        isUpdatingPopular: false,
        lastUpdateCount: updateCount,
        errorCount,
      }));

      // Limpar cache local para forçar recarregamento
      thumbnailCache.current.clear();
      
      console.log(`✅ ${result}`);
      return result;
    } catch (error) {
      console.error('Erro ao atualizar thumbnails populares:', error);
      setThumbnailState(prev => ({ 
        ...prev, 
        isUpdatingPopular: false,
        errorCount: prev.errorCount + 1 
      }));
      throw error;
    }
  }, [thumbnailState.isUpdatingPopular]);

  /**
   * Limpa o cache de thumbnails
   */
  const clearThumbnailCache = useCallback(() => {
    thumbnailCache.current.clear();
    pendingRequests.current.clear();
  }, []);

  /**
   * Busca thumbnail de um mod e retorna URL ou null para usar placeholder
   */
  const getModThumbnail = useCallback((mod: any): string | null => {
    // 1. Priorizar enhanced_thumbnail (da API re146.dev)
    if (mod.enhanced_thumbnail) {
      return mod.enhanced_thumbnail;
    }

    // 2. Fallback para thumbnail original (raramente disponível)
    if (mod.thumbnail) {
      return mod.thumbnail.startsWith('http') 
        ? mod.thumbnail 
        : `https://assets-mod.factorio.com${mod.thumbnail}`;
    }

    // 3. Retornar null para usar placeholder SVG
    return null;
  }, []);

  return {
    thumbnailState,
    fetchModThumbnail,
    updatePopularThumbnails,
    clearThumbnailCache,
    getModThumbnail,
  };
}
