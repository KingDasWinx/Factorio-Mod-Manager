use std::collections::{HashMap, VecDeque, HashSet};
use tauri::{AppHandle, State, Emitter};
use serde::{Deserialize, Serialize};

use crate::{fetch_mod_full, ModFullData};
use crate::download_queue::DownloadQueueManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolveRequest {
	pub root_mod: String,
	pub version: String,
	pub profile_name: String,
}

#[tauri::command]
pub async fn resolve_and_enqueue_dependencies(
	app: AppHandle,
	state: State<'_, DownloadQueueManager>,
	root_mod: String,
	version: String,
	profile_name: String,
) -> Result<String, String> {
	// Announce start
	let _ = app.emit("dependency-resolver:started", &serde_json::json!({
		"root_mod": root_mod,
		"version": version,
		"profile_name": profile_name,
	}));
	// Build a map of required minimal versions per mod
	let mut required: HashMap<String, String> = HashMap::new();
	// In-memory cache of full mod data to avoid repeated network calls within this run
	let mut full_cache: HashMap<String, ModFullData> = HashMap::new();
	// Track which mods were already processed in this run
	let mut processed: HashSet<String> = HashSet::new();
	// Track the chosen concrete version per mod (built during traversal)
	let mut chosen: HashMap<String, String> = HashMap::new();

	// Helper: compare dotted semantic versions
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

	// Record a requirement for name to be at least ver
	fn record_req(required: &mut HashMap<String, String>, name: &str, ver: &str, cmp: fn(&str,&str)->std::cmp::Ordering) {
		let key = name.to_string();
		if let Some(existing) = required.get(&key) {
			if cmp(ver, existing) == std::cmp::Ordering::Greater {
				required.insert(key, ver.to_string());
			}
		} else {
			required.insert(key, ver.to_string());
		}
	}

	// Resolve dependencies breadth-first; carry parent mod and its Factorio version for selection
	// Queue tuple: (mod_name, requested_or_min_version, parent_mod_name, parent_factorio_version)
	let mut queue: VecDeque<(String, String, Option<String>, Option<String>)> = VecDeque::new();
	queue.push_back((root_mod.clone(), version.clone(), None, None));
	// Also record the root requirement
	record_req(&mut required, &root_mod, &version, cmp_versions);
	// Track which parent introduced a dependency (best effort)
	let mut parents: HashMap<String, String> = HashMap::new();

	let mut processed_count: usize = 0;

	while let Some((name, ver, parent, parent_fv)) = queue.pop_front() {
		// Skip if we've already processed this mod
		if processed.contains(&name) {
			continue;
		}

		// Fetch full mod metadata with context (cached)
		let full: ModFullData = if let Some(cached) = full_cache.get(&name) {
			cached.clone()
		} else {
			match fetch_mod_full(name.clone()).await {
				Ok(f) => { full_cache.insert(name.clone(), f.clone()); f },
				Err(e) => {
					let parent_mod = parent.clone().or_else(|| parents.get(&name).cloned());
					let msg = if let Some(pm) = &parent_mod {
						format!("Falha ao buscar metadados do mod '{}' (requisito '{}', pai '{}'): {}", name, ver, pm, e)
					} else {
						format!("Falha ao buscar metadados do mod '{}' (requisito '{}'): {}", name, ver, e)
					};
					let _ = app.emit("dependency-resolver:error", &serde_json::json!({
						"root_mod": root_mod,
						"stage": "fetch",
						"mod": name,
						"requirement": ver,
						"parent_mod": parent_mod,
						"message": msg,
					}));
					return Err(msg);
				}
			}
		};
	// Choose the release to expand
	// Root: exact version chosen by user
	// Dependency: latest release compatible with the Factorio version of the parent mod
	let rel = if name == root_mod && ver == version {
			match full.releases.iter().find(|r| r.version == ver) {
				Some(r) => r,
				None => {
					let parent_mod = parent.clone().or_else(|| parents.get(&name).cloned());
					let msg = if let Some(pm) = &parent_mod {
						format!("Versão {} não encontrada para {} (pai '{}')", ver, name, pm)
					} else {
						format!("Versão {} não encontrada para {}", ver, name)
					};
					let _ = app.emit("dependency-resolver:error", &serde_json::json!({
						"root_mod": root_mod,
						"stage": "select_release",
						"mod": name,
						"requirement": ver,
						"parent_mod": parent_mod,
						"message": msg,
					}));
					return Err(msg);
				}
			}
		} else {
			if let Some(fv) = parent_fv.as_ref() {
				match full
					.releases
					.iter()
					.filter(|r| &r.info_json.factorio_version == fv)
					.max_by(|a, b| cmp_versions(&a.version, &b.version))
				{
					Some(r) => r,
					None => {
						let parent_mod = parent.clone().or_else(|| parents.get(&name).cloned());
						let msg = if let Some(pm) = &parent_mod {
							format!(
								"Nenhuma versão encontrada para {} compatível com Factorio {} (pai '{}')",
								name, fv, pm
							)
						} else {
							format!(
								"Nenhuma versão encontrada para {} compatível com Factorio {}",
								name, fv
							)
						};
						let _ = app.emit("dependency-resolver:error", &serde_json::json!({
							"root_mod": root_mod,
							"stage": "select_release",
							"mod": name,
							"requirement": ver,
							"parent_mod": parent_mod,
							"message": msg,
						}));
						return Err(msg);
					}
				}
			} else {
				// Should not happen: dependencies must carry parent Factorio version
				let parent_mod = parent.clone().or_else(|| parents.get(&name).cloned());
				let msg = if let Some(pm) = &parent_mod {
					format!("Dependência '{}' não recebeu versão do Factorio do pai '{}'", name, pm)
				} else {
					format!("Dependência '{}' não recebeu versão do Factorio do pai", name)
				};
				let _ = app.emit("dependency-resolver:error", &serde_json::json!({
					"root_mod": root_mod,
					"stage": "select_release",
					"mod": name,
					"requirement": ver,
					"parent_mod": parent_mod,
					"message": msg,
				}));
				return Err(msg);
			}
		};

		// Record chosen concrete version and mark processed
		chosen.insert(name.clone(), rel.version.clone());
		processed.insert(name.clone());

	// Parse dependencies
		if let Some(deps) = &rel.info_json.dependencies {
			for raw in deps {
				let dep = raw.trim();
				if dep == "base" || dep.starts_with("base ") { continue; }
				// ignore incompatible/optional markers in different notations: '!', '?', '(?) ', '(!) '
				if dep.starts_with('!') || dep.starts_with('?') || dep.starts_with("(?)") || dep.starts_with("(!)") { continue; }

				// formats: "mod name", "mod name >= x.y.z", optional markers like '~', '?', '(?)', '(!)'
				// Remove leading markers
				let mut clean = dep.trim_start_matches('~').trim();
				if clean.starts_with("(?)") { clean = clean.trim_start_matches("(?)").trim(); }
				if clean.starts_with("(!)") { clean = clean.trim_start_matches("(!)").trim(); }
				if clean.starts_with("? ") { clean = clean.trim_start_matches("? ").trim(); }
				if clean.starts_with('?') { clean = clean.trim_start_matches('?').trim(); }

				// Determine name and minimal version by locating operator tokens
				let (dep_name, min_ver) = if let Some(idx) = clean.find(">=") {
					let name_part = &clean[..idx];
					let ver_part = &clean[idx+2..];
					(name_part.trim().to_string(), ver_part.trim().to_string())
				} else if let Some(idx) = clean.find('=') {
					let name_part = &clean[..idx];
					let ver_part = &clean[idx+1..];
					(name_part.trim().to_string(), ver_part.trim().to_string())
				} else {
					(clean.to_string(), "0.0.1".to_string())
				};

				// Skip base game regardless of operator (e.g., "base>=1.1.100")
				if dep_name.eq_ignore_ascii_case("base") { continue; }

				// Record and expand
				record_req(&mut required, &dep_name, &min_ver, cmp_versions);
				// Track parent for this dependency (keep first introducer)
				parents.entry(dep_name.clone()).or_insert_with(|| name.clone());
				// Enqueue dependency carrying this mod's Factorio version as the parent version
				queue.push_back((dep_name.clone(), min_ver.clone(), Some(name.clone()), Some(rel.info_json.factorio_version.clone())));
			}
		}

		processed_count += 1;
		// Emit progress (approximate)
		let discovered_count = required.len();
		let pending_count = queue.len();
		let approx_total = processed_count + pending_count;
		let percent = if approx_total > 0 {
			(processed_count as f32 / approx_total as f32) * 100.0
		} else { 100.0 };
		let _ = app.emit("dependency-resolver:progress", &serde_json::json!({
			"root_mod": root_mod,
			"current": {"name": name, "version": ver},
			"processed": processed_count,
			"discovered": discovered_count,
			"pending": pending_count,
			"percent": percent,
		}));
	}

	// Build final plan from the chosen concrete versions discovered during traversal
	let mut plan: Vec<(String, String)> = Vec::new();
	for (name, ver) in chosen.iter() {
		plan.push((name.clone(), ver.clone()));
	}

	// Enqueue everything (root included). Ensure higher overrides lower in the queue manager.
	let mgr = state.inner().clone();
	for (name, ver) in plan.iter() {
		mgr.enqueue_item_direct(&app, name.clone(), ver.clone(), profile_name.clone());
	}

	let total = plan.len();
	let deps = if total > 0 { total - 1 } else { 0 };
	let _ = app.emit("dependency-resolver:finished", &serde_json::json!({
		"root_mod": root_mod,
		"total": total,
		"dependencies": deps,
	}));

	Ok(format!("{} itens adicionados à fila (com dependências)", total))
}
