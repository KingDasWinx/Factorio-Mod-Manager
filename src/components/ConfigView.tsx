import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Database, Download, Clock, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useModsCache } from '../hooks/useModsCache';

interface AppConfig {
  cache_expiry_hours: number;
  game_exe_path?: string | null;
}

export default function ConfigView() {
  const [config, setConfig] = useState<AppConfig>({ cache_expiry_hours: 24, game_exe_path: undefined });
  const [exePathInput, setExePathInput] = useState<string>("");
  const [exePathValid, setExePathValid] = useState<boolean | null>(null);
  const [cacheSize, setCacheSize] = useState<string>('Calculando...');

  // Usar o hook useModsCache para ter acesso ao forceUpdate
  const { 
    isLoading: isCacheLoading, 
    isUpdating: isCacheUpdating, 
    totalMods, 
    cacheAge, 
    forceUpdate 
  } = useModsCache();

  // Carregar configurações salvas
  useEffect(() => {
    loadConfig();
    loadCacheSize();
  }, []);

  const loadConfig = async () => {
    try {
      const loadedConfig = await invoke<AppConfig>('load_config');
      setConfig(loadedConfig);
  setExePathInput(loadedConfig.game_exe_path ?? "");
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const saveConfig = async (newConfig: AppConfig) => {
    try {
      await invoke('save_config', { config: newConfig });
      setConfig(newConfig);
    } catch (error) {
      console.error('Erro ao salvar configurações:', error);
    }
  };

  const validatePath = async (path: string) => {
    if (!path) {
      setExePathValid(null);
      return;
    }
    try {
      const exists = await invoke<boolean>('validate_path_exists', { path });
      setExePathValid(exists);
    } catch (e) {
      setExePathValid(false);
    }
  };

  const handleExePathChange = async (path: string) => {
    setExePathInput(path);
    await validatePath(path);
    const newConfig = { ...config, game_exe_path: path || null };
    saveConfig(newConfig);
  };

  const handleBrowseExe = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: 'Executável do Factorio', extensions: ['exe'] }
      ]
    });
    if (typeof selected === 'string') {
      handleExePathChange(selected);
    }
  };

  const loadCacheSize = async () => {
    try {
      const size = await invoke<string>('get_cache_size');
      setCacheSize(size);
    } catch (error) {
      console.error('Erro ao carregar tamanho do cache:', error);
      setCacheSize('Erro ao calcular');
    }
  };

  const handleCacheExpiryChange = (hours: number) => {
    const newConfig = { ...config, cache_expiry_hours: hours };
    saveConfig(newConfig);
  };

  const formatDate = (date: Date | string) => {
    try {
      if (typeof date === 'string') {
        return new Date(date).toLocaleString('pt-BR');
      } else {
        return date.toLocaleString('pt-BR');
      }
    } catch {
      return 'Data inválida';
    }
  };

  const cacheExpiryOptions = [
    { value: 1, label: '1 hora' },
    { value: 6, label: '6 horas' },
    { value: 12, label: '12 horas' },
    { value: 24, label: '24 horas' },
    { value: 48, label: '48 horas' },
    { value: 72, label: '3 dias' },
    { value: 168, label: '1 semana' }
  ];

  return (
    <div className="config-container">
      <div className="config-header">
        <h1>
          <Settings size={28} />
          Configurações
        </h1>
        <p>Personalize sua experiência com o ModManager</p>
      </div>

      <div className="config-content">
        {/* Seção de Jogo */}
        <div className="config-section">
          <div className="section-header">
            <h2>
              <Settings size={20} />
              Caminho do Executável do Jogo
            </h2>
            <p>Defina o caminho do executável do Factorio (factorio.exe)</p>
          </div>

          <div className="cache-config">
            <div className="config-item">
              <label htmlFor="exe-path">
                <span>Path do factorio.exe</span>
              </label>
              <div className="input-row">
                <input
                  id="exe-path"
                  type="text"
                  placeholder="Ex.: C:\\Games\\Factorio\\bin\\x64\\factorio.exe"
                  value={exePathInput}
                  onChange={(e) => handleExePathChange(e.target.value)}
                  className={`text-input ${exePathValid === false ? 'error' : ''}`}
                />
                <button type="button" className="btn-browse" onClick={handleBrowseExe}>
                  Procurar...
                </button>
              </div>
            </div>
            {exePathValid === true && <small className="hint ok">Caminho válido</small>}
            {exePathValid === false && <small className="hint error">Caminho inválido ou inexistente</small>}
            {exePathValid === null && <small className="hint">Opcional — usado para abrir o jogo diretamente</small>}
          </div>
        </div>

        {/* Seção de Cache */}
        <div className="config-section">
          <div className="section-header">
            <h2>
              <Database size={20} />
              Gerenciamento de Cache
            </h2>
            <p>Configure e gerencie o cache dos mods do Factorio</p>
          </div>

          {/* Configuração de atualização automática */}
          <div className="cache-config">
            <div className="config-item">
              <label htmlFor="cache-expiry">
                <Clock size={18} />
                <span>Atualizar cache automaticamente a cada:</span>
              </label>
              <select
                id="cache-expiry"
                value={config.cache_expiry_hours}
                onChange={(e) => handleCacheExpiryChange(Number(e.target.value))}
                className="cache-expiry-select"
              >
                {cacheExpiryOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="cache-info-grid">
            <div className="cache-stat">
              <div className="stat-icon">
                <Database size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Mods em Cache</span>
                <span className="stat-value">
                  {totalMods ? totalMods.toLocaleString() : 'Carregando...'}
                </span>
              </div>
            </div>

            <div className="cache-stat">
              <div className="stat-icon">
                <Download size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Tamanho do Cache</span>
                <span className="stat-value">
                  {cacheSize}
                </span>
              </div>
            </div>

            <div className="cache-stat">
              <div className="stat-icon">
                <Clock size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Última Atualização</span>
                <span className="stat-value">
                  {cacheAge ? formatDate(cacheAge) : 'Nunca'}
                </span>
              </div>
            </div>

            <div className="cache-stat">
              <div className="stat-icon">
                <Info size={24} />
              </div>
              <div className="stat-info">
                <span className="stat-label">Status do Cache</span>
                <span className="stat-value">
                  {isCacheLoading ? 'Carregando...' : 'Atualizado'}
                </span>
              </div>
            </div>
          </div>

          <div className="cache-actions">
            <button 
              className="btn-update-cache"
              onClick={forceUpdate}
              disabled={isCacheLoading || isCacheUpdating}
            >
              <RefreshCw size={16} className={isCacheUpdating ? 'spinning' : ''} />
              {isCacheUpdating ? 'Atualizando Cache...' : 'Atualizar Cache'}
            </button>
          </div>
        </div>

        {/* Seção de Informações */}
        <div className="config-section">
          <div className="section-header">
            <h2>
              <Info size={20} />
              Sobre
            </h2>
            <p>Informações sobre o ModManager</p>
          </div>

          <div className="about-info">
            <div className="app-info">
              <h3>ModManager</h3>
              <p>Gerenciador de Mods para Factorio</p>
              <span className="version">Versão 1.0.0</span>
            </div>
            
            <div className="credits">
              <p>Desenvolvido com ❤️ usando Tauri + React</p>
              <p>API de Thumbnails: re146.dev</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
