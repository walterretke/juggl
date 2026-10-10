//! Azure DevOps: busca os work items atribuídos a você, só leitura, com um token
//! pessoal (PAT). O token fica no cofre do sistema e nunca vai para o banco nem
//! para a interface: a interface só pede para salvar, apagar ou usar.

use base64::Engine;
use serde::Serialize;
use serde_json::{json, Value};

const SERVICO_COFRE: &str = "juggl";
const USUARIO_COFRE: &str = "azure-devops";
const VERSAO_API: &str = "7.1";
/// O endpoint de lote aceita no máximo 200 ids por chamada.
const LOTE: usize = 200;
/// Quantos itens abertos trazer no máximo por sincronização.
const MAXIMO: usize = 400;

/// Estados que contam como encerrados (processos Agile, Scrum, Basic e CMMI, em inglês e português).
const ESTADOS_FECHADOS: &[&str] = &[
    "Closed", "Done", "Removed", "Resolved", "Completed", "Cut", "Fechado", "Concluído", "Removido", "Resolvido",
];

const CAMPOS: &[&str] = &[
    "System.Id",
    "System.Title",
    "System.State",
    "System.WorkItemType",
    "System.TeamProject",
    "System.CreatedBy",
    "System.Description",
    "Microsoft.VSTS.Scheduling.DueDate",
    "Microsoft.VSTS.Scheduling.TargetDate",
];

/// Work item no formato que a interface usa para criar o item da caixa de entrada.
#[derive(Debug, Serialize, PartialEq)]
pub struct ItemDevops {
    pub id: u64,
    pub titulo: String,
    pub tipo: String,
    pub estado: String,
    pub projeto: String,
    pub criado_por: Option<String>,
    /// HTML, como vem do Azure.
    pub descricao: Option<String>,
    /// Data e hora ISO (DueDate ou, se não houver, TargetDate).
    pub prazo: Option<String>,
    pub link: String,
}

fn entrada_cofre() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICO_COFRE, USUARIO_COFRE).map_err(|e| format!("Cofre do sistema indisponível: {e}"))
}

fn ler_token() -> Result<Option<String>, String> {
    match entrada_cofre()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Não consegui ler o token do cofre do sistema: {e}")),
    }
}

#[tauri::command]
pub fn devops_salvar_token(token: String) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("O token está vazio.".into());
    }
    entrada_cofre()?
        .set_password(token)
        .map_err(|e| format!("Não consegui guardar o token no cofre do sistema: {e}"))
}

#[tauri::command]
pub fn devops_apagar_token() -> Result<(), String> {
    match entrada_cofre()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Não consegui apagar o token: {e}")),
    }
}

#[tauri::command]
pub fn devops_tem_token() -> Result<bool, String> {
    Ok(ler_token()?.is_some())
}

/// Endereço base. Em desenvolvimento, `JUGGL_DEVOPS_URL` aponta para um servidor de teste.
fn base() -> String {
    #[cfg(debug_assertions)]
    if let Ok(url) = std::env::var("JUGGL_DEVOPS_URL") {
        return url.trim_end_matches('/').to_string();
    }
    "https://dev.azure.com".into()
}

/// Texto entre aspas simples na WIQL (aspas internas dobradas).
fn texto_wiql(texto: &str) -> String {
    format!("'{}'", texto.replace('\'', "''"))
}

fn consulta_wiql(projeto: Option<&str>) -> String {
    let fechados: Vec<String> = ESTADOS_FECHADOS.iter().map(|e| texto_wiql(e)).collect();
    let mut wiql = format!(
        "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @Me AND [System.State] NOT IN ({})",
        fechados.join(", ")
    );
    if let Some(p) = projeto {
        wiql.push_str(&format!(" AND [System.TeamProject] = {}", texto_wiql(p)));
    }
    wiql.push_str(" ORDER BY [System.ChangedDate] DESC");
    wiql
}

