# Juggl

Organizador desktop para quem é interrompido o dia todo: captura em segundos, uma caixa de entrada única e foco no que importa. Especificação completa no `juggl.pdf` do projeto.

Stack: Tauri 2 + React + TypeScript + Tailwind + SQLite local (Windows, macOS e Linux).

## Rodar em desenvolvimento

Pré-requisitos: Node 20+, Rust estável e os [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) do seu sistema (no Windows 11: Microsoft C++ Build Tools; o WebView2 já vem instalado).

```sh
npm install
npm run tauri dev
```

## Captura rápida

`Ctrl+Shift+Espaço` abre a captura sobre qualquer janela. Enter salva na caixa de entrada, Esc cancela.

| Marcação | Exemplo | Vira |
| --- | --- | --- |
| `@nome` | `@carlos` | quem pediu |
| `#projeto` | `#migracao` | projeto |
| `!prioridade` | `!alta`, `!media`, `!baixa` | prioridade |
| `>prazo` | `>hoje`, `>amanha`, `>sexta`, `>15/10` | prazo |

Um link do Teams, Jira, ServiceNow ou Azure DevOps na área de transferência é anexado com a origem reconhecida (o × remove). Tab completa `@` e `#` já usados.

## Triagem

A janela principal tem duas listas: **Caixa de entrada** (o que foi capturado) e **A fazer** (o que já foi triado, ordenado por prazo e prioridade). Tudo pelo teclado:

| Tecla | Ação |
| --- | --- |
| `↑` `↓` (ou `J` `K`) | navegar |
| `Enter` | mover da caixa de entrada para A fazer |
| `P` | prazo (`hoje`, `amanha`, `sexta`, `15/10`; vazio tira) |
| `1` `2` `3` `0` | prioridade alta, média, baixa, sem |
| `#` / `@` | projeto / quem pediu |
| `R` | renomear |
| `X` / `E` | concluir / arquivar |
| `Z` | desfazer |
| `O` | abrir o link |
| `Tab` | trocar de lista |
| `C` | capturar |

## Bandeja, configurações e backup

- Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. O ícone tem Capturar, Abrir o Juggl e Sair.
- Abrir o Juggl de novo só traz a janela existente. `juggl --captura` abre direto a captura (útil no Linux com Wayland: ligue esse comando a um atalho do sistema).
- O visual segue o tema do sistema: claro ou escuro.
- `,` abre as configurações: trocar o atalho da captura e fazer backup na hora.
- Todo dia uma cópia do banco vai para a subpasta `backups/`, guardando as 7 mais recentes.

## Testes

```sh
npm test
```

## Gerar o executável

```sh
npm run tauri build
```

No Windows, o `.exe` portátil fica em `src-tauri/target/release/juggl.exe` e os instaladores em `src-tauri/target/release/bundle/`. A cada push, o GitHub Actions também gera esses arquivos para Windows (aba Actions, artefato `juggl-windows`).

## Onde ficam os dados

O banco `juggl.db` fica na pasta de configuração do app (identificador `app.juggl`), nunca na pasta de instalação:

| Sistema | Pasta |
| --- | --- |
| Windows | `%APPDATA%\app.juggl\` |
| macOS | `~/Library/Application Support/app.juggl/` |
| Linux | `~/.config/app.juggl/` |

As migrations ficam em `src-tauri/migrations/` e rodam ao abrir o banco. O modo WAL é ligado na abertura.
