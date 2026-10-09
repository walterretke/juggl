use tauri_plugin_sql::{Migration, MigrationKind};

/// Endereço do banco usado pelo front (`Database.load`). O arquivo fica na pasta
/// de configuração do app, resolvida pelo plugin SQL em cada sistema.
const DB_URL: &str = "sqlite:juggl.db";

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "inicial",
        sql: include_str!("../migrations/0001_inicial.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
