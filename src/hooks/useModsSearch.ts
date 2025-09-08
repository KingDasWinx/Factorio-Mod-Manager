import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useError } from '../contexts/ErrorContext';

interface SearchFilters {
  category?: string;
  factorio_version?: string;
  min_downloads?: number;
  max_downloads?: number;
  min_score?: number;
  owner?: string;
}

interface SearchResult {
  mods: any[];
  total: number;
  page: number;
  page_size: number;
  query: string;
  filters: SearchFilters;
}

interface UseSearchReturn {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: any[];
  isSearching: boolean;
  totalResults: number;
  currentPage: number;
  totalPages: number;
  searchFilters: SearchFilters;
  setSearchFilters: (filters: SearchFilters) => void;
  goToPage: (page: number) => void;
  clearSearch: () => void;
  hasSearched: boolean;
}

export function useModsSearch(pageSize: number = 20): UseSearchReturn {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [hasSearched, setHasSearched] = useState(false);
  const rehydrated = useRef(false);
  
  const { showError } = useError();

  // Calcula o número total de páginas
  const totalPages = useMemo(() => {
    return Math.ceil(totalResults / pageSize);
  }, [totalResults, pageSize]);

  // Função de busca
  const performSearch = useCallback(async (
    query: string, 
    page: number = 1, 
    filters: SearchFilters = {}
  ) => {
    if (!query.trim() && Object.keys(filters).length === 0) {
      // Se não há busca nem filtros, limpa os resultados
      setSearchResults([]);
      setTotalResults(0);
      setCurrentPage(1);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    
    try {
      const result = await invoke<SearchResult>('search_mods', {
        query: query.trim(),
        page,
        pageSize,
        filters: Object.keys(filters).length > 0 ? filters : null
      });

      setSearchResults(result.mods);
      setTotalResults(result.total);
      setCurrentPage(result.page);
      setHasSearched(true);
      
      console.log(`Busca por "${query}" retornou ${result.total} resultados`);
      
    } catch (err: any) {
      console.error('Erro na busca:', err);
      
      showError(
        'Erro na Busca',
        'Não foi possível realizar a busca nos mods',
        err
      );
      
      // Limpa resultados em caso de erro
      setSearchResults([]);
      setTotalResults(0);
      setCurrentPage(1);
      
    } finally {
      setIsSearching(false);
    }
  }, [pageSize, showError]);

  // Debounce para busca automática
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim() || Object.keys(searchFilters).length > 0) {
        performSearch(searchTerm, 1, searchFilters);
      } else {
        setSearchResults([]);
        setTotalResults(0);
        setCurrentPage(1);
        setHasSearched(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, searchFilters, performSearch]);

  // Rehydrate persisted state once (sessionStorage)
  useEffect(() => {
    if (rehydrated.current) return;
    try {
      const savedTerm = sessionStorage.getItem('allMods.searchTerm') || '';
      const savedFiltersRaw = sessionStorage.getItem('allMods.searchFilters');
      const savedPageRaw = sessionStorage.getItem('allMods.currentPage');
      const savedFilters = savedFiltersRaw ? JSON.parse(savedFiltersRaw) as SearchFilters : {};
      const savedPage = savedPageRaw ? parseInt(savedPageRaw, 10) : 1;

      const hasSaved = (savedTerm && savedTerm.trim().length > 0) || (savedFilters && Object.keys(savedFilters).length > 0);
      if (hasSaved) {
        setSearchTerm(savedTerm);
        setSearchFilters(savedFilters);
        // run immediate search on the saved page
        performSearch(savedTerm, savedPage > 0 ? savedPage : 1, savedFilters);
      }
    } catch (e) {
      // ignore storage errors
    } finally {
      rehydrated.current = true;
    }
  }, [performSearch]);

  // Persist state on changes
  useEffect(() => {
    try {
      sessionStorage.setItem('allMods.searchTerm', searchTerm);
      sessionStorage.setItem('allMods.searchFilters', JSON.stringify(searchFilters || {}));
      sessionStorage.setItem('allMods.currentPage', String(currentPage));
    } catch (e) {
      // ignore storage errors
    }
  }, [searchTerm, searchFilters, currentPage]);

  // Função para ir para uma página específica
  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
  try { sessionStorage.setItem('allMods.currentPage', String(page)); } catch {}
      performSearch(searchTerm, page, searchFilters);
    }
  }, [searchTerm, searchFilters, totalPages, currentPage, performSearch]);

  // Função para limpar busca
  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setSearchFilters({});
    setSearchResults([]);
    setTotalResults(0);
    setCurrentPage(1);
    setHasSearched(false);
  }, []);

  // Atualizar filtros
  const handleSetSearchFilters = useCallback((filters: SearchFilters) => {
    setSearchFilters(filters);
    setCurrentPage(1); // Volta para a primeira página quando muda filtros
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    searchResults,
    isSearching,
    totalResults,
    currentPage,
    totalPages,
    searchFilters,
    setSearchFilters: handleSetSearchFilters,
    goToPage,
    clearSearch,
    hasSearched,
  };
}
