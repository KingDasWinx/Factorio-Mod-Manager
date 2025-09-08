import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useError } from '../contexts/ErrorContext';

interface CachedModsData {
  timestamp: string;
  pagination: any;
  results: any[];
}

interface UseCacheReturn {
  isLoading: boolean;
  isUpdating: boolean;
  cacheAge: Date | null;
  totalMods: number;
  forceUpdate: () => Promise<void>;
  lastUpdateError: string | null;
  isCacheValid: boolean;
}

export function useModsCache(): UseCacheReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [cacheAge, setCacheAge] = useState<Date | null>(null);
  const [totalMods, setTotalMods] = useState(0);
  const [lastUpdateError, setLastUpdateError] = useState<string | null>(null);
  const [isCacheValid, setIsCacheValid] = useState(false);
  
  const { showError } = useError();

  // Verifica se o cache existe e está válido
  const checkCacheStatus = useCallback(async () => {
    try {
      const isValid = await invoke<boolean>('check_cache_age');
      setIsCacheValid(isValid);
      
      if (isValid) {
        // Se o cache é válido, carrega os dados para obter informações
        try {
          const cacheData = await invoke<CachedModsData>('load_mods_cache');
          setCacheAge(new Date(cacheData.timestamp));
          setTotalMods(cacheData.results.length);
        } catch (err) {
          console.warn('Cache válido mas não foi possível carregar dados:', err);
        }
      }
    } catch (err: any) {
      console.warn('Erro ao verificar status do cache:', err);
      setIsCacheValid(false);
    }
  }, []);

  // Força atualização completa do cache
  const forceUpdate = useCallback(async () => {
    setIsUpdating(true);
    setLastUpdateError(null);
    
    try {
      console.log('Iniciando download completo de todos os mods...');
      
      // 1. Baixar todos os mods
      const modsData = await invoke<CachedModsData>('fetch_all_mods');
      console.log(`Baixados ${modsData.results.length} mods`);
      
      // 2. Salvar cache
      await invoke<string>('save_mods_cache', { data: modsData });
      console.log('Cache salvo com sucesso');
      
      // 3. Construir índice de busca
      await invoke<string>('build_search_index', { mods: modsData.results });
      console.log('Índice de busca construído');
      
      // 4. Atualizar estado
      setCacheAge(new Date(modsData.timestamp));
      setTotalMods(modsData.results.length);
      setIsCacheValid(true);
      
      console.log('Atualização completa finalizada com sucesso!');
      
    } catch (err: any) {
      console.error('Erro durante atualização:', err);
      setLastUpdateError(err.error || 'Erro desconhecido durante atualização');
      
      showError(
        'Erro na Atualização do Cache',
        'Não foi possível atualizar o cache de mods',
        err
      );
    } finally {
      setIsUpdating(false);
    }
  }, [showError]);

  // Inicialização automática
  const initializeCache = useCallback(async () => {
    setIsLoading(true);
    setLastUpdateError(null);
    
    try {
      // Verifica se o cache existe
      const isValid = await invoke<boolean>('check_cache_age');
      
      if (!isValid) {
        console.log('Cache não existe ou está desatualizado, iniciando download...');
        await forceUpdate();
      } else {
        console.log('Cache válido encontrado, carregando dados...');
        const cacheData = await invoke<CachedModsData>('load_mods_cache');
        setCacheAge(new Date(cacheData.timestamp));
        setTotalMods(cacheData.results.length);
        setIsCacheValid(true);
      }
    } catch (err: any) {
      console.error('Erro na inicialização do cache:', err);
      setLastUpdateError(err.error || 'Erro na inicialização');
      
      showError(
        'Erro na Inicialização',
        'Não foi possível inicializar o cache de mods',
        err
      );
    } finally {
      setIsLoading(false);
    }
  }, [forceUpdate, showError]);

  // Inicializar quando o hook for montado
  useEffect(() => {
    initializeCache();
  }, [initializeCache]);

  // Verificar status do cache periodicamente (a cada 5 minutos)
  useEffect(() => {
    const interval = setInterval(checkCacheStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkCacheStatus]);

  return {
    isLoading,
    isUpdating,
    cacheAge,
    totalMods,
    forceUpdate,
    lastUpdateError,
    isCacheValid,
  };
}
