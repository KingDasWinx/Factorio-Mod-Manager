import customtkinter as ctk
import requests
from bs4 import BeautifulSoup
import json
import os
from pathlib import Path
import re
from queue import Queue
from threading import Lock, Thread
from typing import Callable, Optional, Set, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed
import multiprocessing
from urllib.parse import quote

class ModDownloader:
    def __init__(self):
        self.downloaded_mods = {}
        self.processed_mods = set()
        self.download_path = str(Path.home() / "Downloads" / "FactorioMods")
        self.load_downloaded_mods()
        self.lock = Lock()
        self.max_workers = max(1, int(multiprocessing.cpu_count() * 0.75))
        self.session = requests.Session()
        self.api_base_url = "https://re146.dev/factorio/mods/modinfo"
        self.download_base_url = "https://mods-storage.re146.dev"
        self.rand = "007023042090275378"
        
    def load_downloaded_mods(self):
        """Carrega a lista de mods já baixados do arquivo JSON."""
        json_path = os.path.join(self.download_path, "downloaded_mods.json")
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                self.downloaded_mods = json.load(f)

    def save_downloaded_mods(self):
        """Salva a lista de mods baixados em um arquivo JSON."""
        os.makedirs(self.download_path, exist_ok=True)
        json_path = os.path.join(self.download_path, "downloaded_mods.json")
        with self.lock:
            with open(json_path, 'w') as f:
                json.dump(self.downloaded_mods, f, indent=4)

    def clean_mod_name(self, mod_name: str) -> str:
        """Remove caracteres especiais e limpa o nome do mod"""
        if mod_name.startswith('!') or mod_name.startswith('?'):
            mod_name = mod_name[1:]
        return mod_name.strip()

    def get_mod_info(self, mod_name: str) -> dict:
        """Obtém informações do mod usando a API do re146.dev"""
        try:
            if mod_name.startswith('!') or mod_name.startswith('?'):
                return None
                
            clean_name = self.clean_mod_name(mod_name)
            
            encoded_name = quote(clean_name)
            
            url = f"{self.api_base_url}?rand={self.rand}&id={encoded_name}"
            response = self.session.get(url)
            response.raise_for_status()
            data = response.json()
            
            if not data:
                raise Exception("Mod não encontrado")
                
            return data
        except Exception as e:
            raise Exception(f"Erro ao obter informações do mod {clean_name}: {str(e)}")

    def get_latest_compatible_version(self, mod_info: dict) -> str:
        """Retorna a versão mais recente compatível com Factorio 1.1"""
        try:
            for release in sorted(mod_info.get('releases', []), 
                               key=lambda x: x.get('released_at', ''), 
                               reverse=True):
                if release['info_json'].get('factorio_version', '') == '1.1':
                    return release['version']
            return None
        except Exception:
            return None

    def clean_dependency_name(self, dep_string: str) -> tuple[str, str, bool]:
        dep_string = dep_string.strip()
        
        is_required = True
        if dep_string.startswith('!') or dep_string.startswith('?'):
            is_required = False
            dep_string = dep_string[1:].strip()
        elif dep_string.startswith('~'):
            dep_string = dep_string[1:].strip()
            
        parts = dep_string.split('>=')
        mod_name = parts[0].strip()
        version = parts[1].strip() if len(parts) > 1 else "0.0.1"
        
        return (mod_name, version, is_required)

    def get_dependencies(self, mod_name: str) -> list:
        """Obtém a lista de dependências diretas de um mod"""
        try:
            mod_info = self.get_mod_info(mod_name)
            if not mod_info:
                return []

            latest_release = next(
                (r for r in sorted(mod_info.get('releases', []),
                                key=lambda x: x.get('released_at', ''),
                                reverse=True)
                if r['info_json'].get('factorio_version', '') == '1.1'),
                None
            )
            
            if not latest_release:
                return []

            dependencies = []
            for dep in latest_release['info_json'].get('dependencies', []):
                if dep.startswith('base'):
                    continue
                    
                name, version, is_required = self.clean_dependency_name(dep)
                
                if is_required:
                    dependencies.append((name, version))
            
            return dependencies
            
        except Exception as e:
            raise Exception(f"Erro ao obter dependências de {mod_name}: {str(e)}")

    def get_all_dependencies(self, mod_name: str, callback: Optional[Callable] = None) -> Dict[str, str]:
        """Obtém todas as dependências recursivamente."""
        all_deps = {}
        processed = set()

        def process_mod(name: str):
            if name in processed:
                return
            processed.add(name)
            
            try:
                deps = self.get_dependencies(name)
                for dep_name, dep_version in deps:
                    if dep_name not in all_deps and dep_name != "base":
                        all_deps[dep_name] = dep_version
                        if callback:
                            callback(f"Encontrada nova dependência: {dep_name} ({dep_version})")
                        process_mod(dep_name)
            except Exception as e:
                if callback:
                    callback(f"Erro ao processar dependências de {name}: {str(e)}")

        process_mod(mod_name)
        return all_deps
    def get_mod_versions(self, mod_name: str) -> list:
        try:
            url = f"https://mods.factorio.com/mod/{mod_name}/downloads"
            response = requests.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            versions = []
            for link in soup.find_all('a', href=True):
                if '/download/' in link['href']:
                    version_match = re.search(r'/download/(\d+\.\d+\.\d+)$', link['href'])
                    if version_match:
                        versions.append(version_match.group(1))
            
            return sorted(versions, key=lambda x: [int(i) for i in x.split('.')])
        except Exception as e:
            raise Exception(f"Erro ao obter versões de {mod_name}: {str(e)}")

    def find_compatible_version(self, mod_name: str, required_version: str) -> str:
        try:
            versions = self.get_mod_versions(mod_name)
            if not versions:
                return None
                
            required_parts = [int(x) for x in required_version.split('.')]
            
            for version in versions:
                current_parts = [int(x) for x in version.split('.')]
                
                is_compatible = True
                for req, curr in zip(required_parts, current_parts):
                    if curr < req:
                        is_compatible = False
                        break
                    elif curr > req:
                        break
                        
                if is_compatible:
                    return version
                    
            return versions[-1]
            
        except Exception:
            return None

    def download_mod(self, mod_name: str, version: str, modpack_folder: str, callback: Optional[Callable] = None) -> bool:
        """Baixa um mod específico."""
        try:
            mod_folder = os.path.join(self.download_path, modpack_folder)
            os.makedirs(mod_folder, exist_ok=True)
            
            mod_info = self.get_mod_info(mod_name)
            latest_compatible = self.get_latest_compatible_version(mod_info)
            
            if not latest_compatible:
                if callback:
                    callback(f"Nenhuma versão compatível encontrada para {mod_name}")
                return False
            
            file_path = os.path.join(mod_folder, f"{mod_name}_{latest_compatible}.zip")
            
            if os.path.exists(file_path):
                if callback:
                    callback(f"Mod {mod_name} já existe, pulando...")
                return False
            
            download_url = f"{self.download_base_url}/{mod_name}/{latest_compatible}.zip"
            response = self.session.get(download_url, stream=True)
            response.raise_for_status()
            
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            if callback:
                callback(f"Mod {mod_name} baixado com sucesso (versão {latest_compatible})")
            return True
                
        except Exception as e:
            if callback:
                callback(f"Erro ao baixar {mod_name}: {str(e)}")
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
            return False

    def download_mod_parallel(self, mod_info_tuple, modpack_folder: str, callback: Optional[Callable] = None) -> tuple:
        """Versão paralela do download_mod para uso com ThreadPoolExecutor"""
        mod_name, version = mod_info_tuple
        try:
            result = self.download_mod(mod_name, version, modpack_folder, callback)
            return (mod_name, result, None)
        except Exception as e:
            return (mod_name, False, str(e))

    def build_dependency_tree(self, mod_name: str, callback: Optional[Callable] = None) -> Dict[str, str]:
        """Versão otimizada do build_dependency_tree com processamento paralelo"""
        dependency_tree = {}
        processed = set()

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_mod = {
                executor.submit(self.get_dependencies, mod_name): (mod_name, None)
            }
            
            while future_to_mod:
                for future in as_completed(future_to_mod):
                    current_mod, required_version = future_to_mod[future]
                    try:
                        deps = future.result()
                        if required_version:
                            dependency_tree[current_mod] = required_version
                            
                        for dep_name, dep_version in deps:
                            if dep_name != "base" and dep_name not in processed:
                                processed.add(dep_name)
                                if callback:
                                    callback(f"Encontrada nova dependência: {dep_name} ({dep_version})")
                                future_to_mod[executor.submit(self.get_dependencies, dep_name)] = (dep_name, dep_version)
                                
                    except Exception as e:
                        if callback:
                            callback(f"Erro ao processar dependências de {current_mod}: {str(e)}")
                    
                    del future_to_mod[future]

        return dependency_tree

    def compare_versions(self, version1: str, version2: str) -> int:
        """
        Compara duas versões.
        Retorna:
         1 se version1 > version2
         0 se version1 == version2
        -1 se version1 < version2
        """
        v1_parts = [int(x) for x in version1.split('.')]
        v2_parts = [int(x) for x in version2.split('.')]
        
        for i in range(max(len(v1_parts), len(v2_parts))):
            v1 = v1_parts[i] if i < len(v1_parts) else 0
            v2 = v2_parts[i] if i < len(v2_parts) else 0
            
            if v1 > v2:
                return 1
            elif v1 < v2:
                return -1
                
        return 0

