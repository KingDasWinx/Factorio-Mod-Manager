import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Loader2 } from 'lucide-react';

interface ProgressPayload {
  root_mod: string;
  current?: { name: string; version: string };
  processed?: number;
  discovered?: number;
  pending?: number;
  percent?: number;
}

export default function DependencyBanner() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);

  useEffect(() => {
    let unsubs: Array<() => void> = [];

    const setup = async () => {
      const u1 = await listen('dependency-resolver:started', (e) => {
        setVisible(true);
        setProgress({ ...(e.payload as any) });
      });
      const u2 = await listen('dependency-resolver:progress', (e) => {
        setVisible(true);
        setProgress({ ...(e.payload as any) });
      });
      const uErr = await listen('dependency-resolver:error', (e) => {
        setVisible(true);
        setProgress((prev) => ({ ...(prev ?? {} as any), ...(e.payload as any), percent: 100 }));
        setTimeout(() => {
          setVisible(false);
          setProgress(null);
        }, 2000);
      });
      const u3 = await listen('dependency-resolver:finished', (e) => {
        setProgress({ ...(e.payload as any) });
        // small delay to show completed state
        setTimeout(() => {
          setVisible(false);
          setProgress(null);
        }, 1600);
      });
      unsubs = [u1, u2, uErr, u3].map((u) => () => u());
    };

    setup();
    return () => { unsubs.forEach((fn) => fn()); };
  }, []);

  if (!visible || !progress) return null;

  const pct = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)));
  const deps = (progress as any)?.dependencies as number | undefined;

  return (
    <div className="dep-banner">
      <div className="dep-banner-content">
        <div className="dep-banner-row">
          <Loader2 className="spin" size={16} />
          <span>Analisando dependências…</span>
          {progress.root_mod && (
            <span className="root">{progress.root_mod}</span>
          )}
        </div>
        <div className="dep-banner-meta">
          <span>{pct}%</span>
          {progress.current && (
            <span className="current">{progress.current.name} v{progress.current.version}</span>
          )}
          <span>Proc.: {progress.processed ?? 0}</span>
          <span>Desc.: {progress.discovered ?? 0}</span>
          <span>Pend.: {progress.pending ?? 0}</span>
          {typeof deps === 'number' && (
            <span>Dep.: {deps}</span>
          )}
        </div>
        <div className="dep-progress">
          <div className="dep-progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
