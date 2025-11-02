import { Pause, Play, ArrowUp, Trash2, CheckCircle2, Download as DownloadIcon, ListChecks, XCircle, Ban } from 'lucide-react';
import { useDownloadQueue } from '../hooks/useDownloadQueue';
import { useProfiles } from '../context/ProfileContext';
import '../styles/DownloadQueue.css';

export default function DownloadQueueView() {
	const { items, loading, pauseAll, resumeAll, pause, resume, remove, prioritize, clearAll, cancelAll } = useDownloadQueue();
	const { activeProfile } = useProfiles();
	
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
	const pausedItems = filtered.filter(i => typeof i.status === 'string' && i.status === 'Paused');
	
	// Primeiro item em download ou o primeiro da fila
	const currentDownload = downloadingItems[0] || queuedItems[0] || pausedItems[0];
	const upcomingDownloads = [...downloadingItems.slice(1), ...queuedItems, ...pausedItems].filter(item => item.id !== currentDownload?.id);

	const total = filtered.length;
	const completed = completedItems.length;
	const toDownload = filtered.filter(i => typeof i.status === 'string' && (i.status === 'Queued' || i.status === 'Paused' || i.status === 'Downloading')).length;

	return (
		<div className="download-queue-view">
			<div className="header">
				<div className="header-left">
					<h2>Fila de Download</h2>
					{filtered.length > 0 && (
						<div className="mods-stats">
							<span className="stat-item total"><ListChecks size={14} /> Total: {total}</span>
							<span className="stat-item active"><DownloadIcon size={14} /> A baixar: {toDownload}</span>
							<span className="stat-item done"><CheckCircle2 size={14} /> Baixados: {completed}</span>
						</div>
					)}
				</div>
				<div className="header-info">
					<button className="pause-all-button" onClick={() => pauseAll()}><Pause size={14} />Pausar Todos</button>
					<button className="resume-all-button" onClick={() => resumeAll()}><Play size={14} />Retomar Todos</button>
					<button className="cancel-all-button" onClick={() => cancelAll()}><Ban size={14} />Cancelar Todos</button>
					<button className="clear-button" onClick={() => clearAll()} title="Limpar Fila"><XCircle size={14} />Limpar</button>
				</div>
			</div>

			{loading ? (
				<div className="loading-container"><div className="spinner" /><p>Carregando fila...</p></div>
			) : filtered.length === 0 ? (
				<div className="empty-state"><div className="empty-icon">📥</div><h3>Nenhum item na fila</h3></div>
			) : (
				<div className="queue-content">
					{/* Card Principal - Download Atual */}
					{currentDownload && (
						<div className="current-download-section">
							<h3 className="section-title">Download Atual</h3>
							<div className={`current-download-card status-${typeof currentDownload.status === 'string' ? currentDownload.status.toLowerCase() : 'failed'}`}>
								<div className="download-info">
									<div className="download-title">{currentDownload.mod_name}</div>
									<div className="download-version">v{currentDownload.version}</div>
									<div className="download-status">{typeof currentDownload.status === 'string' ? currentDownload.status : 'Failed'}</div>
								</div>
								
								<div className="download-progress">
									<div className="progress-bar">
										<div className="progress-fill" style={{ width: `${Math.floor(currentDownload.progress * 100)}%` }} />
									</div>
									<div className="progress-text">{Math.floor(currentDownload.progress * 100)}%</div>
								</div>
								
								{typeof currentDownload.status === 'string' && currentDownload.status === 'Downloading' && (
									<div className="download-meta">
										<span className="download-speed">{fmtSpeed(currentDownload.speed_bps)}</span>
										<span className="download-eta">{currentDownload.eta_secs != null ? `ETA ${fmtEta(currentDownload.eta_secs)}` : ''}</span>
									</div>
								)}
								
								<div className="download-actions">
									{typeof currentDownload.status === 'string' && currentDownload.status === 'Paused' ? (
										<button className="action-btn resume" onClick={() => resume(currentDownload.id)} title="Retomar">
											<Play size={18} /> Retomar
										</button>
									) : (
										<button className="action-btn pause" onClick={() => pause(currentDownload.id)} title="Pausar">
											<Pause size={18} /> Pausar
										</button>
									)}
									<button className="action-btn remove" onClick={() => remove(currentDownload.id)} title="Remover">
										<Trash2 size={18} /> Remover
									</button>
								</div>
							</div>
						</div>
					)}

					{/* Próximos Downloads */}
					{upcomingDownloads.length > 0 && (
						<div className="upcoming-downloads-section">
							<h3 className="section-title">Próximos Downloads ({upcomingDownloads.length})</h3>
							<div className="upcoming-downloads-list">
								{upcomingDownloads.map(item => (
									<div key={item.id} className={`upcoming-item status-${typeof item.status === 'string' ? item.status.toLowerCase() : 'failed'}`}>
										<div className="item-info">
											<div className="item-title">{item.mod_name}</div>
											<div className="item-version">v{item.version}</div>
										</div>
										<div className="item-status">{typeof item.status === 'string' ? item.status : 'Failed'}</div>
										<div className="item-actions">
											<button onClick={() => prioritize(item.id)} title="Priorizar"><ArrowUp size={16} /></button>
											<button onClick={() => remove(item.id)} title="Remover"><Trash2 size={16} /></button>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Downloads Concluídos */}
					{completedItems.length > 0 && (
						<div className="completed-downloads-section">
							<h3 className="section-title">Concluídos ({completedItems.length})</h3>
							<div className="completed-downloads-list">
								{completedItems.map(item => (
									<div key={item.id} className="completed-item">
										<div className="item-info">
											<div className="item-title">{item.mod_name}</div>
											<div className="item-version">v{item.version}</div>
										</div>
										<div className="completion-badge">
											<CheckCircle2 size={16} />
											Concluído
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
