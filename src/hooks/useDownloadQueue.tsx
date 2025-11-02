import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type DownloadStatus = 'Queued' | 'Downloading' | 'Paused' | 'Completed' | 'Removed' | { Failed: string };

export interface DownloadItem {
	id: string;
	mod_name: string;
	version: string;
	profile_name: string;
	progress: number;
	status: DownloadStatus; // keep flexible to match Rust enum
	added_at: string;
	speed_bps: number;
	eta_secs?: number | null;
}

export function useDownloadQueue() {
	const [items, setItems] = useState<DownloadItem[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const data = await invoke<DownloadItem[]>('get_download_queue');
			setItems(data);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		refresh();
		const unlistenPromise = listen<DownloadItem[]>('download-queue:update', (e) => {
			setItems(e.payload);
		});
		return () => {
			unlistenPromise.then((u) => u());
		};
	}, [refresh]);

	const enqueue = useCallback(async (mod_name: string, version: string, profile_name: string) => {
		return invoke<string>('enqueue_download', { modName: mod_name, version, profileName: profile_name });
	}, []);

	const pauseAll = useCallback(() => invoke('pause_all_downloads'), []);
	const resumeAll = useCallback(() => invoke('resume_all_downloads'), []);
	const pause = useCallback((id: string) => invoke('pause_download', { id }), []);
	const resume = useCallback((id: string) => invoke('resume_download', { id }), []);
	const remove = useCallback((id: string) => invoke('remove_from_queue', { id }), []);
	const prioritize = useCallback((id: string) => invoke('move_to_top', { id }), []);
	const clearAll = useCallback(() => invoke('clear_download_queue'), []);
	const cancelAll = useCallback(() => invoke('cancel_all_downloads'), []);

	return { items, loading, refresh, enqueue, pauseAll, resumeAll, pause, resume, remove, prioritize, clearAll, cancelAll };
}
