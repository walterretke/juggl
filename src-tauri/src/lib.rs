use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

/// Endereço do banco usado pelo front (`Database.load`). O arquivo fica na pasta
/// de configuração do app, resolvida pelo plugin SQL em cada sistema.
const DB_URL: &str = "sqlite:juggl.db";

/// Rótulo da janela flutuante de captura (definida em tauri.conf.json).
const JANELA_CAPTURA: &str = "captura";

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .on_window_event(|janela, evento| {
            // Sem bandeja ainda (semana 2): fechar a janela principal encerra o app,
            // senão ele continuaria rodando invisível por causa da janela de captura.
            if janela.label() == "main" {
                if let WindowEvent::CloseRequested { .. } = evento {
                    janela.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![abrir_captura, esconder_captura, definir_atalho])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
