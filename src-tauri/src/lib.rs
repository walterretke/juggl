use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Endereço do banco usado pelo front (`Database.load`). O arquivo fica na pasta
/// de configuração do app, resolvida pelo plugin SQL em cada sistema.
const DB_URL: &str = "sqlite:juggl.db";

/// Rótulos das janelas definidas em tauri.conf.json.
const JANELA_PRINCIPAL: &str = "main";
const JANELA_CAPTURA: &str = "captura";

/// Argumento de linha de comando que abre a captura (`juggl --captura`). Serve de
/// alternativa no Linux com Wayland, onde o atalho global pode não funcionar:
/// basta ligar esse comando a um atalho do próprio GNOME ou KDE.
const ARG_CAPTURA: &str = "--captura";

/// Subpasta de backups dentro da pasta de dados e quantos arquivos manter.
const PASTA_BACKUPS: &str = "backups";
const BACKUPS_MANTIDOS: usize = 7;

/// Atalho global registrado no momento, para poder trocá-lo depois.
#[derive(Default)]
struct AtalhoAtual(Mutex<Option<Shortcut>>);

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "inicial",
        sql: include_str!("../migrations/0001_inicial.sql"),
        kind: MigrationKind::Up,
    }]
}

fn agora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Mostra a captura sobre qualquer janela e avisa o front do momento do atalho,
/// para medir a meta de 3 segundos.
fn mostrar_captura(app: &AppHandle) {
    let momento = agora_ms();
    if let Some(janela) = app.get_webview_window(JANELA_CAPTURA) {
        let _ = janela.center();
        let _ = janela.show();
        let _ = janela.set_focus();
        let _ = janela.emit("captura:aberta", momento);
    }
}

fn mostrar_principal(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window(JANELA_PRINCIPAL) {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

#[tauri::command]
fn abrir_captura(app: AppHandle) {
    mostrar_captura(&app);
}

/// Esconde a captura. Com `devolver_foco` (Enter ou Esc), o foco volta à janela que
/// estava em uso: no Windows e no Linux isso acontece ao esconder; no macOS é preciso
/// esconder o app inteiro. Na perda de foco o usuário já está em outra janela.
#[tauri::command]
fn esconder_captura(app: AppHandle, devolver_foco: bool) {
    if let Some(janela) = app.get_webview_window(JANELA_CAPTURA) {
        let _ = janela.hide();
    }
    #[cfg(target_os = "macos")]
    if devolver_foco {
        let _ = app.hide();
    }
    #[cfg(not(target_os = "macos"))]
    let _ = devolver_foco;
}

/// Registra o atalho global da captura (ex.: "Ctrl+Shift+Space"), trocando o anterior.
/// Devolve erro legível se o atalho for inválido ou já estiver em uso por outro app.
#[tauri::command]
fn definir_atalho(app: AppHandle, estado: State<AtalhoAtual>, atalho: String) -> Result<(), String> {
    let novo: Shortcut = atalho
        .parse()
        .map_err(|e| format!("Atalho inválido \"{atalho}\": {e}"))?;
    let mut atual = estado.0.lock().map_err(|e| e.to_string())?;
    if *atual == Some(novo) {
        return Ok(());
    }
    let atalhos = app.global_shortcut();
    atalhos
        .register(novo)
        .map_err(|e| format!("Não foi possível registrar {atalho}: {e}"))?;
    if let Some(antigo) = atual.replace(novo) {
        let _ = atalhos.unregister(antigo);
    }
    Ok(())
}

fn pasta_backups(app: &AppHandle) -> Result<PathBuf, String> {
    // Mesma pasta onde o plugin SQL guarda o juggl.db.
    let pasta = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(PASTA_BACKUPS);
    fs::create_dir_all(&pasta).map_err(|e| format!("Não foi possível criar {}: {e}", pasta.display()))?;
    Ok(pasta)
}

/// Caminho para um novo backup com o nome dado (ex.: "juggl-2026-10-09.db"),
/// ou `None` se esse arquivo já existe. O front grava com `VACUUM INTO`.
#[tauri::command]
fn caminho_backup(app: AppHandle, nome: String) -> Result<Option<String>, String> {
    if !nome.starts_with("juggl-") || !nome.ends_with(".db") || nome.contains(['/', '\\']) {
        return Err(format!("Nome de backup inválido: {nome}"));
    }
    let caminho = pasta_backups(&app)?.join(nome);
    Ok((!caminho.exists()).then(|| caminho.to_string_lossy().into_owned()))
}

/// Apaga os backups mais antigos, mantendo os últimos `BACKUPS_MANTIDOS`.
/// Devolve os que ficaram, do mais novo para o mais antigo.
#[tauri::command]
fn limpar_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let pasta = pasta_backups(&app)?;
    let mut nomes: Vec<String> = fs::read_dir(&pasta)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .filter(|n| n.starts_with("juggl-") && n.ends_with(".db"))
        .collect();
    // Os nomes começam com a data AAAA-MM-DD, então a ordem alfabética é a cronológica.
    nomes.sort_unstable_by(|a, b| b.cmp(a));
    for antigo in nomes.iter().skip(BACKUPS_MANTIDOS) {
        let _ = fs::remove_file(pasta.join(antigo));
    }
    nomes.truncate(BACKUPS_MANTIDOS);
    Ok(nomes
        .into_iter()
        .map(|n| pasta.join(n).to_string_lossy().into_owned())
        .collect())
}

fn criar_bandeja(app: &tauri::App) -> tauri::Result<()> {
    let capturar = MenuItem::with_id(app, "capturar", "Capturar", true, None::<&str>)?;
    let abrir = MenuItem::with_id(app, "abrir", "Abrir o Juggl", true, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&capturar, &abrir, &sair])?;

    let mut bandeja = TrayIconBuilder::with_id("juggl")
        .tooltip("Juggl")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id().as_ref() {
            "capturar" => mostrar_captura(app),
            "abrir" => mostrar_principal(app),
            "sair" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|bandeja, evento| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = evento
            {
                mostrar_principal(bandeja.app_handle());
            }
        });
    if let Some(icone) = app.default_window_icon() {
        bandeja = bandeja.icon(icone.clone());
    }
    bandeja.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Precisa ser o primeiro plugin: abrir o Juggl de novo só traz a janela
        // existente (ou a captura, com --captura) em vez de iniciar outra cópia.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == ARG_CAPTURA) {
                mostrar_captura(app);
            } else {
                mostrar_principal(app);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    if evento.state() == ShortcutState::Pressed {
                        mostrar_captura(app);
                    }
                })
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .manage(AtalhoAtual::default())
        .setup(|app| {
            criar_bandeja(app)?;
            if std::env::args().any(|a| a == ARG_CAPTURA) {
                mostrar_captura(app.handle());
            }
            Ok(())
        })
        .on_window_event(|janela, evento| {
            // Fechar a janela principal só a esconde: o Juggl continua na bandeja,
            // com o atalho global ativo. Para sair de verdade, use "Sair" na bandeja.
            if janela.label() == JANELA_PRINCIPAL {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    let _ = janela.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            abrir_captura,
            esconder_captura,
            definir_atalho,
            caminho_backup,
            limpar_backups
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
