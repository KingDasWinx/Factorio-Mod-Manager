use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use chrono::Utc;
use dirs;
use regex::Regex;
mod download_queue;
mod dependency_resolver;
#[cfg(windows)]
use std::os::windows::fs::MetadataExt;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppConfig {
    cache_expiry_hours: u32,
    #[serde(default)]
    game_exe_path: Option<String>,
    // Perfil selecionado atualmente (folder_name do perfil)
    #[serde(default)]
    selected_profile: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            cache_expiry_hours: 24,
            game_exe_path: None,
            selected_profile: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModDetails {
    name: String,
    releases: Vec<ModVersionInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModVersionInfo {
    version: String,
    factorio_version: String,
    released_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModFullResponse {
    name: String,
    releases: Vec<ModRelease>,
}

// Rich "full" data structures for UI (all optional except name and releases)
#[derive(Debug, Serialize, Deserialize, Clone)]
struct FullTag { title: String }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FullInfoJson {
    factorio_version: String,
    #[serde(default)]
    dependencies: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FullRelease {
    version: String,
    released_at: String,
    info_json: FullInfoJson,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FullImage { id: String, thumbnail: String, url: String }

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModFullData {
    name: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    images: Option<Vec<FullImage>>,
    #[serde(default)]
    downloads_count: Option<u64>,
    #[serde(default)]
    score: Option<f64>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    homepage: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    tags: Option<Vec<serde_json::Value>>,
    releases: Vec<FullRelease>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModRelease {
    download_url: String,
    file_name: String,
    info_json: ModInfoJson,
    released_at: String,
    version: String,
    sha1: String,
    #[serde(default)]
    feature_flags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModInfoJson {
    factorio_version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FactorioMod {
    name: String,
    title: String,
    owner: String,
    summary: String,
    downloads_count: u64,
    latest_release: Option<ModRelease>, // Pode ser null para alguns mods
    created_at: Option<String>, // Pode não estar presente em alguns casos
    updated_at: Option<String>, // Pode não estar presente em alguns casos
    category: String,
    score: f64,
    thumbnail: Option<String>, // Da API oficial (geralmente null)
    #[serde(default)] // Se não estiver presente, usa valor padrão
    last_highlighted_at: Option<String>,
    #[serde(default)]
    requires_space_age: Option<bool>,
    // Novos campos para thumbnails melhoradas
    #[serde(default)]
    enhanced_thumbnail: Option<String>, // Da API re146.dev
    #[serde(default)]
    thumbnail_loaded: bool, // Se já tentamos carregar thumbnail
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModsPagination {
    count: u32,
    page: u32,
    page_count: u32,
    page_size: u32,
    links: PaginationLinks,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PaginationLinks {
    first: Option<String>,
    next: Option<String>,
    prev: Option<String>,
    last: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModsResponse {
    pagination: Option<ModsPagination>,
    results: Vec<FactorioMod>,
}

#[derive(Debug, Serialize)]
struct ApiError {
    error: String,
    details: Option<String>,
}

// Estruturas para gerenciamento de perfis
#[derive(Debug, Serialize, Deserialize, Clone)]
struct Profile {
    name: String,
    folder_name: String,
    created_at: String,
    last_used: String,
}

// Estruturas para os arquivos JSON de controle de mods
#[derive(Debug, Serialize, Deserialize, Clone)]
struct FactorioModListEntry {
    name: String,
    enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FactorioModList {
    mods: Vec<FactorioModListEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct InternalModEntry {
    name: String,
    version: String,
    enabled: bool,
    file_name: String,
    download_date: String,
    factorio_version: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct InternalModList {
    mods: Vec<InternalModEntry>,
    last_updated: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProfileConfig {
    profile_name: String,
    created_at: String,
    factorio_version: Option<String>,
    mod_list_enabled: bool,
    // Diretório personalizado para armazenar os mods e arquivos JSON (mod-list.json, internal-mod-list.json)
    // Se None, usa profiles/<folder>/mods
    #[serde(default)]
    mods_path: Option<String>,
    // Caminho do executável do Factorio para este perfil (opcional, pode herdar do app)
    #[serde(default)]
    factorio_exe_path: Option<String>,
    // Outras configurações específicas do perfil podem ser adicionadas aqui
}

// Estrutura para a resposta da API re146.dev
#[derive(Debug, Serialize, Deserialize)]
struct EnhancedModInfo {
    name: String,
    title: String,
    thumbnail: Option<String>, // Caminho relativo como "/assets/xxx.thumb.png"
    images: Option<Vec<ModImage>>,
    category: Option<String>,
    score: Option<f64>,
    downloads_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModImage {
    id: String,
    thumbnail: String, // URL completa da thumbnail
    url: String,       // URL completa da imagem
}

// Estruturas para o sistema de cache
#[derive(Debug, Serialize, Deserialize, Clone)]
struct CachedModsData {
    timestamp: String,
    pagination: Option<ModsPagination>,
    results: Vec<FactorioMod>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModsIndex {
    timestamp: String,
    indexes: ModIndexes,
    stats: ModStats,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModIndexes {
    by_name: HashMap<String, usize>,
    by_title: HashMap<String, Vec<usize>>,
    by_owner: HashMap<String, Vec<usize>>,
    by_category: HashMap<String, Vec<usize>>,
    by_keywords: HashMap<String, Vec<usize>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ModStats {
    total_mods: usize,
    categories: Vec<String>,
    last_update: String,
    cache_size_mb: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchFilters {
    category: Option<String>,
    factorio_version: Option<String>,
    min_downloads: Option<u64>,
    max_downloads: Option<u64>,
    min_score: Option<f64>,
    owner: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchResult {
    mods: Vec<FactorioMod>,
    total: usize,
    page: usize,
    page_size: usize,
    query: String,
    filters: SearchFilters,
}

// Funções de utilidade para gerenciamento de cache
fn get_cache_dir() -> Result<PathBuf, ApiError> {
    let cache_dir = dirs::config_dir()
        .ok_or_else(|| ApiError {
            error: "Não foi possível encontrar diretório de configuração".to_string(),
            details: None,
        })?
        .join("ModManager")
        .join("cache");
    
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| ApiError {
            error: "Erro ao criar diretório de cache".to_string(),
            details: Some(e.to_string()),
        })?;
    }
    
    Ok(cache_dir)
}

fn get_cache_file_path() -> Result<PathBuf, ApiError> {
    Ok(get_cache_dir()?.join("mods-data.json"))
}

fn get_index_file_path() -> Result<PathBuf, ApiError> {
    Ok(get_cache_dir()?.join("mods-index.json"))
}

fn is_cache_valid(cache_path: &PathBuf, max_age_hours: i64) -> bool {
    if !cache_path.exists() {
        return false;
    }
    
    match fs::metadata(cache_path) {
        Ok(metadata) => {
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.elapsed() {
                    let hours = duration.as_secs() / 3600;
                    return hours < max_age_hours as u64;
                }
            }
        }
        Err(_) => return false,
    }
    
    false
}

fn normalize_string(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

fn extract_keywords(text: &str) -> Vec<String> {
    let normalized = normalize_string(text);
    normalized
        .split_whitespace()
        .filter(|word| word.len() > 2) // Ignora palavras muito pequenas
        .map(|word| word.to_string())
        .collect()
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn fetch_factorio_mods(
    page: Option<u32>,
    page_size: Option<u32>,
    hide_deprecated: Option<bool>,
    version: Option<String>,
    sort: Option<String>,
    sort_order: Option<String>,
) -> Result<ModsResponse, ApiError> {
    let client = reqwest::Client::new();
    let mut url = "https://mods.factorio.com/api/mods".to_string();
    
    // Construir parâmetros de query
    let mut params = Vec::new();
    
    if let Some(p) = page {
        params.push(format!("page={}", p));
    }
    
    if let Some(ps) = page_size {
        params.push(format!("page_size={}", ps));
    }
    
    if let Some(hd) = hide_deprecated {
        params.push(format!("hide_deprecated={}", hd));
    }
    
    if let Some(v) = version {
        params.push(format!("version={}", v));
    }
    
    if let Some(s) = sort {
        params.push(format!("sort={}", s));
    }
    
    if let Some(so) = sort_order {
        params.push(format!("sort_order={}", so));
    }
    
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }
    
    println!("Fazendo requisição para: {}", url);
    
    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<ModsResponse>().await {
                    Ok(mods_data) => {
                        println!("Sucesso! Encontrados {} mods", mods_data.results.len());
                        Ok(mods_data)
                    }
                    Err(e) => {
                        println!("Erro ao deserializar JSON: {}", e);
                        Err(ApiError {
                            error: "Erro ao processar resposta da API".to_string(),
                            details: Some(e.to_string()),
                        })
                    }
                }
            } else {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_else(|_| "Erro desconhecido".to_string());
                println!("Erro HTTP {}: {}", status, error_text);
                Err(ApiError {
                    error: format!("Erro HTTP {}", status),
                    details: Some(error_text),
                })
            }
        }
        Err(e) => {
            println!("Erro na requisição: {}", e);
            Err(ApiError {
                error: "Erro de conexão".to_string(),
                details: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
async fn fetch_all_mods() -> Result<CachedModsData, ApiError> {
    let client = reqwest::Client::new();
    let url = "https://mods.factorio.com/api/mods?page_size=max";
    
    println!("Fazendo requisição para: {}", url);
    
    match client.get(url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<ModsResponse>().await {
                    Ok(mods_data) => {
                        println!("Sucesso! Baixados {} mods", mods_data.results.len());
                        let cached_data = CachedModsData {
                            timestamp: Utc::now().to_rfc3339(),
                            pagination: mods_data.pagination,
                            results: mods_data.results,
                        };
                        Ok(cached_data)
                    }
                    Err(e) => {
                        println!("Erro ao deserializar JSON: {}", e);
                        Err(ApiError {
                            error: "Erro ao processar resposta da API".to_string(),
                            details: Some(e.to_string()),
                        })
                    }
                }
            } else {
                let status = response.status();
                let error_text = response.text().await.unwrap_or_else(|_| "Erro desconhecido".to_string());
                println!("Erro HTTP {}: {}", status, error_text);
                Err(ApiError {
                    error: format!("Erro HTTP {}", status),
                    details: Some(error_text),
                })
            }
        }
        Err(e) => {
            println!("Erro na requisição: {}", e);
            Err(ApiError {
                error: "Erro de conexão".to_string(),
                details: Some(e.to_string()),
            })
        }
    }
}

#[tauri::command]
async fn save_mods_cache(data: CachedModsData) -> Result<String, ApiError> {
    let cache_path = get_cache_file_path()?;
    
    // Backup do cache anterior se existir
    if cache_path.exists() {
        let backup_path = cache_path.with_extension("json.backup");
        if let Err(e) = fs::copy(&cache_path, &backup_path) {
            println!("Aviso: Não foi possível criar backup: {}", e);
        }
    }
    
    let json_data = serde_json::to_string_pretty(&data).map_err(|e| ApiError {
        error: "Erro ao serializar dados".to_string(),
        details: Some(e.to_string()),
    })?;
    
    fs::write(&cache_path, json_data).map_err(|e| ApiError {
        error: "Erro ao salvar arquivo de cache".to_string(),
        details: Some(e.to_string()),
    })?;
    
    println!("Cache salvo em: {:?}", cache_path);
    Ok(format!("Cache salvo com {} mods", data.results.len()))
}

#[tauri::command]
async fn load_mods_cache() -> Result<CachedModsData, ApiError> {
    let cache_path = get_cache_file_path()?;
    
    if !cache_path.exists() {
        return Err(ApiError {
            error: "Cache não encontrado".to_string(),
            details: Some("Execute uma atualização completa primeiro".to_string()),
        });
    }
    
    let content = fs::read_to_string(&cache_path).map_err(|e| ApiError {
        error: "Erro ao ler arquivo de cache".to_string(),
        details: Some(e.to_string()),
    })?;
    
    let cache_data: CachedModsData = serde_json::from_str(&content).map_err(|e| ApiError {
        error: "Erro ao deserializar cache".to_string(),
        details: Some(e.to_string()),
    })?;
    
    println!("Cache carregado com {} mods", cache_data.results.len());
    Ok(cache_data)
}

#[tauri::command]
async fn build_search_index(mods: Vec<FactorioMod>) -> Result<String, ApiError> {
    let mut by_name = HashMap::new();
    let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_owner: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_category: HashMap<String, Vec<usize>> = HashMap::new();
    let mut by_keywords: HashMap<String, Vec<usize>> = HashMap::new();
    let mut categories = std::collections::HashSet::new();
    
    for (index, mod_data) in mods.iter().enumerate() {
        // Índice por nome (chave única)
        by_name.insert(normalize_string(&mod_data.name), index);
        
        // Índice por título (pode haver múltiplos)
        let title_words = extract_keywords(&mod_data.title);
        for word in title_words {
            by_title.entry(word).or_insert_with(Vec::new).push(index);
        }
        
        // Índice por proprietário
        let owner_key = normalize_string(&mod_data.owner);
        by_owner.entry(owner_key).or_insert_with(Vec::new).push(index);
        
        // Índice por categoria
        let category_key = normalize_string(&mod_data.category);
        by_category.entry(category_key.clone()).or_insert_with(Vec::new).push(index);
        categories.insert(mod_data.category.clone());
        
        // Índice por palavras-chave (título + resumo)
        let all_text = format!("{} {}", mod_data.title, mod_data.summary);
        let keywords = extract_keywords(&all_text);
        for keyword in keywords {
            by_keywords.entry(keyword).or_insert_with(Vec::new).push(index);
        }
    }
    
    let stats = ModStats {
        total_mods: mods.len(),
        categories: categories.into_iter().collect(),
        last_update: Utc::now().to_rfc3339(),
        cache_size_mb: 0.0, // Calculado posteriormente se necessário
    };
    
    let index = ModsIndex {
        timestamp: Utc::now().to_rfc3339(),
        indexes: ModIndexes {
            by_name,
            by_title,
            by_owner,
            by_category,
            by_keywords,
        },
        stats,
    };
    
    let index_path = get_index_file_path()?;
    let json_data = serde_json::to_string_pretty(&index).map_err(|e| ApiError {
        error: "Erro ao serializar índice".to_string(),
        details: Some(e.to_string()),
    })?;
    
    fs::write(&index_path, json_data).map_err(|e| ApiError {
        error: "Erro ao salvar arquivo de índice".to_string(),
        details: Some(e.to_string()),
    })?;
    
    println!("Índice construído e salvo: {} mods indexados", mods.len());
    Ok(format!("Índice criado para {} mods", mods.len()))
}

#[tauri::command]
async fn check_cache_age() -> Result<bool, ApiError> {
    let cache_path = get_cache_file_path()?;
    let is_valid = is_cache_valid(&cache_path, 24); // Cache válido por 24 horas
    
    if is_valid {
        println!("Cache está atualizado");
    } else {
        println!("Cache precisa ser atualizado");
    }
    
    Ok(is_valid)
}

#[tauri::command]
async fn search_mods(
    query: String,
    page: Option<usize>,
    page_size: Option<usize>,
    filters: Option<SearchFilters>
) -> Result<SearchResult, ApiError> {
    let cache_data = load_mods_cache().await?;
    
    let page = page.unwrap_or(1);
    let page_size = page_size.unwrap_or(20);
    let filters = filters.unwrap_or(SearchFilters {
        category: None,
        factorio_version: None,
        min_downloads: None,
        max_downloads: None,
        min_score: None,
        owner: None,
    });
    
    // Buscar por query - APENAS POR NOME
    let mut matching_indices = std::collections::HashSet::new();
    
    if query.trim().is_empty() {
        // Se não há query, retorna todos os mods
        matching_indices.extend(0..cache_data.results.len());
    } else {
        let normalized_query = normalize_string(&query);
        
        // Busca apenas por nome (parcial) com tratamento para espaços
        for (index, mod_data) in cache_data.results.iter().enumerate() {
            let mod_name = normalize_string(&mod_data.name);
            
            // Estratégia 1: Busca com espaços (query original)
            if mod_name.contains(&normalized_query) {
                matching_indices.insert(index);
                continue;
            }
            
            // Estratégia 2: Busca sem espaços (concatena query)
            let query_no_spaces = normalized_query.replace(" ", "");
            let mod_name_no_spaces = mod_name.replace(" ", "");
            if mod_name_no_spaces.contains(&query_no_spaces) {
                matching_indices.insert(index);
                continue;
            }
            
            // Estratégia 3: Busca por todas as palavras da query no nome
            let query_words: Vec<&str> = normalized_query.split_whitespace().collect();
            if query_words.len() > 1 {
                let all_words_found = query_words.iter().all(|word| mod_name.contains(*word));
                if all_words_found {
                    matching_indices.insert(index);
                }
            }
        }
    }
    
    // Aplicar filtros
    let filtered_indices: Vec<usize> = matching_indices
        .into_iter()
        .filter(|&i| {
            if i >= cache_data.results.len() {
                return false;
            }
            
            let mod_data = &cache_data.results[i];
            
            // Filtro por categoria
            if let Some(ref category) = filters.category {
                if normalize_string(&mod_data.category) != normalize_string(category) {
                    return false;
                }
            }
            
            // Filtro por versão do Factorio
            if let Some(ref version) = filters.factorio_version {
                if let Some(ref release) = mod_data.latest_release {
                    if release.info_json.factorio_version != *version {
                        return false;
                    }
                } else {
                    // Se não tem release, não passa no filtro de versão
                    return false;
                }
            }
            
            // Filtro por downloads mínimos
            if let Some(min_downloads) = filters.min_downloads {
                if mod_data.downloads_count < min_downloads {
                    return false;
                }
            }
            
            // Filtro por downloads máximos
            if let Some(max_downloads) = filters.max_downloads {
                if mod_data.downloads_count > max_downloads {
                    return false;
                }
            }
            
            // Filtro por score mínimo
            if let Some(min_score) = filters.min_score {
                if mod_data.score < min_score {
                    return false;
                }
            }
            
            // Filtro por proprietário
            if let Some(ref owner) = filters.owner {
                if normalize_string(&mod_data.owner) != normalize_string(owner) {
                    return false;
                }
            }
            
            true
        })
        .collect();
    
    // Ordenar por relevância (por enquanto, por score decrescente)
    let mut sorted_indices = filtered_indices.clone();
    sorted_indices.sort_by(|&a, &b| {
        cache_data.results[b].score.partial_cmp(&cache_data.results[a].score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    
    // Paginação
    let total = sorted_indices.len();
    let start = (page - 1) * page_size;
    let end = std::cmp::min(start + page_size, total);
    
    let page_indices = if start < total {
        &sorted_indices[start..end]
    } else {
        &[]
    };
    
    let result_mods: Vec<FactorioMod> = page_indices
        .iter()
        .map(|&i| cache_data.results[i].clone())
        .collect();
    
    println!("Busca '{}' retornou {} resultados (página {}/{})", 
             query, total, page, (total + page_size - 1) / page_size);
    
    Ok(SearchResult {
        mods: result_mods,
        total,
        page,
        page_size,
        query,
        filters,
    })
}

// Função para buscar thumbnail de um mod específico da API re146.dev
async fn fetch_mod_thumbnail(mod_name: &str) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
    let enc_name = mod_name.replace(' ', "%20");
    let url = format!("https://mods.factorio.com/api/mods/{}", enc_name);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;
    
    let response = client.get(&url).send().await?;
    
    if !response.status().is_success() {
        return Ok(None);
    }
    
    let enhanced_info: EnhancedModInfo = response.json().await?;
    
    // Priorizar a primeira imagem do array images, depois o campo thumbnail
    if let Some(images) = enhanced_info.images {
        if let Some(first_image) = images.first() {
            return Ok(Some(first_image.thumbnail.clone()));
        }
    }
    
    // Fallback para o campo thumbnail (que é um path relativo)
    if let Some(thumbnail_path) = enhanced_info.thumbnail {
        if thumbnail_path.starts_with("/assets/") {
            let full_url = format!("https://assets-mod.factorio.com{}", thumbnail_path);
            return Ok(Some(full_url));
        }
    }
    
    Ok(None)
}

#[tauri::command]
async fn fetch_mod_thumbnail_cmd(mod_name: String) -> Result<Option<String>, String> {
    match fetch_mod_thumbnail(&mod_name).await {
        Ok(thumbnail) => Ok(thumbnail),
        Err(e) => {
            eprintln!("Erro ao buscar thumbnail para {}: {}", mod_name, e);
            Ok(None)
        }
    }
}

#[tauri::command]
async fn update_popular_thumbnails(limit: Option<usize>) -> Result<String, String> {
    let data_dir = get_cache_dir().map_err(|e| format!("Erro ao obter diretório de dados: {:?}", e))?;
    let cache_path = data_dir.join("mods-data.json");
    
    // Carregar cache atual
    let mut cache_data: CachedModsData = match fs::read_to_string(&cache_path) {
        Ok(content) => serde_json::from_str(&content).map_err(|e| e.to_string())?,
        Err(_) => return Err("Cache não encontrado".to_string()),
    };
    
    // Ordenar por downloads e pegar os mais populares que não têm thumbnail
    let mut mods_to_update: Vec<&mut FactorioMod> = cache_data.results
        .iter_mut()
        .filter(|mod_data| !mod_data.thumbnail_loaded && mod_data.enhanced_thumbnail.is_none())
        .collect();
    
    mods_to_update.sort_by(|a, b| b.downloads_count.cmp(&a.downloads_count));
    
    let update_limit = limit.unwrap_or(50); // Default: atualizar 50 mods mais populares
    let mods_to_process = mods_to_update.into_iter().take(update_limit);
    
    let mut updated_count = 0;
    let mut error_count = 0;
    
    println!("Iniciando atualização de thumbnails para {} mods populares...", update_limit);
    
    for mod_data in mods_to_process {
        match fetch_mod_thumbnail(&mod_data.name).await {
            Ok(Some(thumbnail)) => {
                mod_data.enhanced_thumbnail = Some(thumbnail);
                mod_data.thumbnail_loaded = true;
                updated_count += 1;
                println!("✅ Thumbnail atualizada para: {}", mod_data.title);
            }
            Ok(None) => {
                mod_data.thumbnail_loaded = true; // Marcar como tentado, mesmo sem sucesso
                println!("⚠️  Thumbnail não encontrada para: {}", mod_data.title);
            }
            Err(e) => {
                error_count += 1;
                println!("❌ Erro ao buscar thumbnail para {}: {}", mod_data.title, e);
                // Não marcar como thumbnail_loaded em caso de erro, para tentar novamente depois
            }
        }
        
        // Pequeno delay para não sobrecarregar a API
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
    
    // Salvar cache atualizado
    let json_content = serde_json::to_string_pretty(&cache_data)
        .map_err(|e| format!("Erro ao serializar cache: {}", e))?;
    
    fs::write(&cache_path, json_content)
        .map_err(|e| format!("Erro ao salvar cache: {}", e))?;
    
    let result_msg = format!(
        "Atualização concluída! {} thumbnails atualizadas, {} erros", 
        updated_count, error_count
    );
    
    println!("{}", result_msg);
    Ok(result_msg)
}

// Função para normalizar o nome do perfil em nome de pasta
fn normalize_profile_name(name: &str) -> String {
    // Remover acentos e normalizar caracteres especiais
    let normalized = name
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'A',
            'É' | 'È' | 'Ê' | 'Ë' => 'E',
            'Í' | 'Ì' | 'Î' | 'Ï' => 'I',
            'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'O',
            'Ú' | 'Ù' | 'Û' | 'Ü' => 'U',
            'Ç' => 'C',
            'Ñ' => 'N',
            c if c.is_alphanumeric() => c,
            ' ' => '-',
            _ => '-', // Substitui outros caracteres especiais por hífen
        })
        .collect::<String>();
    
    // Remover hífens consecutivos e normalizar
    let re = Regex::new(r"-+").unwrap();
    let cleaned = re.replace_all(&normalized, "-");
    
    cleaned.to_lowercase()
        .trim_matches('-') // Remove hífens no início e fim
        .to_string()
}

// Função para obter o diretório base dos perfis do ModManager
fn get_profiles_dir() -> Result<PathBuf, String> {
    let roaming_dir = dirs::config_dir()
        .ok_or("Não foi possível encontrar o diretório de configuração")?;
    Ok(roaming_dir.join("ModManager").join("profiles"))
}

// Carrega o profile.config de um diretório de perfil
fn load_profile_config(profile_dir: &PathBuf) -> Result<ProfileConfig, String> {
    let config_path = profile_dir.join("profile.config");
    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Erro ao ler configuração do perfil: {}", e))?;
    let cfg: ProfileConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Erro ao deserializar configuração do perfil: {}", e))?;
    Ok(cfg)
}

// Resolve o diretório de mods para um perfil (considera mods_path customizado)
fn resolve_profile_mods_dir(profile_dir: &PathBuf) -> Result<PathBuf, String> {
    let cfg = load_profile_config(profile_dir)?;
    let mods_dir = if let Some(custom) = cfg.mods_path {
        PathBuf::from(custom)
    } else {
        profile_dir.join("mods")
    };
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Erro ao criar diretório de mods: {}", e))?;
    }
    Ok(mods_dir)
}

// Função para obter todos os perfis
#[tauri::command]
async fn get_profiles() -> Result<Vec<Profile>, String> {
    let profiles_dir = get_profiles_dir()?;
    
    if !profiles_dir.exists() {
        fs::create_dir_all(&profiles_dir)
            .map_err(|e| format!("Erro ao criar diretório de perfis: {}", e))?;
    }

    let mut profiles = Vec::new();

    // Ler todas as pastas no diretório de perfis
    let entries = fs::read_dir(&profiles_dir)
        .map_err(|e| format!("Erro ao ler diretório de perfis: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Erro ao processar entrada: {}", e))?;
        let path = entry.path();
        
        if path.is_dir() {
            let config_path = path.join("profile.config");
            if config_path.exists() {
                // Ler configuração do perfil
                let config_content = fs::read_to_string(&config_path)
                    .map_err(|e| format!("Erro ao ler configuração do perfil: {}", e))?;
                
                let profile_config: ProfileConfig = serde_json::from_str(&config_content)
                    .map_err(|e| format!("Erro ao deserializar configuração do perfil: {}", e))?;

                let folder_name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();

                profiles.push(Profile {
                    name: profile_config.profile_name,
                    folder_name,
                    created_at: profile_config.created_at,
                    last_used: Utc::now().to_rfc3339(), // Por enquanto, usar data atual
                });
            }
        }
    }

    // Se não há perfis, criar um perfil padrão automaticamente
    if profiles.is_empty() {
        let default_profile = create_default_profile(&profiles_dir)?;
        profiles.push(default_profile);
    }

    Ok(profiles)
}

// Função para criar o perfil padrão
fn create_default_profile(profiles_dir: &PathBuf) -> Result<Profile, String> {
    let folder_name = "default".to_string();
    let profile_dir = profiles_dir.join(&folder_name);
    
    // Criar diretório do perfil padrão
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Erro ao criar diretório do perfil padrão: {}", e))?;

    let created_at = Utc::now().to_rfc3339();

    // Criar configuração do perfil padrão
    let profile_config = ProfileConfig {
        profile_name: "Default".to_string(),
        created_at: created_at.clone(),
        factorio_version: None,
        mod_list_enabled: true,
        mods_path: None,
        factorio_exe_path: None,
    };

    // Salvar configuração
    let config_path = profile_dir.join("profile.config");
    let config_json = serde_json::to_string_pretty(&profile_config)
        .map_err(|e| format!("Erro ao serializar configuração do perfil padrão: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Erro ao salvar configuração do perfil padrão: {}", e))?;

    // Retornar o perfil criado
    Ok(Profile {
        name: "Default".to_string(),
        folder_name,
        created_at: created_at.clone(),
        last_used: created_at,
    })
}

// Função para criar um novo perfil
#[tauri::command]
async fn create_profile(profile_name: String, custom_mods_path: Option<String>, exe_path: Option<String>) -> Result<Profile, String> {
    if profile_name.trim().is_empty() {
        return Err("Nome do perfil não pode estar vazio".to_string());
    }

    let folder_name = normalize_profile_name(&profile_name);
    if folder_name.is_empty() {
        return Err("Nome do perfil inválido".to_string());
    }

    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&folder_name);

    // Verificar se o perfil já existe
    if profile_dir.exists() {
        return Err("Já existe um perfil com esse nome".to_string());
    }

    // Criar diretório do perfil
    fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Erro ao criar diretório do perfil: {}", e))?;

    let created_at = Utc::now().to_rfc3339();

    // Criar configuração do perfil
    let profile_config = ProfileConfig {
        profile_name: profile_name.clone(),
        created_at: created_at.clone(),
        factorio_version: None,
        mod_list_enabled: true,
        mods_path: custom_mods_path.clone(),
        factorio_exe_path: exe_path.clone(),
    };

    // Salvar configuração
    let config_path = profile_dir.join("profile.config");
    let config_json = serde_json::to_string_pretty(&profile_config)
        .map_err(|e| format!("Erro ao serializar configuração do perfil: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Erro ao salvar configuração do perfil: {}", e))?;

    // Garantir que o diretório de mods exista (padrão ou customizado)
    let mods_dir = if let Some(custom) = custom_mods_path {
        PathBuf::from(custom)
    } else {
        profile_dir.join("mods")
    };
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Erro ao criar diretório de mods: {}", e))?;
    }

    // Retornar o perfil criado
    Ok(Profile {
        name: profile_name,
        folder_name,
        created_at: created_at.clone(),
        last_used: created_at,
    })
}

// Obter configuração completa de um perfil específico
#[tauri::command]
async fn get_profile_config(folder_name: String) -> Result<ProfileConfig, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&folder_name);
    if !profile_dir.exists() {
        return Err("Perfil não encontrado".to_string());
    }
    load_profile_config(&profile_dir)
}

// Atualizar configurações editáveis de um perfil (nome não é editado aqui)
#[tauri::command]
async fn update_profile_settings(
    folder_name: String,
    mods_path: Option<String>,
    factorio_exe_path: Option<String>,
) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&folder_name);
    if !profile_dir.exists() {
        return Err("Perfil não encontrado".to_string());
    }

    let mut cfg = load_profile_config(&profile_dir)?;
    cfg.mods_path = mods_path;
    cfg.factorio_exe_path = factorio_exe_path;

    let config_path = profile_dir.join("profile.config");
    let config_json = serde_json::to_string_pretty(&cfg)
        .map_err(|e| format!("Erro ao serializar configuração do perfil: {}", e))?;
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Erro ao salvar configuração do perfil: {}", e))?;

    // Garantir diretório de mods conforme nova configuração
    let mods_dir = resolve_profile_mods_dir(&profile_dir)?;
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Erro ao criar diretório de mods: {}", e))?;
    }

    Ok("Configurações do perfil atualizadas".to_string())
}

// Função para deletar um perfil
#[tauri::command]
async fn delete_profile(folder_name: String) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&folder_name);

    if !profile_dir.exists() {
        return Err("Perfil não encontrado".to_string());
    }

    fs::remove_dir_all(&profile_dir)
        .map_err(|e| format!("Erro ao deletar perfil: {}", e))?;

    Ok("Perfil deletado com sucesso".to_string())
}

// Função para obter o caminho do arquivo de configuração
fn get_config_path() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir()
        .ok_or("Não foi possível encontrar o diretório de dados")?;
    
    let mod_manager_dir = data_dir.join("ModManager");
    if !mod_manager_dir.exists() {
        fs::create_dir_all(&mod_manager_dir)
            .map_err(|e| format!("Erro ao criar diretório de configuração: {}", e))?;
    }
    
    Ok(mod_manager_dir.join(".config"))
}

// Caminho do diretório mods do Factorio (AppData\Roaming\Factorio\mods)
fn get_factorio_mods_dir() -> Result<PathBuf, String> {
    let roaming_dir = dirs::config_dir().ok_or("Não foi possível encontrar o diretório de configuração")?;
    let factorio_dir = roaming_dir.join("Factorio");
    if !factorio_dir.exists() {
        fs::create_dir_all(&factorio_dir).map_err(|e| format!("Erro ao criar diretório Factorio: {}", e))?;
    }
    Ok(factorio_dir.join("mods"))
}

#[cfg(windows)]
fn is_reparse_point(path: &PathBuf) -> bool {
    if let Ok(md) = fs::symlink_metadata(path) {
        let attrs = md.file_attributes();
        // FILE_ATTRIBUTE_REPARSE_POINT = 0x0400
        return (attrs & 0x0400) != 0;
    }
    false
}

#[cfg(not(windows))]
fn is_reparse_point(_path: &PathBuf) -> bool { false }

// Atualiza o link do diretório mods do Factorio para o mods do perfil selecionado
#[tauri::command]
async fn update_factorio_mods_link(folder_name: String) -> Result<String, String> {
    // Resolver diretório de destino (mods do perfil)
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&folder_name);
    if !profile_dir.exists() {
        return Err("Perfil não encontrado".to_string());
    }
    let target_mods_dir = resolve_profile_mods_dir(&profile_dir)?;

    // Garantir que diretório de destino existe
    if !target_mods_dir.exists() {
        fs::create_dir_all(&target_mods_dir)
            .map_err(|e| format!("Erro ao criar pasta de mods do perfil: {}", e))?;
    }

    let link_path = get_factorio_mods_dir()?;

    // Se já é um link/junção e aponta para o mesmo destino, não fazer nada
    if is_reparse_point(&link_path) {
        if let Ok(dest) = fs::read_link(&link_path) {
            if dest == target_mods_dir {
                return Ok("Link já aponta para o perfil selecionado".to_string());
            }
        }
        // Remover link anterior
        if let Err(e) = fs::remove_dir(&link_path) {
            return Err(format!("Erro ao remover link anterior: {}", e));
        }
    } else if link_path.exists() {
        // Existe uma pasta real 'mods' — fazer backup
        let mut backup_path = link_path.with_file_name("mods-backup");
        if backup_path.exists() {
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
            backup_path = link_path.with_file_name(format!("mods-backup-{}", ts));
        }
        fs::rename(&link_path, &backup_path)
            .map_err(|e| format!("Erro ao renomear mods para backup: {}", e))?;
    }

    // Criar junção (Windows) ou symlink (outros) apontando para target_mods_dir
    #[cfg(windows)]
    {
        // Preferir junção (/J), que não requer privilégio admin
        let link_str = link_path.to_string_lossy().to_string();
        let target_str = target_mods_dir.to_string_lossy().to_string();
        let output = Command::new("cmd")
            .args(["/C", "mklink", "/J", &link_str, &target_str])
            .output()
            .map_err(|e| format!("Falha ao executar mklink: {}", e))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            return Err(format!("mklink falhou: {} {}", stdout.trim(), stderr.trim()));
        }
    }
    #[cfg(not(windows))]
    {
        std::os::unix::fs::symlink(&target_mods_dir, &link_path)
            .map_err(|e| format!("Erro ao criar symlink: {}", e))?;
    }

    Ok("Link de mods do Factorio atualizado".to_string())
}

// Executa o jogo Factorio usando o caminho definido (prioriza caminho do perfil; fallback para app)
#[tauri::command]
async fn run_factorio() -> Result<String, String> {
    // Carregar configuração do app (para selected_profile e game_exe_path)
    let app_cfg = load_config().await?;

    // Se houver perfil selecionado, tentar pegar o exe específico do perfil
    let mut exe_path: Option<String> = None;
    if let Some(folder) = app_cfg.selected_profile.clone() {
        let profiles_dir = get_profiles_dir()?;
        let profile_dir = profiles_dir.join(&folder);
        if profile_dir.exists() {
            if let Ok(cfg) = load_profile_config(&profile_dir) {
                if let Some(p) = cfg.factorio_exe_path {
                    exe_path = Some(p);
                }
            }
        }
        // Garantir que o link de mods está apontando para o perfil ativo
        let _ = update_factorio_mods_link(folder).await;
    }

    // Fallback para caminho global do app
    if exe_path.is_none() {
        exe_path = app_cfg.game_exe_path.clone();
    }

    let exe = exe_path.ok_or_else(|| {
        "Caminho do executável do Factorio não configurado".to_string()
    })?;

    let exe_pb = PathBuf::from(&exe);
    if !exe_pb.exists() {
        return Err(format!("Executável não encontrado: {}", exe));
    }

    // Executar de forma não bloqueante
    Command::new(&exe)
        .spawn()
        .map_err(|e| format!("Falha ao iniciar o jogo: {}", e))?;

    Ok("Factorio iniciado".to_string())
}

// Função para carregar configurações
#[tauri::command]
async fn load_config() -> Result<AppConfig, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        let default_config = AppConfig::default();
        save_config(default_config.clone()).await?;
        return Ok(default_config);
    }
    
    let config_content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Erro ao ler arquivo de configuração: {}", e))?;
    
    let config: AppConfig = serde_json::from_str(&config_content)
        .map_err(|e| format!("Erro ao parsear configuração: {}", e))?;
    
    Ok(config)
}

// Função para salvar configurações
#[tauri::command]
async fn save_config(config: AppConfig) -> Result<String, String> {
    let config_path = get_config_path()?;
    
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Erro ao serializar configuração: {}", e))?;
    
    fs::write(&config_path, config_json)
        .map_err(|e| format!("Erro ao salvar configuração: {}", e))?;
    
    Ok("Configuração salva com sucesso".to_string())
}

// Obter/Salvar perfil selecionado (atalhos convenientes)
#[tauri::command]
async fn get_selected_profile() -> Result<Option<String>, String> {
    let cfg = load_config().await?;
    Ok(cfg.selected_profile)
}

#[tauri::command]
async fn set_selected_profile(folder_name: String) -> Result<String, String> {
    let mut cfg = load_config().await?;
    cfg.selected_profile = Some(folder_name);
    save_config(cfg).await
}

// Valida se um caminho existe no sistema de arquivos
#[tauri::command]
async fn validate_path_exists(path: String) -> Result<bool, String> {
    let pb = PathBuf::from(path);
    Ok(pb.exists())
}

// Função para calcular tamanho real do cache
#[tauri::command]
async fn get_cache_size() -> Result<String, String> {
    let cache_path = get_cache_dir().map_err(|e| format!("Erro ao obter diretório de cache: {:?}", e))?;
    
    if !cache_path.exists() {
        return Ok("0 MB".to_string());
    }
    
    fn calculate_dir_size(dir: &PathBuf) -> Result<u64, std::io::Error> {
        let mut size = 0u64;
        
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                
                if path.is_dir() {
                    size += calculate_dir_size(&path)?;
                } else {
                    let metadata = entry.metadata()?;
                    size += metadata.len();
                }
            }
        }
        
        Ok(size)
    }
    
    let total_size = calculate_dir_size(&cache_path)
        .map_err(|e| format!("Erro ao calcular tamanho do cache: {}", e))?;
    
    // Converter bytes para MB
    let size_mb = total_size as f64 / (1024.0 * 1024.0);
    
    if size_mb < 1.0 {
        Ok(format!("{:.1} KB", total_size as f64 / 1024.0))
    } else {
        Ok(format!("{:.1} MB", size_mb))
    }
}

// Função para buscar detalhes completos de um mod (todas as versões)
#[tauri::command]
async fn fetch_mod_details(mod_name: String) -> Result<ModDetails, String> {
    let enc_name = mod_name.replace(' ', "%20");
    let url = format!("https://mods.factorio.com/api/mods/{}/full", enc_name);
    
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Erro na requisição: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro HTTP: {}", response.status()));
    }

    let mod_response: ModFullResponse = response
        .json()
        .await
        .map_err(|e| format!("Erro ao parsear JSON: {}", e))?;

    // Converter releases para nosso formato e ordenar (mais recente primeiro)
    let mut releases: Vec<ModVersionInfo> = mod_response
        .releases
        .into_iter()
        .map(|release| ModVersionInfo {
            version: release.version,
            factorio_version: release.info_json.factorio_version,
            released_at: release.released_at,
        })
        .collect();

    // Ordenar por data de lançamento (mais recente primeiro)
    releases.sort_by(|a, b| b.released_at.cmp(&a.released_at));

    Ok(ModDetails {
        name: mod_response.name,
        releases,
    })
}

// Full mod data proxy (avoids CORS in frontend)
#[tauri::command]
async fn fetch_mod_full(mod_name: String) -> Result<ModFullData, String> {
    let enc_name = mod_name.replace(' ', "%20");
    let url = format!("https://mods.factorio.com/api/mods/{}/full", enc_name);
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| format!("Erro ao criar cliente: {}", e))?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Erro na requisição: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro HTTP: {}", response.status()));
    }

    response
        .json::<ModFullData>()
        .await
        .map_err(|e| format!("Erro ao parsear JSON: {}", e))
}

