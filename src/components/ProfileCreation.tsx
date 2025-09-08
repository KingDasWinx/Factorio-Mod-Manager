import { useState } from "react";
import { User, Plus, ArrowLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Profile } from "../types";

interface ProfileCreationProps {
  onProfileCreated: (profile: Profile) => void;
  onBack: () => void;
}

export default function ProfileCreation({ onProfileCreated, onBack }: ProfileCreationProps) {
  const [profileName, setProfileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [pathValid, setPathValid] = useState<boolean | null>(null);
  const [exePath, setExePath] = useState("");
  const [exeValid, setExeValid] = useState<boolean | null>(null);
  const handleBrowseFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setCustomPath(selected);
      try {
        const exists = await invoke<boolean>('validate_path_exists', { path: selected });
        setPathValid(exists);
      } catch {
        setPathValid(false);
      }
    }
  };

  const handleBrowseExe = async () => {
    const selected = await open({ directory: false, multiple: false, filters: [{ name: 'Executável do Factorio', extensions: ['exe'] }] });
    if (typeof selected === 'string') {
      setExePath(selected);
      try {
        const exists = await invoke<boolean>('validate_path_exists', { path: selected });
        setExeValid(exists);
      } catch {
        setExeValid(false);
      }
    }
  };

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      setError("Por favor, insira um nome para o perfil");
      return;
    }

    if (useCustomPath) {
      if (!customPath.trim()) {
        setError("Informe o caminho da pasta de mods personalizada");
        return;
      }
      try {
        const exists = await invoke<boolean>('validate_path_exists', { path: customPath.trim() });
        if (!exists) {
          setError("O caminho informado não existe");
          setPathValid(false);
          return;
        }
        setPathValid(true);
      } catch {
        setError("Não foi possível validar o caminho informado");
        return;
      }
    }

    setIsCreating(true);
    setError("");

    try {
      const newProfile = await invoke<Profile>("create_profile", {
        profileName: profileName.trim(),
        customModsPath: useCustomPath ? customPath.trim() : null,
        exePath: exePath.trim() || null
      });
      onProfileCreated(newProfile);
    } catch (error) {
      setError(error as string);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isCreating) {
      handleCreateProfile();
    }
  };

  // Função para normalizar o nome e mostrar preview da pasta
  const getFolderPreview = (name: string) => {
    if (!name.trim()) return "";
    
    // Aplicar a mesma lógica de normalização do backend
    const normalized = name
      .split('')
      .map(c => {
        const charMap: { [key: string]: string } = {
          'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a',
          'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
          'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
          'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
          'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
          'ç': 'c', 'ñ': 'n',
          'Á': 'A', 'À': 'A', 'Â': 'A', 'Ã': 'A', 'Ä': 'A',
          'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
          'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
          'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Õ': 'O', 'Ö': 'O',
          'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
          'Ç': 'C', 'Ñ': 'N',
        };
        
        if (charMap[c]) return charMap[c];
        if (/[a-zA-Z0-9]/.test(c)) return c;
        if (c === ' ') return '-';
        return '-';
      })
      .join('');
    
    // Remover hífens consecutivos e limpar
    return normalized
      .replace(/-+/g, '-')
      .toLowerCase()
      .replace(/^-+|-+$/g, '');
  };

  return (
    <div className="profile-creation">
      <div className="profile-creation-header">
        <button 
          className="back-button"
          onClick={onBack}
          title="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <h1>
          <User size={24} />
          Criar Novo Perfil
        </h1>
      </div>

      <div className="profile-creation-content">
        <div className="profile-form">
          <div className="form-group">
            <label htmlFor="profileName">Nome do Perfil</label>
            <input
              id="profileName"
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ex: kingdaswinxbr"
              className={error ? "error" : ""}
              disabled={isCreating}
              autoFocus
            />
            {error && <span className="error-message">{error}</span>}
          </div>

          {profileName.trim() && (
            <div className="folder-preview">
              <h3>Preview da Pasta:</h3>
              <div className="folder-path">
                <code>C:\Users\{"{user}"}\AppData\Roaming\ModManager\profiles\{getFolderPreview(profileName)}</code>
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Diretório dos Mods</label>
            <div className="radio-group" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={`radio-option-pill ${!useCustomPath ? 'active' : ''}`} onClick={() => setUseCustomPath(false)}>
                Padrão (pasta do perfil)
              </button>
              <button type="button" className={`radio-option-pill ${useCustomPath ? 'active' : ''}`} onClick={() => setUseCustomPath(true)}>
                Caminho personalizado
              </button>
            </div>
            {useCustomPath && (
              <div className="custom-path-input">
                <div className="input-row">
                  <input
                    type="text"
                    placeholder="Ex.: D:\\FactorioProfiles\\mods-king"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    className={pathValid === false ? 'error' : ''}
                  />
                  <button type="button" className="btn-browse" onClick={handleBrowseFolder}>Procurar...</button>
                </div>
                {pathValid === false && <small className="error-message">Caminho inválido</small>}
                {pathValid === true && <small className="ok-message">Caminho válido</small>}
                {pathValid === null && <small className="hint">A pasta deve existir</small>}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Path do factorio.exe</label>
            <div className="input-row">
              <input
                type="text"
                placeholder="Ex.: C:\\Games\\Factorio\\bin\\x64\\factorio.exe"
                value={exePath}
                onChange={async (e) => {
                  const val = e.target.value;
                  setExePath(val);
                  if (!val) { setExeValid(null); return; }
                  try {
                    const exists = await invoke<boolean>('validate_path_exists', { path: val });
                    setExeValid(exists);
                  } catch { setExeValid(false); }
                }}
                className={exeValid === false ? 'error' : ''}
              />
              <button type="button" className="btn-browse" onClick={handleBrowseExe}>Procurar...</button>
            </div>
            {exeValid === false && <small className="error-message">Arquivo não encontrado</small>}
            {exeValid === true && <small className="ok-message">Caminho válido</small>}
            {exeValid === null && <small className="hint">Opcional — pode herdar das Configurações</small>}
          </div>

          <div className="form-actions">
            <button
              className="create-button"
              onClick={handleCreateProfile}
              disabled={!profileName.trim() || isCreating || (useCustomPath && !customPath.trim())}
            >
              <Plus size={18} />
              {isCreating ? "Criando..." : "Criar Perfil"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