/// Trecho de URL (organização e projeto podem ter espaço e acento).
fn trecho_url(texto: &str) -> String {
    texto
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn texto_do_campo(campos: &Value, nome: &str) -> Option<String> {
    campos.get(nome).and_then(Value::as_str).map(str::to_string).filter(|s| !s.trim().is_empty())
}

/// Converte um item da resposta de `workitemsbatch`.
fn item_da_resposta(base: &str, organizacao: &str, valor: &Value) -> Option<ItemDevops> {
    let id = valor.get("id")?.as_u64()?;
    let campos = valor.get("fields")?;
    let projeto = texto_do_campo(campos, "System.TeamProject").unwrap_or_default();
    // CreatedBy vem como identidade ({displayName, uniqueName}) ou, em APIs antigas, como texto.
    let criado_por = match campos.get("System.CreatedBy") {
        Some(Value::Object(o)) => o.get("displayName").and_then(Value::as_str).map(str::to_string),
        Some(Value::String(s)) => Some(s.split(" <").next().unwrap_or(s).to_string()),
        _ => None,
    };
    Some(ItemDevops {
        id,
        titulo: texto_do_campo(campos, "System.Title").unwrap_or_else(|| format!("Work item {id}")),
        tipo: texto_do_campo(campos, "System.WorkItemType").unwrap_or_default(),
        estado: texto_do_campo(campos, "System.State").unwrap_or_default(),
        link: format!("{base}/{}/{}/_workitems/edit/{id}", trecho_url(organizacao), trecho_url(&projeto)),
        projeto,
        criado_por,
        descricao: texto_do_campo(campos, "System.Description"),
        prazo: texto_do_campo(campos, "Microsoft.VSTS.Scheduling.DueDate")
            .or_else(|| texto_do_campo(campos, "Microsoft.VSTS.Scheduling.TargetDate")),
    })
}

/// Mensagem em português para cada falha comum.
fn erro_http(status: reqwest::StatusCode, organizacao: &str, projeto: Option<&str>) -> String {
    match status.as_u16() {
        // Token inválido costuma vir como 203 com a página de login, não como 401.
        203 | 401 => "O Azure DevOps recusou o token. Ele pode ter expirado ou estar errado: gere outro e salve de novo.".into(),
        403 => "O token não tem permissão de leitura de work items (escopo Work Items: Read).".into(),
        404 => match projeto {
            Some(p) => format!("Não achei o projeto \"{p}\" na organização \"{organizacao}\"."),
            None => format!("Não achei a organização \"{organizacao}\"."),
        },
        _ => format!("O Azure DevOps respondeu com erro {status}."),
    }
}

async fn postar(
    cliente: &reqwest::Client,
    url: &str,
    autorizacao: &str,
    corpo: Value,
    organizacao: &str,
    projeto: Option<&str>,
) -> Result<Value, String> {
    let resposta = cliente
        .post(url)
        .header("Authorization", autorizacao)
        .header("Accept", "application/json")
        .json(&corpo)
        .send()
        .await
        .map_err(|e| format!("Sem conexão com o Azure DevOps: {e}"))?;
    let status = resposta.status();
    let html = resposta
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/html"));
    if !status.is_success() || status.as_u16() == 203 || html {
        return Err(erro_http(if html { reqwest::StatusCode::NON_AUTHORITATIVE_INFORMATION } else { status }, organizacao, projeto));
    }
    resposta.json::<Value>().await.map_err(|e| format!("Resposta inesperada do Azure DevOps: {e}"))
}

/// Busca os work items abertos atribuídos a quem é dono do token.
#[tauri::command]
pub async fn devops_buscar(organizacao: String, projeto: Option<String>) -> Result<Vec<ItemDevops>, String> {
    let organizacao = organizacao.trim().to_string();
    if organizacao.is_empty() {
        return Err("Informe a organização do Azure DevOps.".into());
    }
    let projeto = projeto.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    let token = ler_token()?.ok_or("Nenhum token salvo. Cole o token pessoal (PAT) nas configurações.")?;
    let autorizacao = format!("Basic {}", base64::engine::general_purpose::STANDARD.encode(format!(":{token}")));
    let cliente = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let base = base();
    let org = trecho_url(&organizacao);

    let url_wiql = match &projeto {
        Some(p) => format!("{base}/{org}/{}/_apis/wit/wiql?api-version={VERSAO_API}&$top={MAXIMO}", trecho_url(p)),
        None => format!("{base}/{org}/_apis/wit/wiql?api-version={VERSAO_API}&$top={MAXIMO}"),
    };
    let wiql = postar(
        &cliente,
        &url_wiql,
        &autorizacao,
        json!({ "query": consulta_wiql(projeto.as_deref()) }),
        &organizacao,
        projeto.as_deref(),
    )
    .await?;
    let ids: Vec<u64> = wiql
        .get("workItems")
        .and_then(Value::as_array)
        .map(|lista| lista.iter().filter_map(|w| w.get("id").and_then(Value::as_u64)).take(MAXIMO).collect())
        .unwrap_or_default();

    let mut itens = Vec::new();
    for lote in ids.chunks(LOTE) {
        let resposta = postar(
            &cliente,
            &format!("{base}/{org}/_apis/wit/workitemsbatch?api-version={VERSAO_API}"),
            &autorizacao,
            json!({ "ids": lote, "fields": CAMPOS }),
            &organizacao,
            projeto.as_deref(),
        )
        .await?;
        if let Some(valores) = resposta.get("value").and_then(Value::as_array) {
            itens.extend(valores.iter().filter_map(|v| item_da_resposta(&base, &organizacao, v)));
        }
    }
    Ok(itens)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn wiql_filtra_atribuidos_abertos_e_escapa_o_projeto() {
        let q = consulta_wiql(Some("D'Ávila"));
        assert!(q.contains("[System.AssignedTo] = @Me"));
        assert!(q.contains("'Closed'") && q.contains("'Concluído'"));
        assert!(q.contains("[System.TeamProject] = 'D''Ávila'"));
        assert!(!consulta_wiql(None).contains("TeamProject"));
    }

    #[test]
    fn trecho_de_url_codifica_espaco_e_acento() {
        assert_eq!(trecho_url("Minha Org"), "Minha%20Org");
        assert_eq!(trecho_url("Gestão"), "Gest%C3%A3o");
    }

    #[test]
    fn converte_item_da_resposta() {
        let valor = json!({
            "id": 42,
            "fields": {
                "System.Title": "Liberar VPN",
                "System.State": "Active",
                "System.WorkItemType": "Task",
                "System.TeamProject": "Infra TI",
                "System.CreatedBy": { "displayName": "Carlos Souza", "uniqueName": "carlos@empresa.com" },
                "System.Description": "<div>Oi</div>",
                "Microsoft.VSTS.Scheduling.TargetDate": "2026-10-15T03:00:00Z"
            }
        });
        let item = item_da_resposta("https://dev.azure.com", "empresa", &valor).unwrap();
        assert_eq!(item.titulo, "Liberar VPN");
        assert_eq!(item.criado_por.as_deref(), Some("Carlos Souza"));
        assert_eq!(item.prazo.as_deref(), Some("2026-10-15T03:00:00Z"));
        assert_eq!(item.link, "https://dev.azure.com/empresa/Infra%20TI/_workitems/edit/42");
    }

    #[test]
    fn criado_por_em_texto_tira_o_email() {
        let valor = json!({ "id": 1, "fields": { "System.CreatedBy": "Ana Lima <ana@empresa.com>" } });
        let item = item_da_resposta("https://dev.azure.com", "e", &valor).unwrap();
        assert_eq!(item.criado_por.as_deref(), Some("Ana Lima"));
        assert_eq!(item.titulo, "Work item 1");
    }

    /// Ida e volta no cofre de verdade. Roda no Windows (CI), onde o Credential Manager sempre existe.
    #[test]
    #[cfg(windows)]
    fn cofre_guarda_le_e_apaga() {
        let entrada = keyring::Entry::new("juggl-teste", "azure-devops").unwrap();
        entrada.set_password("abc123").unwrap();
        assert_eq!(entrada.get_password().unwrap(), "abc123");
        entrada.delete_credential().unwrap();
        assert!(matches!(entrada.get_password(), Err(keyring::Error::NoEntry)));
    }
}