// Funções para gerenciar os arquivos JSON de controle de mods
fn load_factorio_mod_list(profile_dir: &PathBuf) -> Result<FactorioModList, String> {
    let mods_dir = resolve_profile_mods_dir(profile_dir)?;
    let mod_list_path = mods_dir.join("mod-list.json");
    
    if mod_list_path.exists() {
        let content = fs::read_to_string(&mod_list_path)
            .map_err(|e| format!("Erro ao ler mod-list.json: {}", e))?;
        
        let mod_list: FactorioModList = serde_json::from_str(&content)
            .map_err(|e| format!("Erro ao parsear mod-list.json: {}", e))?;
        
        Ok(mod_list)
    } else {
        // Criar mod-list.json inicial com mod base do Factorio
        let initial_mod_list = FactorioModList {
            mods: vec![
                FactorioModListEntry {
                    name: "base".to_string(),
                    enabled: true,
                }
            ]
        };
        
    save_factorio_mod_list(profile_dir, &initial_mod_list)?;
        Ok(initial_mod_list)
    }
}

fn save_factorio_mod_list(profile_dir: &PathBuf, mod_list: &FactorioModList) -> Result<(), String> {
    let mods_dir = resolve_profile_mods_dir(profile_dir)?;
    let mod_list_path = mods_dir.join("mod-list.json");
    
    // Criar diretório de mods se não existir
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Erro ao criar diretório de mods: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(mod_list)
        .map_err(|e| format!("Erro ao serializar mod-list.json: {}", e))?;
    
    fs::write(&mod_list_path, content)
        .map_err(|e| format!("Erro ao salvar mod-list.json: {}", e))?;
    
    Ok(())
}

