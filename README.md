# Factorio Mod Manager

Um gerenciador de mods simples para o Factorio, construído com Rust (Tauri) + React + TypeScript.

## Pré-requisitos

- Node.js (v18 ou superior)
- Rust
- Visual Studio Build Tools 2022 (para Windows)

## Como executar

### Desenvolvimento (Windows)
```bash
# Opção 1: Usar o script batch (recomendado)
.\dev.bat

# Opção 2: Executar manualmente
cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" && npm run tauri dev'
```

### Desenvolvimento (outras plataformas)
```bash
npm run tauri dev
```

## Estrutura do Projeto

- `src/` - Frontend React + TypeScript
- `src-tauri/` - Backend Rust
- `public/` - Assets estáticos

## Scripts Disponíveis

- `npm run dev` - Inicia apenas o servidor Vite (frontend)
- `npm run build` - Compila o projeto para produção
- `npm run tauri dev` - Inicia o aplicativo Tauri em modo desenvolvimento
- `npm run tauri build` - Compila o aplicativo final

## Próximos Passos

1. Configurar a interface básica
2. Implementar comunicação Rust-React
3. Adicionar funcionalidades de gerenciamento de mods

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
