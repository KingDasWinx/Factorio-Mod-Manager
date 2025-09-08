import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, User, Tag, Clock, Star, Package } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import ModVersionModal from './ModVersionModal';
import './ModDetailsView.css';

// Minimal shape for full mod details we will display
interface ModImage { id: string; thumbnail: string; url: string }
interface ModDependency { name: string; optional?: boolean; incompatible?: boolean }
interface ModReleaseInfoJson { factorio_version: string; dependencies?: string[] }
interface ModRelease { version: string; released_at: string; info_json: ModReleaseInfoJson }

interface ModFull {
  name: string;
  title?: string;
  owner?: string;
  description?: string; // markdown
  summary?: string;
  images?: ModImage[];
  thumbnail?: string; // fallback cover image
  enhanced_thumbnail?: string; // optional enhanced cover if available
  downloads_count?: number;
  score?: number;
  source_url?: string;
  homepage?: string;
  category?: string;
  tags?: { title: string }[];
  releases: ModRelease[];
}

export type ModDetailsOpenPayload = {
  fromTab: 'all-mods' | 'my-mods' | 'download-queue' | 'config';
  modName: string;
};

interface Props {
  payload: ModDetailsOpenPayload;
  onBack: () => void;
  onOpenDependency: (name: string) => void;
}

function parseDependencies(deps?: string[]): ModDependency[] {
  if (!deps) return [];
  // Dependencies format examples: "base >= 1.1.0", "? some-mod", "!incompatible-mod"
  return deps.map(d => {
    const raw = d.trim();
  const optional = raw.startsWith('?');
  const incompatible = raw.startsWith('!');
    const cleaned = raw.replace(/^[!?~ ]+/, '');
    const name = cleaned.split(' ')[0];
  return { name, optional, incompatible };
  }).filter(d => d.name && d.name !== 'base');
}

export default function ModDetailsView({ payload, onBack, onOpenDependency }: Props) {
  const [data, setData] = useState<ModFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // For a basic carousel
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    // Backend has fetch_mod_details returning limited info (name + releases).
    // For UI richness, call Tauri command to fetch full JSON (avoids CORS).
    const fetchFull = async () => {
      try {
        const json = await invoke<ModFull>('fetch_mod_full', { modName: payload.modName });
        if (mounted) setData(json);
      } catch (e: any) {
        console.error('Failed to fetch full mod data (tauri):', e);
        // Fallback: use basic releases so at least modal works
        try {
          const basic = await invoke<{ name: string; releases: { version: string; factorio_version: string; released_at: string }[] }>('fetch_mod_details', { modName: payload.modName });
          const simplified: ModFull = {
            name: basic.name,
            releases: basic.releases.map(r => ({ version: r.version, released_at: r.released_at, info_json: { factorio_version: r.factorio_version } }))
          };
          if (mounted) setData(simplified);
        } catch (e2: any) {
          if (mounted) setError(String(e2?.message || e2));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchFull();
    return () => { mounted = false };
  }, [payload.modName]);

  const images = useMemo(() => data?.images || [], [data]);
  const hasImages = images.length > 0;

  // Build display images with fallback to thumbnail/cover if API has no gallery images
  const displayImages: ModImage[] = useMemo(() => {
    if (hasImages) return images;
    const normalizeUrl = (u: string) => (u?.startsWith('http') ? u : `https://assets-mod.factorio.com${u}`);
    const thumb = data?.enhanced_thumbnail || data?.thumbnail;
    if (thumb) {
      const normalizedThumb = normalizeUrl(thumb);
      // Try to derive full-size from ".thumb.png" pattern; if it fails, use the same
      const full = normalizedThumb.replace('.thumb.', '.');
      return [{ id: 'thumb', url: full, thumbnail: normalizedThumb }];
    }
    return [];
  }, [hasImages, images, data?.enhanced_thumbnail, data?.thumbnail]);

  const deps = useMemo(() => {
    const latest = data?.releases?.[0];
    return parseDependencies(latest?.info_json?.dependencies);
  }, [data]);

  const formatDate = (s?: string) => (s ? new Date(s).toLocaleDateString('pt-BR') : '');

  return (
    <div className="mod-details-view">
      <div className="header">
        <button className="btn back" onClick={onBack}>
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="spacer" />
        <button className="btn-download" onClick={() => setIsModalOpen(true)} disabled={!data || !data.releases?.length}>
          <Download size={16} />
          Download
        </button>
      </div>

      {loading && (
        <div className="loading-state">
          <div className="loading-spinner" />
          <p>Carregando detalhes do mod...</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <p>Erro ao carregar detalhes: {error}</p>
        </div>
      )}

      {data && !loading && (
        <div className="content">
          <div className="hero">
            <div className="title-block">
              <h1>{data.title || data.name}</h1>
              <div className="meta">
                {data.owner && (
                  <span className="meta-chip"><User size={14} /> {data.owner}</span>
                )}
                {data.category && (
                  <span className="meta-chip"><Tag size={14} /> {data.category}</span>
                )}
                {typeof data.downloads_count === 'number' && (
                  <span className="meta-chip"><Download size={14} /> {data.downloads_count.toLocaleString()}</span>
                )}
                {typeof data.score === 'number' && (
                  <span className="meta-chip"><Star size={14} /> {data.score.toFixed(1)}</span>
                )}
                {data.releases?.[0]?.released_at && (
                  <span className="meta-chip"><Clock size={14} /> Atualizado {formatDate(data.releases[0].released_at)}</span>
                )}
              </div>
            </div>
          </div>

      {displayImages.length > 0 && (
            <div className="carousel">
              <div className="slides">
        <img src={displayImages[activeImageIndex]?.url} alt={`screenshot ${activeImageIndex + 1}`} />
              </div>
              <div className="thumbs">
        {displayImages.map((img, idx) => (
                  <button key={img.id} className={`thumb ${idx === activeImageIndex ? 'active' : ''}`} onClick={() => setActiveImageIndex(idx)}>
                    <img src={img.thumbnail} alt={`thumb ${idx + 1}`} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {data.summary && (
            <p className="summary">{data.summary}</p>
          )}

          {deps.length > 0 && (
            <div className="dependencies">
              <h3>Dependências</h3>
              <div className="dep-list">
                {deps.map(d => {
                  const typeClass = d.incompatible ? 'incompatible' : d.optional ? 'optional' : 'required';
                  return (
                    <button
                      key={d.name}
                      className={`dep-chip ${typeClass}`}
                      onClick={() => onOpenDependency(d.name)}
                      title={d.incompatible ? 'Incompatível' : d.optional ? 'Opcional' : 'Compatível'}
                    >
                      <Package size={14} /> {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="links">
            {data.homepage && (
              <a href={data.homepage} target="_blank" rel="noreferrer" className="link"><ExternalLink size={14} /> Homepage</a>
            )}
            {data.source_url && (
              <a href={data.source_url} target="_blank" rel="noreferrer" className="link"><ExternalLink size={14} /> Código-fonte</a>
            )}
          </div>

          {data.releases?.length > 0 && (
            <div className="releases">
              <h3>Versões</h3>
              <ul>
                {data.releases.slice(0, 10).map(r => (
                  <li key={r.version} className="release-row">
                    <span>v{r.version}</span>
                    <span>Factorio {r.info_json?.factorio_version}</span>
                    <span>{formatDate(r.released_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ModVersionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        modName={payload.modName}
        onDownloadSuccess={() => {/* feedback handled elsewhere */}}
        onDownloadError={() => {/* feedback handled elsewhere */}}
      />
    </div>
  );
}