fn load_internal_mod_list(profile_dir: &PathBuf) -> Result<InternalModList, String> {
    let mods_dir = resolve_profile_mods_dir(profile_dir)?;
    let internal_list_path = mods_dir.join("internal-mod-list.json");
    
    if internal_list_path.exists() {
        let content = fs::read_to_string(&internal_list_path)
            .map_err(|e| format!("Erro ao ler internal-mod-list.json: {}", e))?;
        
        let internal_list: InternalModList = serde_json::from_str(&content)
            .map_err(|e| format!("Erro ao parsear internal-mod-list.json: {}", e))?;
        
        Ok(internal_list)
    } else {
        // Criar lista interna inicial vazia
        let initial_list = InternalModList {
            mods: vec![],
            last_updated: Utc::now().to_rfc3339(),
        };
        
    save_internal_mod_list(profile_dir, &initial_list)?;
        Ok(initial_list)
    }
}

fn save_internal_mod_list(profile_dir: &PathBuf, internal_list: &InternalModList) -> Result<(), String> {
    let mods_dir = resolve_profile_mods_dir(profile_dir)?;
    let internal_list_path = mods_dir.join("internal-mod-list.json");
    
    // Criar diretório de mods se não existir
    if !mods_dir.exists() {
        fs::create_dir_all(&mods_dir)
            .map_err(|e| format!("Erro ao criar diretório de mods: {}", e))?;
    }
    
    let content = serde_json::to_string_pretty(internal_list)
        .map_err(|e| format!("Erro ao serializar internal-mod-list.json: {}", e))?;
    
    fs::write(&internal_list_path, content)
        .map_err(|e| format!("Erro ao salvar internal-mod-list.json: {}", e))?;
    
    Ok(())
}