class ModDownloaderGUI:
    def __init__(self):
        self.downloader = ModDownloader()
        
        self.root = ctk.CTk()
        self.root.title("Factorio Mod Downloader")
        self.root.geometry("800x600")
        
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        self.main_frame = ctk.CTkFrame(self.root)
        self.main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        self.url_label = ctk.CTkLabel(self.main_frame, text="URL do ModPack:")
        self.url_label.pack(pady=5)
        
        self.url_entry = ctk.CTkEntry(self.main_frame, width=600)
        self.url_entry.pack(pady=5)
        
        self.download_button = ctk.CTkButton(
            self.main_frame, 
            text="Baixar ModPack", 
            command=self.start_download_thread
        )
        self.download_button.pack(pady=10)

        self.progress_frame = ctk.CTkFrame(self.main_frame)
        self.progress_frame.pack(pady=5, fill="x")
        self.progress_frame.pack_forget()
        
        self.progress_label = ctk.CTkLabel(self.progress_frame, text="")
        self.progress_label.pack(pady=5)
        
        self.progress_bar = ctk.CTkProgressBar(self.progress_frame, width=600)
        self.progress_bar.pack(pady=5)
        self.progress_bar.set(0)
        
        self.log_text = ctk.CTkTextbox(self.main_frame, width=600, height=400)
        self.log_text.pack(pady=10)
        
        self.is_downloading = False
        
    def log_message(self, message):
        self.root.after(0, self._log_message, message)

    def _log_message(self, message):
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        
    def toggle_ui_state(self, enabled: bool):
        state = "normal" if enabled else "disabled"
        self.url_entry.configure(state=state)
        self.download_button.configure(state=state)
        if enabled:
            self.progress_frame.pack_forget()
        else:
            self.progress_frame.pack(pady=5, fill="x", after=self.download_button)
            
    def download_thread(self):
        url = self.url_entry.get().strip()
        
        try:
            self.downloader.processed_mods.clear()
            modpack_name = url.split("/mod/")[1].split("/")[0]
            self.log_message(f"Iniciando análise do modpack: {modpack_name}")
            
            self.log_message("Construindo árvore de dependências...")
            dependency_tree = self.downloader.build_dependency_tree(modpack_name, self.log_message)
            
            download_queue = [(modpack_name, "1.1.0")] + list(dependency_tree.items())
            total_mods = len(download_queue)
            self.log_message(f"\nEncontradas {len(dependency_tree)} dependências no total")
            
            successful_downloads = []
            failed_downloads = []
            processed_mods = 0

            self.log_message("\nIniciando downloads paralelos...")
            
            with ThreadPoolExecutor(max_workers=self.downloader.max_workers) as executor:
                future_to_mod = {
                    executor.submit(self.downloader.download_mod_parallel, mod_info, modpack_name, self.log_message): mod_info
                    for mod_info in download_queue
                }
                
                for future in as_completed(future_to_mod):
                    mod_name, success, error = future.result()
                    processed_mods += 1
                    
                    if success:
                        successful_downloads.append(mod_name)
                        self.log_message(f"Download concluído: {mod_name}")
                    else:
                        failed_downloads.append((mod_name, error))
                        self.log_message(f"Erro ao baixar {mod_name}: {error}")
                    
                    progress = processed_mods / total_mods
                    self.root.after(0, self.update_progress, progress,
                                  f"Progresso: {processed_mods}/{total_mods} mods processados")

            self.log_message("\n=== Relatório Final ===")
            self.log_message(f"Total de mods processados: {processed_mods}")
            self.log_message(f"Downloads com sucesso: {len(successful_downloads)}")
            self.log_message(f"Downloads com falha: {len(failed_downloads)}")
            
            if failed_downloads:
                self.log_message("\nMods que falharam:")
                for mod_name, error in failed_downloads:
                    self.log_message(f"- {mod_name}: {error}")

            self.log_message("\nProcesso concluído!")
            
        except Exception as e:
            self.log_message(f"Erro geral: {str(e)}")
        finally:
            self.root.after(0, self.toggle_ui_state, True)
            self.is_downloading = False

    def update_progress(self, progress: float, text: str):
        self.progress_bar.set(progress)
        self.progress_label.configure(text=text)
    
    def start_download_thread(self):
        if self.is_downloading:
            return
            
        if not self.url_entry.get().strip():
            self.log_message("Por favor, insira uma URL válida")
            return
            
        self.is_downloading = True
        self.toggle_ui_state(False)
        download_thread = Thread(target=self.download_thread)
        download_thread.daemon = True
        download_thread.start()
    
    def run(self):
        self.root.mainloop()

if __name__ == "__main__":
    app = ModDownloaderGUI()
    app.run()