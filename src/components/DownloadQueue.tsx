import { useState } from 'react';
import { Pause, Play, ArrowUp, Trash2, CheckCircle2, Download as DownloadIcon, ListChecks, XCircle, Layers } from 'lucide-react';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { useProfiles } from '../context/ProfileContext';

export default function DownloadQueueView() {
	const { items, loading, pauseAll, resumeAll, pause, resume, remove, prioritize, refresh, clearAll } = useDownloadQueue();
	const { activeProfile } = useProfiles();
	const [tab, setTab] = useState<'todos' | 'baixados' | 'pendentes'>('todos');
	const fmtSpeed = (bps?: number) => {
		if (!bps || bps <= 0) return '';
		const kb = bps / 1024;
		const mb = kb / 1024;
		return mb >= 1 ? `${mb.toFixed(2)} MB/s` : `${kb.toFixed(0)} KB/s`;
	};
	const fmtEta = (secs?: number | null) => {
		if (!secs && secs !== 0) return '';
		const s = Math.max(0, Math.floor(secs as number));
		const m = Math.floor(s / 60);
		const r = s % 60;
		return m > 0 ? `${m}m ${r}s` : `${r}s`;
	};
	const currentProfileId = activeProfile?.folder_name || 'default';
	const filtered = items.filter(i => i.profile_name === currentProfileId);
	const completedItems = filtered.filter(i => typeof i.status === 'string' && i.status === 'Completed');
	const downloadingItems = filtered.filter(i => typeof i.status === 'string' && i.status === 'Downloading');
	const queuedItems = filtered.filter(i => typeof i.status === 'string' && i.status === 'Queued');
	const paused = filtered.filter(i => typeof i.status === 'string' && i.status === 'Paused');
	const pendingItems = [...downloadingItems, ...queuedItems, ...paused];

	const total = filtered.length;
	const completed = filtered.filter(i => typeof i.status === 'string' && i.status === 'Completed').length;
	const toDownload = filtered.filter(i => typeof i.status === 'string' && (i.status === 'Queued' || i.status === 'Paused' || i.status === 'Downloading')).length;

	return (
		<div className="download-queue-view">
				<div className="header">
				<div className="header-left">
					<h2>Fila de Download</h2>
				</div>
				<div className="header-info">
					<button className="refresh-button" onClick={() => refresh()}>Atualizar</button>
					<button className="pause-all-button" onClick={() => pauseAll()}><Pause size={14}/>Pausar Todos</button>
					<button className="resume-all-button" onClick={() => resumeAll()}><Play size={14}/>Retomar Todos</button>
						<button className="clear-button" onClick={() => clearAll()} title="Limpar Fila"><XCircle size={14}/>Limpar</button>
				</div>
			</div>
				<div className='abby'>

				{/* Tabs */}
				<div className="tabs">
					<button className={`tab ${tab==='todos' ? 'active' : ''}`} onClick={() => setTab('todos')}><Layers size={14}/> Todos</button>
					<button className={`tab ${tab==='baixados' ? 'active' : ''}`} onClick={() => setTab('baixados')}><CheckCircle2 size={14}/> Baixados</button>
					<button className={`tab ${tab==='pendentes' ? 'active' : ''}`} onClick={() => setTab('pendentes')}><DownloadIcon size={14}/> Pendentes</button>
				</div>

				{/* Stats below header, outside main div */}
				{filtered.length > 0 && (
					<div className="mods-stats">
						<span className="stat-item joao total"><ListChecks size={14}/> Total: {total}</span>
						<span className="stat-item joao active"><DownloadIcon size={14}/> A baixar: {toDownload}</span>
						<span className="stat-item joao done"><CheckCircle2 size={14}/> Baixados: {completed}</span>
					</div>
				)}
				</div>

			{loading ? (
				<div className="loading-container"><div className="spinner"/><p>Carregando fila...</p></div>
			) : filtered.length === 0 ? (
				<div className="empty-state"><div className="empty-icon">📥</div><h3>Nenhum item na fila</h3></div>
			) : (
				<div className="queue-list scrollable">
					{(tab === 'baixados' ? completedItems : (tab === 'pendentes' ? pendingItems : [...pendingItems, ...completedItems])).map(item => (
						<div key={item.id} className={`queue-item status-${typeof item.status === 'string' ? item.status.toLowerCase() : 'failed'}`}>
							<div className="queue-main">
								<div className="queue-title">{item.mod_name} <span className="queue-version">v{item.version}</span></div>
								<div className="status">{typeof item.status === 'string' ? item.status : 'Failed'}</div>
							</div>
							<div className="progress">
								<div className="bar" style={{ width: `${Math.floor(item.progress * 100)}%` }} />
							</div>
							{typeof item.status === 'string' && item.status === 'Downloading' && (
								<div className="meta-row">
									<span className="speed">{fmtSpeed(item.speed_bps)}</span>
									<span className="eta">{item.eta_secs != null ? `ETA ${fmtEta(item.eta_secs)}` : ''}</span>
								</div>
							)}
							<div className="actions">
								{typeof item.status === 'string' && item.status === 'Paused' ? (
									<button onClick={() => resume(item.id)} title="Retomar"><Play size={16}/></button>
								) : (
									<button onClick={() => pause(item.id)} title="Pausar"><Pause size={16}/></button>
								)}
								<button onClick={() => prioritize(item.id)} title="Priorizar"><ArrowUp size={16}/></button>
								<button onClick={() => remove(item.id)} title="Remover"><Trash2 size={16}/></button>
							</div>
						</div>
					))}
					{tab !== 'baixados' && paused.length > 0 && (
						<div className="paused-section">
							<div className="paused-header"><Pause size={14}/> Pausados</div>
							{paused.map(item => (
								<div key={item.id} className={`queue-item status-paused`}>
									<div className="queue-main">
										<div className="queue-title">{item.mod_name} <span className="queue-version">v{item.version}</span></div>
										<div className="status">Paused</div>
									</div>
									<div className="progress">
										<div className="bar" style={{ width: `${Math.floor(item.progress * 100)}%` }} />
									</div>
									<div className="actions">
										<button onClick={() => resume(item.id)} title="Retomar"><Play size={16}/></button>
										<button onClick={() => prioritize(item.id)} title="Priorizar"><ArrowUp size={16}/></button>
										<button onClick={() => remove(item.id)} title="Remover"><Trash2 size={16}/></button>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