pub(crate) fn add_mod_to_lists(
    profile_dir: &PathBuf,
    mod_name: &str,
    version: &str,
    file_name: &str,
    factorio_version: &str,
) -> Result<(), String> {
    // Carregar listas existentes
    let mut factorio_list = load_factorio_mod_list(profile_dir)?;
    let mut internal_list = load_internal_mod_list(profile_dir)?;
    
    // Verificar se o mod já existe na lista do Factorio
    let mod_exists = factorio_list.mods.iter().any(|m| m.name == mod_name);
    
    if !mod_exists {
        // Adicionar à lista do Factorio
        factorio_list.mods.push(FactorioModListEntry {
            name: mod_name.to_string(),
            enabled: true,
        });
        
        save_factorio_mod_list(profile_dir, &factorio_list)?;
    }
    
    // Remover versão antiga do mod da lista interna (se existir)
    internal_list.mods.retain(|m| m.name != mod_name);
    
    // Adicionar nova versão à lista interna
    internal_list.mods.push(InternalModEntry {
        name: mod_name.to_string(),
        version: version.to_string(),
        enabled: true,
        file_name: file_name.to_string(),
        download_date: Utc::now().to_rfc3339(),
        factorio_version: factorio_version.to_string(),
    });
    
    // Atualizar timestamp
    internal_list.last_updated = Utc::now().to_rfc3339();
    
    save_internal_mod_list(profile_dir, &internal_list)?;
    
    Ok(())
}

