mod ocioso;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Serialize;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent, Wry};
use tauri_plugin_clipboard_manager::ClipboardExt;
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

/// Se o atalho copia o texto selecionado na janela em uso para a descrição.
/// Ligado por padrão; o front desliga conforme a configuração salva.
struct UsarSelecao(AtomicBool);

/// Quanto esperar o outro app colocar a seleção na área de transferência.
const ESPERA_COPIA: Duration = Duration::from_millis(25);
const TENTATIVAS_COPIA: u32 = 8;

/// Itens do menu da bandeja que mudam com o foco.
struct MenuFoco {
    foco: MenuItem<Wry>,
    pausar: MenuItem<Wry>,
}

const SEM_FOCO: &str = "Nada em foco";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "inicial",
            sql: include_str!("../migrations/0001_inicial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "prioridades",
            sql: include_str!("../migrations/0002_prioridades.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "regras",
            sql: include_str!("../migrations/0003_regras.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

fn agora_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Enviado ao front quando a captura abre.
#[derive(Clone, Serialize)]
struct CapturaAberta {
    /// Momento do atalho, para medir a meta de 3 segundos.
    momento: u64,
    /// Texto que estava selecionado na janela em uso, se havia.
    selecao: Option<String>,
}

/// Mostra a captura sobre qualquer janela.
fn mostrar_captura(app: &AppHandle) {
    abrir_captura_com(app, agora_ms(), None);
}

fn abrir_captura_com(app: &AppHandle, momento: u64, selecao: Option<String>) {
    if let Some(janela) = app.get_webview_window(JANELA_CAPTURA) {
        let _ = janela.center();
        let _ = janela.show();
        let _ = janela.set_focus();
        let _ = janela.emit("captura:aberta", CapturaAberta { momento, selecao });
    }
}

/// Pelo atalho global: antes de mostrar a captura, copia o que estiver selecionado
/// na janela em uso. Com a cópia ligada, espera a tecla ser solta: no Linux (X11) o
/// atalho prende o teclado enquanto está apertado e a janela em uso não receberia o
/// comando de copiar. Roda fora da thread principal porque espera a cópia.
fn capturar_pelo_atalho(app: &AppHandle, estado: ShortcutState) {
    let usar_selecao = app.state::<UsarSelecao>().0.load(Ordering::Relaxed);
    if !usar_selecao {
        if estado == ShortcutState::Pressed {
            abrir_captura_com(app, agora_ms(), None);
        }
        return;
    }
    if estado != ShortcutState::Released {
        return;
    }
    let momento = agora_ms();
    let app = app.clone();
    thread::spawn(move || {
        let selecao = copiar_selecao(&app);
        abrir_captura_com(&app, momento, selecao);
    });
}

/// Pede ao app em uso para copiar a seleção, lê o texto e devolve a área de
/// transferência como estava. Sem seleção, nada muda e o resultado é `None`.
fn copiar_selecao(app: &AppHandle) -> Option<String> {
    let area = app.clipboard();
    let antes = area.read_text().ok();
    // Esvazia antes de copiar: se a seleção for igual ao que já estava copiado,
    // comparar com o texto anterior não perceberia a cópia.
    let _ = area.write_text(String::new());
    let mut copiado = None;
    if let Err(e) = enviar_copiar() {
        eprintln!("Não foi possível copiar a seleção: {e}");
    } else {
        for _ in 0..TENTATIVAS_COPIA {
            thread::sleep(ESPERA_COPIA);
            if let Ok(agora) = area.read_text() {
                if !agora.is_empty() {
                    copiado = Some(agora);
                    break;
                }
            }
        }
    }
    // Devolve o que a pessoa tinha copiado, tenha havido seleção ou não.
    let _ = area.write_text(antes.unwrap_or_default());
    // Vira a descrição: mantém as quebras de linha, sem espaços sobrando nem linhas vazias repetidas.
    let mut linhas: Vec<String> = Vec::new();
    for linha in copiado?.lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")) {
        if !(linha.is_empty() && linhas.last().is_some_and(|l| l.is_empty())) {
            linhas.push(linha);
        }
    }
    let texto = linhas.join("\n").trim().to_string();
    (!texto.is_empty()).then_some(texto)
}

/// Simula o atalho de copiar. As teclas do atalho global ainda estão apertadas,
/// então os modificadores são soltos antes. No Windows e no Linux usa Ctrl+Insert
/// em vez de Ctrl+C: num terminal sem seleção, Ctrl+C interromperia o programa.
fn enviar_copiar() -> Result<(), String> {
    let mut teclado = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let mut tecla = |k: Key, d: Direction| teclado.key(k, d).map_err(|e| e.to_string());
    for modificador in [Key::Shift, Key::Alt, Key::Control, Key::Meta] {
        tecla(modificador, Direction::Release)?;
    }
    #[cfg(target_os = "macos")]
    let (modificador, copiar) = (Key::Meta, Key::Unicode('c'));
    #[cfg(not(target_os = "macos"))]
    let (modificador, copiar) = (Key::Control, Key::Insert);
    tecla(modificador, Direction::Press)?;
    tecla(copiar, Direction::Click)?;
    tecla(modificador, Direction::Release)
}

/// Segundos desde o último uso do teclado ou do mouse, ou `None` se o sistema não informa.
#[tauri::command]
fn tempo_ocioso() -> Option<u64> {
    ocioso::segundos_ocioso()
}

/// Grava um CSV na pasta Downloads (ou na pasta pessoal, se o sistema não tiver uma) e devolve o caminho. Um nome já usado ganha
/// " (2)", " (3)"... para não sobrescrever exportações antigas.
#[tauri::command]
fn salvar_csv(app: AppHandle, nome: String, conteudo: String) -> Result<String, String> {
    if !nome.ends_with(".csv") || nome.contains(['/', '\\']) {
        return Err(format!("Nome de arquivo inválido: {nome}"));
    }
    let pasta = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|_| "Não encontrei a pasta Downloads nem a pasta pessoal.".to_string())?;
    let base = nome.trim_end_matches(".csv");
    let mut caminho = pasta.join(&nome);
    let mut n = 2;
    while caminho.exists() {
        caminho = pasta.join(format!("{base} ({n}).csv"));
        n += 1;
    }
    fs::write(&caminho, conteudo).map_err(|e| format!("Não foi possível gravar {}: {e}", caminho.display()))?;
    Ok(caminho.to_string_lossy().into_owned())
}

/// Liga ou desliga o uso do texto selecionado (configuração salva no banco).
#[tauri::command]
fn definir_usar_selecao(estado: State<UsarSelecao>, usar: bool) {
    estado.0.store(usar, Ordering::Relaxed);
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
fn definir_atalho(
    app: AppHandle,
    estado: State<AtalhoAtual>,
    atalho: String,
) -> Result<(), String> {
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
    fs::create_dir_all(&pasta)
        .map_err(|e| format!("Não foi possível criar {}: {e}", pasta.display()))?;
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

/// Mostra na bandeja o item em foco e o tempo (ex.: "Relatório do AD · 0:42"),
/// ou que não há nada em foco. O front chama a cada minuto e a cada troca.
#[tauri::command]
fn atualizar_bandeja(app: AppHandle, menu: State<MenuFoco>, foco: Option<String>) {
    let texto = foco.as_deref().unwrap_or(SEM_FOCO);
    let _ = menu.foco.set_text(texto);
    let _ = menu.pausar.set_enabled(foco.is_some());
    if let Some(bandeja) = app.tray_by_id("juggl") {
        let dica = foco.map_or_else(|| "Juggl".to_string(), |f| format!("Juggl · {f}"));
        let _ = bandeja.set_tooltip(Some(dica));
    }
}

fn criar_bandeja(app: &tauri::App) -> tauri::Result<()> {
    let foco = MenuItem::with_id(app, "foco", SEM_FOCO, false, None::<&str>)?;
    let pausar = MenuItem::with_id(app, "pausar", "Pausar", false, None::<&str>)?;
    let separador = PredefinedMenuItem::separator(app)?;
    let capturar = MenuItem::with_id(app, "capturar", "Capturar", true, None::<&str>)?;
    let abrir = MenuItem::with_id(app, "abrir", "Abrir o Juggl", true, None::<&str>)?;
    let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&foco, &pausar, &separador, &capturar, &abrir, &sair])?;
    app.manage(MenuFoco { foco, pausar });

    let mut bandeja = TrayIconBuilder::with_id("juggl")
        .tooltip("Juggl")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, evento| match evento.id().as_ref() {
            "capturar" => mostrar_captura(app),
            // Quem pausa é o front, que grava a sessão no banco.
            "pausar" => {
                let _ = app.emit_to(JANELA_PRINCIPAL, "bandeja:pausar", ());
            }
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
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _atalho, evento| {
                    capturar_pelo_atalho(app, evento.state());
                })
                .build(),
        )
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .manage(AtalhoAtual::default())
        .manage(UsarSelecao(AtomicBool::new(true)))
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
            limpar_backups,
            atualizar_bandeja,
            definir_usar_selecao,
            tempo_ocioso,
            salvar_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
