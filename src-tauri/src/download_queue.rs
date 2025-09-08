
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{State, AppHandle, Emitter};
use uuid::Uuid;
use std::fs;
use std::path::PathBuf;
use tokio::time::Instant;
use tokio::sync::oneshot;
use reqwest::Client;
use futures_util::StreamExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DownloadStatus {
	Queued,
	Downloading,
	Paused,
	Completed,
	Failed(String),
	Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
	pub id: String,
	pub mod_name: String,
	pub version: String,
	pub profile_name: String,
	pub progress: f32, // 0.0 to 1.0
	pub status: DownloadStatus,
	pub added_at: String,
	pub speed_bps: f64,
	pub eta_secs: Option<u64>,
}

#[derive(Default, Clone)]
pub struct DownloadQueueManager {
	pub queue: Arc<Mutex<Vec<DownloadItem>>>,
	pub paused_all: Arc<Mutex<bool>>,
	pub persist_path: Arc<Mutex<Option<PathBuf>>>,
	pub cancel_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

impl DownloadQueueManager {
	pub(crate) fn emit_update(&self, app: &AppHandle) {
		if let Ok(q) = self.queue.lock() {
			let _ = app.emit("download-queue:update", &*q);
		}
	}

	// Compare two dotted version strings (e.g., 1.0.2 > 1.0.1)
	fn cmp_versions(a: &str, b: &str) -> std::cmp::Ordering {
		let pa: Vec<i64> = a.split('.').map(|s| s.parse::<i64>().unwrap_or(0)).collect();
		let pb: Vec<i64> = b.split('.').map(|s| s.parse::<i64>().unwrap_or(0)).collect();
		let max_len = pa.len().max(pb.len());
		for i in 0..max_len {
			let ai = *pa.get(i).unwrap_or(&0);
			let bi = *pb.get(i).unwrap_or(&0);
			match ai.cmp(&bi) { std::cmp::Ordering::Equal => continue, ord => return ord }
		}
		std::cmp::Ordering::Equal
	}

	// Remove any queued/paused entries for same mod/profile that are lower than keep_version
	fn remove_lower_versions(&self, mod_name: &str, profile_name: &str, keep_version: &str) {
		if let Ok(mut q) = self.queue.lock() {
			q.retain(|i| {
				if i.mod_name == mod_name && i.profile_name == profile_name {
					// If different version and lower than keep, drop it when not completed/downloading
					if i.version != keep_version {
						let is_protected = matches!(i.status, DownloadStatus::Downloading | DownloadStatus::Completed);
						return is_protected || Self::cmp_versions(&i.version, keep_version) != std::cmp::Ordering::Less;
					}
				}
				true
			});
		}
	}

	// Programmatic enqueue used by dependency resolver/background tasks
	pub fn enqueue_item_direct(&self, app: &AppHandle, mod_name: String, version: String, profile_name: String) -> String {
		// Clean lower versions queued for same mod/profile
		self.remove_lower_versions(&mod_name, &profile_name, &version);
		let id = Uuid::new_v4().to_string();
		if let Ok(mut q) = self.queue.lock() {
			q.push(DownloadItem {
				id: id.clone(),
				mod_name: mod_name.clone(),
				version: version.clone(),
				profile_name: profile_name.clone(),
				progress: 0.0,
				status: DownloadStatus::Queued,
				added_at: chrono::Utc::now().to_rfc3339(),
				speed_bps: 0.0,
				eta_secs: None,
			});
		}
		self.save_persist();
		self.emit_update(app);
		DownloadQueueManager::start_next_if_idle_owned(self.clone(), app.clone());
		id
	}