// Função para download de mod específico para um perfil
// Internal function used by queue and wrapper command
pub(crate) async fn download_mod_to_profile_internal(
    mod_name: String, 
    version: String, 
    profile_name: String
) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&profile_name);
    let mods_dir = resolve_profile_mods_dir(&profile_dir)?;
    
    // Diretório de mods já garantido por resolve_profile_mods_dir

    // Primeiro, buscar detalhes do mod para obter a versão do Factorio
    let mod_details = fetch_mod_details(mod_name.clone()).await?;
    
    // Encontrar a release específica para obter a versão do Factorio
    let target_release = mod_details.releases.iter()
        .find(|r| r.version == version)
        .ok_or_else(|| format!("Versão {} não encontrada para o mod {}", version, mod_name))?;
    
    let factorio_version = &target_release.factorio_version;
    
    // Construir URL de download
    let anticache = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs_f64();
    
    let enc_name = mod_name.replace(' ', "%20");
    let download_url = format!(
        "https://mods-storage.re146.dev/{}/{}.zip?anticache={}", 
        enc_name, version, anticache
    );
    
    // Nome do arquivo
    let file_name = format!("{}_{}.zip", mod_name, version);
    let file_path = mods_dir.join(&file_name);
    
    // Remover versão anterior do mesmo mod (se existir)
    if let Ok(entries) = fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let entry_name = entry.file_name().to_string_lossy().to_string();
            if entry_name.starts_with(&format!("{}_", mod_name)) && entry_name.ends_with(".zip") && entry_name != file_name {
                let _ = fs::remove_file(entry.path());
                println!("Removida versão anterior: {}", entry_name);
            }
        }
    }
    
    // Fazer download
    let response = reqwest::get(&download_url)
        .await
        .map_err(|e| format!("Erro no download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Erro HTTP no download: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Erro ao ler dados do download: {}", e))?;

    fs::write(&file_path, bytes)
        .map_err(|e| format!("Erro ao salvar arquivo: {}", e))?;

    // Atualizar arquivos JSON de controle
    add_mod_to_lists(&profile_dir, &mod_name, &version, &file_name, factorio_version)
        .map_err(|e| format!("Erro ao atualizar listas de mods: {}", e))?;

    Ok(format!("Mod {} v{} baixado com sucesso!", mod_name, version))
}

