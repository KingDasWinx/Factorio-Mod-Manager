# Abbyte Manager

Gerenciador de mods para Factorio feito com Tauri (Rust) + React/TypeScript. Projeto acadêmico (faculdade), sem fins lucrativos, voltado a estudo e uso pessoal.

> Aviso: Este projeto não é afiliado, endossado ou associado à Wube Software/Factorio. Marcas e nomes pertencem aos seus respectivos proprietários.

## Finalidade

Simplificar a descoberta, instalação, atualização e gerenciamento de mods do Factorio, com foco em:
- Download rápido e confiável (com retomada) para arquivos grandes.
- Resolução automática de dependências, respeitando a versão do Factorio exigida por cada mod pai.
- Perfis independentes de mods, com troca instantânea via link/junção no diretório do Factorio.
- Fluxo “um clique” para jogar (botão RUN) com o perfil ativo.

## Funcionalidades

- Catálogo de mods (API oficial)
	- Busca por nome, filtros básicos e cache local.
	- Proxy no backend para evitar CORS no frontend.
- Detalhes de mods e releases
	- Dependências alinhadas à versão do Factorio do mod pai.
	- Ignora “base” e marcações opcionais/incompatíveis.
- Fila de downloads robusta
	- Abas: Todos, Baixados, Pendentes.
	- Pausar/retomar/limpar; estatísticas abaixo do cabeçalho.
	- Escrita bufferizada, progresso com throttling, detecção de travamento e retomada via HTTP Range.
- Meus Mods
	- Lista com rolagem; ações em massa: Ativar todos, Desativar todos (estilo amarelo), Excluir todos (com confirmação).
- Perfis
	- Criar/editar/excluir perfis (cada um com pasta própria de mods e configs).
	- Persistência do perfil ativo em AppData/Roaming/ModManager/.config.
	- Link automático do diretório de mods do Factorio para a pasta de mods do perfil ativo.
		- Windows: usa junção de diretório (mklink /J), dispensando privilégios de administrador.
		- Se existir uma pasta real “mods”, é feito backup para “mods-backup[-timestamp]”.
- Executar o jogo (RUN)
	- Botão na sidebar.
	- Usa o executável do perfil (se definido) ou o global.
	- Se não houver caminho, abre seletor e salva como padrão.

## Tecnologias

- Frontend
	- React + TypeScript + Vite
	- Ícones: lucide-react
	- Integração com Tauri (invoke/events)
- Backend (Tauri v2 / Rust)
	- reqwest (HTTP), tokio (assíncrono), serde (JSON), regex, chrono, dirs
	- Eventos de progresso; comandos para downloads, resolver de dependências, perfis, link de mods e execução do jogo

## Estrutura do Projeto

- `src/` — Frontend React + TypeScript (componentes, contextos, estilos)
- `src-tauri/` — Backend Rust (comandos Tauri, resolver, fila de downloads, perfis)
- `public/` — Assets estáticos

## Pré-requisitos

- Node.js (LTS recomendado)
- Rust + Cargo (compatível com Tauri v2)
- Windows: Visual Studio Build Tools 2022 (C++), ou toolchain equivalente nas demais plataformas

## Como executar (desenvolvimento)

Windows (PowerShell):

```powershell
# Opção 1: script (se disponível)
./dev.bat

# Opção 2: manual
cmd /c '"C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\Tools\\VsDevCmd.bat" && npm run tauri dev'
```

Outras plataformas:

```bash
npm run tauri dev
```

Build desktop (exemplos):

```bash
npm run build
npm run tauri build
```

## Configurações

- App: `AppData/Roaming/ModManager/.config` (JSON)
	- Ex.: cache_expiry_hours, game_exe_path, selected_profile.
- Perfil: `profile.config` em cada perfil (nome, mods_path, factorio_exe_path, etc.).

## Roadmap / Checklist futuro

- [ ]

## Bugs conhecidos


## Idiomas

- Interface atual em Português. Em breve suporte a mais idiomas.

## Contribuição

Contribuições são bem-vindas! Abra issues, proponha PRs e sugira melhorias. Como é um projeto acadêmico e sem fins lucrativos, feedbacks e ajuda com testes/portabilidade (Windows/Linux/macOS) são muito bem-vindos.

- Siga o estilo do projeto e mantenha mudanças focadas.
- Descreva claramente o problema e a solução proposta.
- Não inclua segredos/credenciais nos commits.

## Aviso legal

- Projeto educacional para faculdade, sem fins lucrativos.
- Sem vínculo com a Wube Software/Factorio. Use por sua conta e risco.
- Respeite os termos de uso do Factorio e dos autores de mods.