	pub fn start_next_if_idle_owned(manager: DownloadQueueManager, app: AppHandle) {
		let paused_all = *manager.paused_all.lock().unwrap();
		if paused_all { return; }
		let mut q = manager.queue.lock().unwrap();
		let is_downloading = q.iter().any(|i| matches!(i.status, DownloadStatus::Downloading));
		if is_downloading { return; }
		if let Some(next) = q.iter_mut().find(|i| matches!(i.status, DownloadStatus::Queued)) {
			next.status = DownloadStatus::Downloading;
			next.progress = 0.0;
			let item = next.clone();
			drop(q);
			manager.emit_update(&app);
			// Spawn async task to perform the download
			let app_handle = app.clone();
			let mgr_clone = manager.clone();
			tauri::async_runtime::spawn(async move {
				let result = stream_download(&mgr_clone, &app_handle, &item).await;
				let mut q = mgr_clone.queue.lock().unwrap();
				if let Some(entry) = q.iter_mut().find(|i| i.id == item.id) {
					match result {
						Ok(_) => { entry.status = DownloadStatus::Completed; entry.progress = 1.0; entry.speed_bps = 0.0; entry.eta_secs = None; },
						Err(e) => { entry.status = DownloadStatus::Failed(e); }
					}
				}
				drop(q);
				mgr_clone.save_persist();
				mgr_clone.emit_update(&app_handle);
				DownloadQueueManager::start_next_if_idle_owned(mgr_clone, app_handle);
			});
		}
	}

	fn persist_path_init(&self) -> PathBuf {
		if let Some(p) = self.persist_path.lock().unwrap().clone() { return p; }
		let data_dir = dirs::data_dir().unwrap_or(std::env::temp_dir()).join("ModManager");
		let _ = fs::create_dir_all(&data_dir);
		let path = data_dir.join("download-queue.json");
		*self.persist_path.lock().unwrap() = Some(path.clone());
		path
	}

	fn save_persist(&self) {
		let path = self.persist_path_init();
		if let Ok(q) = self.queue.lock() {
			if let Ok(json) = serde_json::to_string_pretty(&*q) { let _ = fs::write(path, json); }
		}
	}