// Public command wrapper for direct calls
#[tauri::command]
async fn download_mod_to_profile(
    mod_name: String,
    version: String,
    profile_name: String,
) -> Result<String, String> {
    download_mod_to_profile_internal(mod_name, version, profile_name).await
}

// Função para obter mods instalados de um perfil
#[tauri::command]
async fn get_installed_mods(profile_name: String) -> Result<Vec<InternalModEntry>, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&profile_name);
    
    // Carregar lista interna de mods
    let internal_list = load_internal_mod_list(&profile_dir)?;
    
    Ok(internal_list.mods)
}

// Função para deletar um mod
#[tauri::command]
async fn delete_mod_file(
    profile_name: String,
    mod_name: String,
    file_path: String
) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&profile_name);
    let mods_dir = resolve_profile_mods_dir(&profile_dir)?;
    
    // Construir caminho completo do arquivo
    let full_file_path = mods_dir.join(&file_path);
    
    // Deletar arquivo físico
    if full_file_path.exists() {
        fs::remove_file(&full_file_path)
            .map_err(|e| format!("Erro ao deletar arquivo: {}", e))?;
    }
    
    // Atualizar listas JSON
    let mut factorio_list = load_factorio_mod_list(&profile_dir)?;
    let mut internal_list = load_internal_mod_list(&profile_dir)?;
    
    // Remover da lista do Factorio
    factorio_list.mods.retain(|m| m.name != mod_name);
    
    // Remover da lista interna
    internal_list.mods.retain(|m| m.name != mod_name);
    internal_list.last_updated = Utc::now().to_rfc3339();
    
    // Salvar listas atualizadas
    save_factorio_mod_list(&profile_dir, &factorio_list)?;
    save_internal_mod_list(&profile_dir, &internal_list)?;
    
    Ok(format!("Mod {} removido com sucesso!", mod_name))
}

