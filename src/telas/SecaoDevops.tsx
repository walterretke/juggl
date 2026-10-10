import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { tempoParado } from "../captura/datas";
import {
  apagarToken,
  estadoDevops,
  gravarConfigDevops,
  lerConfigDevops,
  salvarToken,
  testarDevops,
  type ConfigDevops,
  type EstadoDevops,
} from "../db/devops";
import { normalizarOrganizacao } from "../integracoes/devops";

interface Props {
  /** Sincroniza agora (o Principal recarrega as listas). */
  aoSincronizar: () => Promise<void>;
}

const campo = "rounded-lg border border-linha bg-cartao px-3 py-1.5 text-[15px] outline-none focus:border-destaque";
const botao = "rounded-lg border border-linha px-3.5 py-2 text-sm hover:bg-etiqueta disabled:opacity-40";

function quando(iso: string): string {
  const t = tempoParado(iso, new Date());
  return t === "agora" ? "agora mesmo" : `há ${t}`;
}

/** Configurações do Azure DevOps: organização, projeto, token (no cofre do sistema) e intervalo. */
export default function SecaoDevops({ aoSincronizar }: Props) {
  const [config, setConfig] = useState<ConfigDevops | null>(null);
  const [estado, setEstado] = useState<EstadoDevops | null>(null);
  const [token, setToken] = useState("");
  const [trocandoToken, setTrocandoToken] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregarEstado = () => estadoDevops().then(setEstado);

  useEffect(() => {
    lerConfigDevops().then(setConfig);
    recarregarEstado();
  }, []);

  if (!config || !estado) return null;

  async function salvar(novo: ConfigDevops) {
    setConfig(novo);
    await gravarConfigDevops(novo);
  }

  async function guardarToken() {
    try {
      await salvarToken(token);
      setToken("");
      setTrocandoToken(false);
      setMensagem({ ok: true, texto: "Token guardado no cofre do sistema." });
      await recarregarEstado();
    } catch (e) {
      setMensagem({ ok: false, texto: String(e) });
    }
  }

  async function removerToken() {
    await apagarToken().catch((e) => setMensagem({ ok: false, texto: String(e) }));
    setMensagem({ ok: true, texto: "Token apagado do cofre." });
    await recarregarEstado();
  }

  async function executar(acao: () => Promise<string>) {
    setOcupado(true);
    setMensagem(null);
    try {
      setMensagem({ ok: true, texto: await acao() });
    } catch (e) {
      setMensagem({ ok: false, texto: String(e) });
    } finally {
      setOcupado(false);
      await recarregarEstado();
    }
  }

  const pronto = !!config.organizacao && estado.temToken;
  const paginaTokens = config.organizacao
    ? `https://dev.azure.com/${encodeURIComponent(config.organizacao)}/_usersSettings/tokens`
    : "https://dev.azure.com";

  return (
    <div>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.ligado}
          onChange={(e) => salvar({ ...config, ligado: e.target.checked })}
          className="mt-0.5 accent-destaque"
        />
        <span>
          Trazer para a caixa de entrada os work items atribuídos a mim
          <span className="block text-suave">Só leitura: o Juggl nunca muda nada no Azure DevOps.</span>
        </span>
      </label>

      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <span>Organização</span>
        <input
          value={config.organizacao}
          placeholder="empresa, ou cole o endereço dev.azure.com/empresa"
          onChange={(e) => setConfig({ ...config, organizacao: e.target.value })}
          onBlur={() => salvar({ ...config, organizacao: normalizarOrganizacao(config.organizacao) })}
          className={campo}
        />
        <span>Projeto</span>
        <input
          value={config.projeto}
          placeholder="Opcional: vazio traz de todos os projetos"
          onChange={(e) => setConfig({ ...config, projeto: e.target.value })}
          onBlur={() => salvar(config)}
          className={campo}
        />
        <span>Token</span>
        {estado.temToken && !trocandoToken ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-suave">Guardado no cofre do sistema.</span>
            <button type="button" onClick={() => setTrocandoToken(true)} className="text-destaque hover:underline">
              Trocar
            </button>
            <button type="button" onClick={removerToken} className="text-atraso hover:underline">
              Apagar
            </button>
          </span>
        ) : (
          <span className="flex gap-2">
            <input
              type="password"
              value={token}
              autoComplete="off"
              placeholder="Cole o token pessoal (PAT)"
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && token.trim()) {
                  e.preventDefault();
                  guardarToken();
                }
              }}
              className={`${campo} min-w-0 flex-1`}
            />
            <button
              type="button"
              disabled={!token.trim()}
              onClick={guardarToken}
              className="rounded-lg bg-destaque px-3 text-sm font-semibold text-folha hover:opacity-90 disabled:opacity-40"
            >
              Salvar
            </button>
          </span>
        )}
        <span>A cada</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={240}
            value={config.intervaloMin}
            onChange={(e) => setConfig({ ...config, intervaloMin: Number(e.target.value) })}
            onBlur={() => salvar(config)}
            className={`${campo} w-20 text-right`}
          />
          minutos
        </span>
      </div>

      <p className="mt-2 text-sm text-suave">
        Crie o token em{" "}
        <button type="button" onClick={() => openUrl(paginaTokens)} className="text-destaque hover:underline">
          User settings › Personal access tokens
        </button>{" "}
        com o escopo <strong>Work Items: Read</strong> e nada mais.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!pronto || ocupado}
          onClick={() =>
            executar(async () => {
              const n = await testarDevops(config);
              return `Conectado. ${n === 1 ? "1 work item aberto" : `${n} work items abertos`} atribuídos a você.`;
            })
          }
          className={botao}
        >
          Testar conexão
        </button>
        <button
          type="button"
          disabled={!pronto || ocupado}
          onClick={() =>
            executar(async () => {
              await aoSincronizar();
              return "Sincronizado.";
            })
          }
          className={botao}
        >
          Sincronizar agora <kbd className="ml-1 text-xs text-apagado">S</kbd>
        </button>
      </div>
      {mensagem ? (
        <p className={`mt-2 text-sm ${mensagem.ok ? "text-destaque" : "text-atraso"}`}>{mensagem.texto}</p>
      ) : estado.erro ? (
        <p className="mt-2 text-sm text-atraso">Última tentativa falhou: {estado.erro}</p>
      ) : estado.ultima ? (
        <p className="mt-2 text-sm text-suave">Última sincronização: {quando(estado.ultima)}.</p>
      ) : null}
    </div>
  );
}