	pub fn load_persist(&self) {
		let path = self.persist_path_init();
		if let Ok(content) = fs::read_to_string(path) {
			if let Ok(list) = serde_json::from_str::<Vec<DownloadItem>>(&content) {
				// Normalize statuses that can't be resumed mid-stream
				let mut normalized = list;
				for item in &mut normalized {
					if matches!(item.status, DownloadStatus::Downloading) {
						item.status = DownloadStatus::Queued;
						item.progress = 0.0;
						item.speed_bps = 0.0;
						item.eta_secs = None;
					}
				}
				*self.queue.lock().unwrap() = normalized;
			}
		}
	}
}

#[tauri::command]
pub fn clear_download_queue(app: AppHandle, state: State<DownloadQueueManager>) -> Result<String, String> {
	// Pause all and cancel any in-flight download
	*state.paused_all.lock().map_err(|_| "Falha ao pausar")? = true;
	if let Some(tx) = state.cancel_tx.lock().unwrap().take() { let _ = tx.send(()); }
	// Clear queue
	if let Ok(mut q) = state.queue.lock() {
		q.clear();
	}
	state.save_persist();
	state.emit_update(&app);
	Ok("Fila limpa".into())
}

#[tauri::command]
pub fn enqueue_download(
	app: AppHandle,
	state: State<DownloadQueueManager>,
	mod_name: String,
	version: String,
	profile_name: String,
) -> Result<String, String> {
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	let id = Uuid::new_v4().to_string();
	let item = DownloadItem {
		id: id.clone(),
		mod_name,
		version,
		profile_name,
		progress: 0.0,
		status: DownloadStatus::Queued,
		added_at: chrono::Utc::now().to_rfc3339(),
		speed_bps: 0.0,
		eta_secs: None,
	};
	q.push(item);
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	DownloadQueueManager::start_next_if_idle_owned(state.inner().clone(), app);
	Ok(id)
}

#[tauri::command]
pub fn get_download_queue(state: State<DownloadQueueManager>) -> Result<Vec<DownloadItem>, String> {
	let q = state.queue.lock().map_err(|_| "Falha ao ler fila")?;
	Ok(q.clone())
}

#[tauri::command]
pub fn pause_all_downloads(app: AppHandle, state: State<DownloadQueueManager>) -> Result<String, String> {
	*state.paused_all.lock().map_err(|_| "Falha ao pausar")? = true;
	// Cancelar download em andamento (rudimentar)
	if let Some(tx) = state.cancel_tx.lock().unwrap().take() { let _ = tx.send(()); }
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	for item in q.iter_mut() {
		if matches!(item.status, DownloadStatus::Downloading | DownloadStatus::Queued) {
			item.status = DownloadStatus::Paused;
		}
	}
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	Ok("Todos os downloads pausados".into())
}

#[tauri::command]
pub fn resume_all_downloads(app: AppHandle, state: State<DownloadQueueManager>) -> Result<String, String> {
	*state.paused_all.lock().map_err(|_| "Falha ao retomar")? = false;
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	for item in q.iter_mut() {
		if matches!(item.status, DownloadStatus::Paused) {
			item.status = DownloadStatus::Queued;
		}
	}
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	DownloadQueueManager::start_next_if_idle_owned(state.inner().clone(), app);
	Ok("Downloads retomados".into())
}

#[tauri::command]
pub fn pause_download(app: AppHandle, state: State<DownloadQueueManager>, id: String) -> Result<String, String> {
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	if let Some(item) = q.iter_mut().find(|i| i.id == id) {
		if !matches!(item.status, DownloadStatus::Completed | DownloadStatus::Failed(_)) {
			item.status = DownloadStatus::Paused;
		}
	}
	drop(q);
	// Cancelar download em andamento se for o mesmo
	if let Some(tx) = state.cancel_tx.lock().unwrap().take() { let _ = tx.send(()); }
	state.save_persist();
	state.emit_update(&app);
	Ok("Download pausado".into())
}

#[tauri::command]
pub fn resume_download(app: AppHandle, state: State<DownloadQueueManager>, id: String) -> Result<String, String> {
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	if let Some(item) = q.iter_mut().find(|i| i.id == id) {
		if matches!(item.status, DownloadStatus::Paused | DownloadStatus::Failed(_)) {
			item.status = DownloadStatus::Queued;
		}
	}
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	DownloadQueueManager::start_next_if_idle_owned(state.inner().clone(), app);
	Ok("Download retomado".into())
}

#[tauri::command]
pub fn remove_from_queue(app: AppHandle, state: State<DownloadQueueManager>, id: String) -> Result<String, String> {
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	q.retain(|i| i.id != id);
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	DownloadQueueManager::start_next_if_idle_owned(state.inner().clone(), app);
	Ok("Removido da fila".into())
}

#[tauri::command]
pub fn move_to_top(app: AppHandle, state: State<DownloadQueueManager>, id: String) -> Result<String, String> {
	let mut q = state.queue.lock().map_err(|_| "Falha ao bloquear fila")?;
	if let Some(pos) = q.iter().position(|i| i.id == id) {
		let mut item = q.remove(pos);
		if !matches!(item.status, DownloadStatus::Completed) {
			item.status = DownloadStatus::Queued;
		}
		q.insert(0, item);
	}
	drop(q);
	state.save_persist();
	state.emit_update(&app);
	DownloadQueueManager::start_next_if_idle_owned(state.inner().clone(), app);
	Ok("Movido para o topo".into())
}

async fn stream_download(manager: &DownloadQueueManager, app: &AppHandle, item: &DownloadItem) -> Result<(), String> {
	// Paths e arquivo de destino
	let profiles_dir = super::get_profiles_dir_pub()?;
	let profile_dir = profiles_dir.join(&item.profile_name);
	let mods_dir = profile_dir.join("mods");
	if !mods_dir.exists() { fs::create_dir_all(&mods_dir).map_err(|e| e.to_string())?; }

	// URL de download e destino
	let anticache = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs_f64();
	let url = format!("https://mods-storage.re146.dev/{}/{}.zip?anticache={}", item.mod_name, item.version, anticache);
	let file_name = format!("{}_{}.zip", item.mod_name, item.version);
	let dest_path = mods_dir.join(&file_name);

	// Remover versões anteriores
	if let Ok(entries) = fs::read_dir(&mods_dir) { for entry in entries.flatten() {
		let entry_name = entry.file_name().to_string_lossy().to_string();
		if entry_name.starts_with(&format!("{}_", item.mod_name)) && entry_name.ends_with(".zip") && entry_name != file_name {
			let _ = fs::remove_file(entry.path());
		}
	}}

	let client = Client::builder()
		.pool_max_idle_per_host(1)
		.tcp_keepalive(std::time::Duration::from_secs(30))
		.build()
		.map_err(|e| format!("Erro ao criar cliente HTTP: {}", e))?;

	// Preflight: tentar obter tamanho total e suporte a Accept-Ranges
	let mut total_known: Option<u64> = None;
	let mut supports_range: bool = false;
	if let Ok(head) = client.head(&url).send().await {
		if head.status().is_success() {
			if let Some(len) = head.headers().get(reqwest::header::CONTENT_LENGTH) {
				if let Ok(s) = len.to_str() { if let Ok(v) = s.parse::<u64>() { total_known = Some(v); } }
			}
			if let Some(ar) = head.headers().get("accept-ranges") {
				if let Ok(s) = ar.to_str() { if s.to_ascii_lowercase().contains("bytes") { supports_range = true; } }
			}
		}
	}

	// Tentar retomar em caso de travamento usando Range
	async fn start_request_with_range(client: &Client, url: &str, start_at: u64) -> Result<(Option<u64>, Option<u64>, reqwest::Response, bool), String> {
		let mut req = client.get(url);
		if start_at > 0 {
			req = req.header(reqwest::header::RANGE, format!("bytes={}-", start_at));
		}
		let resp = req.send().await.map_err(|e| format!("Erro no download: {}", e))?;
		if !(resp.status().is_success() || resp.status() == reqwest::StatusCode::PARTIAL_CONTENT) {
			return Err(format!("Erro HTTP: {}", resp.status()));
		}
		let mut total_all = None;
		if let Some(hv) = resp.headers().get(reqwest::header::CONTENT_RANGE) {
			if let Ok(s) = hv.to_str() {
				if let Some(idx) = s.rfind('/') {
					if let Ok(v) = s[idx+1..].parse::<u64>() { total_all = Some(v); }
				}
			}
		} else if start_at == 0 {
			total_all = resp.content_length();
		}
		let remaining = resp.content_length();
		// Range honrado se status 206 ou header Content-Range presente
		let honored = resp.status() == reqwest::StatusCode::PARTIAL_CONTENT
			|| resp.headers().get(reqwest::header::CONTENT_RANGE).is_some();
		Ok((total_all, remaining, resp, honored))
	}

	let mut total_remaining: Option<u64> = None;
	// Stream atual
	let mut stream;
	// Iniciar primeira requisição
	let (tot_all, remaining, resp0, _honored0) = start_request_with_range(&client, &url, 0).await?;
	if total_known.is_none() { total_known = tot_all; }
	total_remaining = remaining;
	stream = resp0.bytes_stream();
	let file = tokio::fs::File::create(&dest_path).await.map_err(|e| e.to_string())?;
	let mut file = tokio::io::BufWriter::with_capacity(1024 * 1024, file); // 1 MiB buffer

	let start = Instant::now();
	let mut downloaded: u64 = 0;
	let mut last_emit = Instant::now();
	let mut last_emit_bytes: u64 = 0;
	let min_emit_interval = std::time::Duration::from_millis(200);
	let min_emit_bytes: u64 = 256 * 1024; // 256KB
	let mut retries: u32 = 0;
	let max_retries: u32 = 5;
	let (tx, mut rx) = oneshot::channel::<()>();
	{
		let mut c = manager.cancel_tx.lock().unwrap();
		*c = Some(tx);
	}

	loop {
		tokio::select! {
			chunk = tokio::time::timeout(std::time::Duration::from_secs(20), stream.next()) => {
				match chunk {
					Ok(Some(Ok(bytes))) => {
						use tokio::io::AsyncWriteExt;
						let slice = bytes.as_ref();
						file.write_all(slice).await.map_err(|e| e.to_string())?;
						downloaded += slice.len() as u64;

						// Throttle progress updates to reduce CPU and UI churn
						let should_emit = last_emit.elapsed() >= min_emit_interval
							|| (downloaded - last_emit_bytes) >= min_emit_bytes;
						// Determine totals for progress if known
						let total_all = total_known.or(total_remaining.map(|r| r.saturating_add(downloaded))).unwrap_or(0);
						if should_emit || (total_known.is_some() && downloaded == total_all) {
							let elapsed_total = start.elapsed().as_secs_f64();
							let interval_secs = last_emit.elapsed().as_secs_f64();
							// Instant speed based on recent interval; fallback to total
							let interval_bytes = downloaded.saturating_sub(last_emit_bytes);
							let speed_interval = if interval_secs>0.0 { interval_bytes as f64 / interval_secs } else { 0.0 };
							let speed_total = if elapsed_total>0.0 { downloaded as f64 / elapsed_total } else { 0.0 };
							let speed = if speed_interval > 0.0 { speed_interval } else { speed_total };
							let progress = if total_all>0 { downloaded as f32 / total_all as f32 } else { 0.0 };
							let eta = if speed>0.0 && total_all>0 { Some(((total_all - downloaded) as f64 / speed) as u64) } else { None };

							let mut q = manager.queue.lock().unwrap();
							if let Some(entry) = q.iter_mut().find(|i| i.id == item.id) {
								entry.progress = progress;
								entry.speed_bps = speed;
								entry.eta_secs = eta;
							}
							drop(q);
							manager.emit_update(app);
							last_emit = Instant::now();
							last_emit_bytes = downloaded;
						}
					},
					Ok(Some(Err(e))) => return Err(format!("Erro no stream: {}", e)),
					Ok(None) => break,
					Err(_) => {
						// Timeout sem receber bytes: tentar retomar com Range
						// Flush buffer antes de retomar
						use tokio::io::AsyncWriteExt;
						file.flush().await.map_err(|e| e.to_string())?;
						if retries >= max_retries {
							return Err("Tempo esgotado ao baixar (muitas tentativas de retomada)".into());
						}
						retries += 1;
						if supports_range {
							if let Ok((tot_all, remaining, resp_new, honored)) = start_request_with_range(&client, &url, downloaded).await {
								if honored {
									if total_known.is_none() { total_known = tot_all; }
									total_remaining = remaining;
									stream = resp_new.bytes_stream();
									last_emit = Instant::now();
									last_emit_bytes = downloaded;
									continue;
								}
								// Servidor ignorou Range: fazer fallback para reiniciar
							}
						}
						// Fallback: reiniciar download completo (truncate)
						drop(file);
						let base_file = tokio::fs::File::create(&dest_path).await.map_err(|e| e.to_string())?;
						file = tokio::io::BufWriter::with_capacity(1024 * 1024, base_file);
						downloaded = 0;
						last_emit = Instant::now();
						last_emit_bytes = 0;
						if let Ok((tot_all, remaining, resp_new, _)) = start_request_with_range(&client, &url, 0).await {
							if total_known.is_none() { total_known = tot_all; }
							total_remaining = remaining;
							stream = resp_new.bytes_stream();
							continue;
						} else {
							return Err("Falha ao reiniciar download".into());
						}
					}
				}
			},
			_ = &mut rx => {
				// cancelado
				return Err("Cancelado".into());
			}
		}
		// Yield occasionally if neither branch did heavy work to reduce CPU
		tokio::task::yield_now().await;
	}

	// Ensure buffered writer flushes to disk
	use tokio::io::AsyncWriteExt;
	file.flush().await.map_err(|e| e.to_string())?;

	// Atualizar listas JSON de controle
	let factorio_version = super::get_factorio_version_for(item.mod_name.clone(), item.version.clone()).await?;
	super::add_mod_to_lists(&profile_dir, &item.mod_name, &item.version, &file_name, &factorio_version)?;

	Ok(())
}