// Função para alternar status ativo/inativo de um mod
#[tauri::command]
async fn toggle_mod_status(
    profile_name: String,
    mod_name: String,
    enabled: bool
) -> Result<String, String> {
    let profiles_dir = get_profiles_dir()?;
    let profile_dir = profiles_dir.join(&profile_name);
    
    // Atualizar listas JSON
    let mut factorio_list = load_factorio_mod_list(&profile_dir)?;
    let mut internal_list = load_internal_mod_list(&profile_dir)?;
    
    // Atualizar na lista do Factorio
    if let Some(factorio_mod) = factorio_list.mods.iter_mut().find(|m| m.name == mod_name) {
        factorio_mod.enabled = enabled;
    }
    
    // Atualizar na lista interna
    if let Some(internal_mod) = internal_list.mods.iter_mut().find(|m| m.name == mod_name) {
        internal_mod.enabled = enabled;
    }
    
    // Atualizar timestamp da lista interna
    internal_list.last_updated = Utc::now().to_rfc3339();
    
    // Salvar listas atualizadas
    save_factorio_mod_list(&profile_dir, &factorio_list)?;
    save_internal_mod_list(&profile_dir, &internal_list)?;
    
    let status_text = if enabled { "ativado" } else { "desativado" };
    Ok(format!("Mod {} {} com sucesso!", mod_name, status_text))
}

// Função para testar normalização
#[tauri::command]
async fn test_normalize(name: String) -> Result<String, String> {
    Ok(normalize_profile_name(&name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize download queue state
    let queue_manager = download_queue::DownloadQueueManager::default();

    tauri::Builder::default()
        .manage(queue_manager)
        .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            fetch_factorio_mods,
            fetch_all_mods,
            save_mods_cache,
            load_mods_cache,
            build_search_index,
            check_cache_age,
            search_mods,
            fetch_mod_thumbnail_cmd,
            update_popular_thumbnails,
            get_profiles,
            create_profile,
            delete_profile,
            get_profile_config,
            update_profile_settings,
            test_normalize,
            load_config,
            save_config,
            get_selected_profile,
            set_selected_profile,
            update_factorio_mods_link,
            run_factorio,
            validate_path_exists,
            get_cache_size,
            fetch_mod_details,
            fetch_mod_full,
            download_mod_to_profile,
            get_installed_mods,
            delete_mod_file,
            toggle_mod_status,
            // Dependency resolver
            dependency_resolver::resolve_and_enqueue_dependencies,
            // Download queue commands
            download_queue::enqueue_download,
            download_queue::get_download_queue,
            download_queue::pause_all_downloads,
            download_queue::resume_all_downloads,
            download_queue::pause_download,
            download_queue::resume_download,
            download_queue::remove_from_queue,
            download_queue::move_to_top,
            download_queue::clear_download_queue,
            download_queue::cancel_all_downloads
        ])
        .setup(|app| {
            // Load persisted queue and start if needed
            if let Some(mgr_state) = app.try_state::<download_queue::DownloadQueueManager>() {
                mgr_state.load_persist();
                // Emit initial state
                mgr_state.emit_update(&app.handle());
                let mgr = mgr_state.inner().clone();
                download_queue::DownloadQueueManager::start_next_if_idle_owned(mgr, app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Public helpers for download_queue module
pub(crate) fn get_profiles_dir_pub() -> Result<PathBuf, String> { get_profiles_dir() }

pub(crate) async fn get_factorio_version_for(mod_name: String, version: String) -> Result<String, String> {
    let details = fetch_mod_details(mod_name.clone()).await?;
    let target = details.releases.iter().find(|r| r.version == version)
        .ok_or_else(|| format!("Versão {} não encontrada para {}", version, mod_name))?;
    Ok(target.factorio_version.clone())
}
