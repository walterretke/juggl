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

Toda atividade tem título e descrição. Se houver texto selecionado na janela em uso, ele vira a descrição (com as quebras de linha) e o título já vem preenchido como "Atividade 1", "Atividade 2"... e selecionado, para trocar digitando por cima. Título vazio com descrição também vira "Atividade N"; o número só avança quando esse nome é usado. Para pegar a seleção o Juggl simula o comando de copiar (Ctrl+Insert no Windows e no Linux, Cmd+C no macOS) e depois devolve a área de transferência como estava. Dá para desligar nas configurações. Limitações: no macOS o Juggl precisa da permissão de Acessibilidade; no Linux com Wayland não funciona; se a área de transferência tinha uma imagem, ela é trocada pelo texto copiado.

O modo padrão é um formulário: título, descrição (Shift+Enter quebra a linha), quem pediu e projeto (com sugestões dos nomes já usados), prioridade e prazo (Hoje, Amanhã ou um calendário). Tab passa de um campo para o outro, as setas escolhem a prioridade e o prazo, e Enter salva de qualquer campo.

As marcações abaixo também valem no título do formulário (`Liberar VPN @carlos >sexta`): o rodapé mostra o que foi reconhecido, e um campo preenchido vence a marcação. Um `#` seguido só de números (`Bug #4821`) fica no título.

`Ctrl+.` troca para o modo avançado, uma linha de título com marcações, mais a descrição embaixo (o modo escolhido fica salvo):

| Marcação | Exemplo | Vira |
| --- | --- | --- |
| `@nome` | `@carlos` | quem pediu |
| `#projeto` | `#migracao` | projeto |
| `!prioridade` | `!alta`, `!media`, `!baixa` (ou o nome de uma prioridade criada) | prioridade |
| `>prazo` | `>hoje`, `>amanha`, `>sexta`, `>15/10` | prazo |

Um link do Teams, Jira, ServiceNow ou Azure DevOps na área de transferência é anexado com a origem reconhecida (o × remove). Tab completa `@` e `#` já usados; nomes com espaço viram `_` (`@Carla_Dias`).

## Triagem

A janela principal tem a tela **Agora** (o item em foco) e três listas: **Caixa de entrada** (o que foi capturado), **A fazer** (o que já foi triado, ordenado por prazo e prioridade) e **Aguardando** (o que depende da resposta de alguém).

Com o mouse: o círculo conclui; passar o mouse mostra os botões de mover, focar, prioridade, prazo, link e arquivar; clicar no prazo ou na prioridade abre a escolha (com calendário); clicar em quem pediu ou no projeto edita; dois cliques no título renomeiam. Arraste um item para **Agora** (põe em foco), **A fazer** ou **Caixa de entrada** na barra lateral. O aviso de cada ação tem o botão Desfazer.

Pelo teclado:

| Tecla | Ação |
| --- | --- |
| `↑` `↓` (ou `J` `K`) | navegar |
| `Enter` | mover da caixa de entrada para A fazer |
| `P` | prazo (`hoje`, `amanha`, `sexta`, `15/10`; vazio tira) |
| `1` a `9`, `0` | prioridade na ordem das configurações, sem prioridade |
| `#` / `@` | projeto / quem pediu |
| `R` | renomear |
| `X` / `E` | concluir / arquivar |
| `Z` | desfazer |
| `O` | abrir o link |
| `W` | aguardando alguém (quem e quando cobrar) |
| `Ctrl+C` | copiar o status do item, pronto para responder no Teams |
| `F` | pôr o item em foco |
| `Tab` | trocar de tela |
| `C` | capturar |

## Busca

- `Ctrl+K` (ou `/`, ou "Buscar" na barra lateral) busca qualquer pedido pelo título, descrição, quem pediu, projeto ou número do chamado, sem ligar para acentos. Concluídos e arquivados também aparecem.
- Enter abre o item na lista dele. Um concluído ou arquivado volta para A fazer (`Z` desfaz). `Ctrl+C` copia o status.
- Sem nada digitado, a mesma janela lista os comandos: ir para uma tela, capturar, copiar a daily, abrir a mini-janela.

## Aguardando alguém

- `W` (ou a ampulheta do item) põe o item em **Aguardando**: diga de quem é a vez (Carlos, fornecedor, equipe de redes) e quando cobrar o retorno (amanhã, em 2 dias, em 1 semana ou outra data).
- O item sai de A fazer e de Hoje. No dia de cobrar, ele volta sozinho para A fazer com a etiqueta "cobrar Carlos" e o Juggl avisa (regra pronta **Cobrar retorno**, em Regras).
- Na lista Aguardando, Enter volta o item para A fazer. Focar ou concluir encerra a espera.

## Foco e timer

- A descrição aparece embaixo do título nas listas; clique nela, no ícone de linhas ou aperte `D` para editar (no Agora também). Enter salva, Shift+Enter quebra a linha.
- `F` em qualquer item põe ele em foco e abre a tela **Agora**, com o timer correndo. Só um item fica em foco por vez.
- Na tela Agora: `P` pausa (pergunta onde você parou), `X` conclui e `1` `2` `3` focam uma das próximas de A fazer.
- Trocar de foco pausa o item anterior com a nota de onde parou. Itens pausados voltam para A fazer mostrando essa nota.
- O tempo fica gravado nos eventos `foco_inicio` e `foco_fim`. Se o app for fechado ou o computador dormir no meio do foco, a sessão é encerrada no último minuto em que o app estava rodando.
- A bandeja mostra o item em foco e há quanto tempo, com a opção Pausar.
- A barra lateral mostra o item em foco com o timer e o botão de pausar; clicar abre a tela Agora, e soltar um item ali põe ele em foco.
- **Mini-janela**: o botão ao lado do timer (ou "Mini-janela" no Agora) abre uma faixa sempre por cima das outras janelas, com o foco, o timer e Pausar. Arraste pela faixa para mudar de lugar.
- Sem teclado nem mouse por 10 minutos (ajustável em Configurações, 0 desliga), o foco pausa sozinho e o tempo parado não conta. No Linux isso funciona no X11; no Wayland a pausa automática fica desligada.

## Ritual da manhã

- Na primeira abertura do dia, com algo pendente, o Juggl abre o **Ritual da manhã**: o que vence até amanhã (prazo ou promessa), o que alguém cobrou, o que ficou pausado, o resto de A fazer e a caixa de entrada.
- Escolha até 3 para o dia com clique, arrastando para o quadro Hoje ou com `Espaço` (setas andam). Arraste dentro do Hoje para mudar a ordem. Depois, **Começar o dia** (`Enter`); `Esc` pula. As escolhidas ganham a etiqueta "Do dia" e ficam no topo de A fazer e das próximas do Agora.
- Dá para pular. Se às 10h o ritual ainda não foi feito, o app lembra uma vez, com um aviso no topo e uma notificação (o horário se muda em Regras).
- **Copiar para a daily** (`Ctrl+C` em Meu dia) copia o que foi concluído no dia útil anterior (na segunda, a sexta), o que é para hoje e o que está aguardando alguém, pronto para colar na reunião.
- Com o banco vazio (a primeira vez de um colega), Meu dia mostra três passos: capturar, planejar e focar.

## Quem está cobrando

- `B` (ou o sininho do item, ou o botão no Agora) registra que quem pediu **cobrou de novo**. O item mostra "cobrou 2×", sobe em A fazer e entra no grupo "Alguém cobrou" do ritual. `Z` desfaz.
- `M` (ou clicar no prazo e escolher a aba "Prometi a…") guarda a data que você **prometeu** para quem pediu, separada do prazo. Ela aparece como "prometido sexta" e fica vermelha no dia e depois.
- A tela **Pessoas** lista quem pediu o quê, com busca (`/`), pedidos abertos e cobranças. **Copiar resumo** (`Ctrl+C`) gera uma mensagem pronta para colar no Teams com o status de cada pedido.
- Para arrumar pessoas: o lápis (`R`, ou dois cliques no nome) renomeia; a lixeira (`Delete`) exclui, e os pedidos continuam sem "quem pediu". Duplicadas ("carla" e "Carla") se juntam arrastando uma sobre a outra, ou renomeando uma com o nome da outra. Arrastar um pedido para outra pessoa troca quem pediu (`Z` desfaz).

## Notificações e regras

- A tela **Regras** liga e desliga as 6 regras prontas, cada uma com o seu número ou horário editável: prazo chegando (4 h antes), promessa esquecida (2 dias sem mexer), caixa de entrada acumulando (10 itens), ritual pendente (10:00), foco esquecido (timer há 2 h) e resumo do fim do dia (17:30, dias úteis). Prazo sem hora conta como vencendo às 18h.
- Cada aviso sai uma vez só, como notificação do Windows. Vários ao mesmo tempo viram uma notificação só.
- **Não perturbe** (ligado por padrão): enquanto há um item em foco, só as regras marcadas como **Urgente** notificam. O resto espera e chega junto quando você pausa ou conclui ("3 avisos enquanto você focava").
- **Regras personalizadas** (`N` ou "+ Nova regra"): escolha quem pediu, projeto, prioridade, prazo, há quantos dias está parado e se alguém já cobrou; depois, notificar ou colocar entre as do dia. O app mostra a regra como frase, por exemplo "Se quem pediu for Carlos e estiver parado há 2 dias ou mais, notificar".
- Teclado: setas escolhem, `Espaço` liga e desliga, `U` alterna urgente, `Enter` edita, `Delete` remove, `T` manda uma notificação de teste. Tudo também tem clique.
- **Últimos avisos** lista o que saiu e o que está esperando o foco acabar.

## Alerta de prioridade errada

- Cada item aberto tem uma pontuação de urgência, sem caixa-preta: prazo ou promessa (atrasado 50, hoje 40, amanhã 25, esta semana 10), 15 por cobrança (até 45), 2 por dia parado (até 20), prioridade contada de baixo (a última 0, a penúltima 10, as de cima 20) e 15 se é uma das 3 do dia.
- Ao começar um foco, se outro item está 30 pontos ou mais à frente, aparece no topo: "Talvez você devesse focar em Relatório de acessos: vence hoje e Carlos já cobrou 2 vezes". Durante o foco, avisa também quando uma cobrança nova ou um prazo chegando faz outro item passar à frente. Com a janela escondida, vem como notificação.
- Três respostas, com clique ou tecla: **Trocar agora** (`T`), **Continuar** (`C`, fica registrado; só avisa de novo se algum item ficar mais urgente) e **Adiar 30 min** (`A`). "Por quê?" mostra a conta dos dois itens.
- Nunca mais de uma vez por hora para o mesmo par. Liga e desliga na tela Regras (`P`).

## Azure DevOps

- Em Configurações (`,`), seção **Azure DevOps**: marque "Trazer os work items atribuídos a mim", informe a organização (o nome ou o endereço colado do navegador) e, se quiser, um projeto só.
- O token pessoal (PAT) vai para o cofre do sistema (Credential Manager no Windows), nunca para o banco. Crie em **User settings › Personal access tokens** com o escopo **Work Items: Read** e nada mais.
- A cada 10 minutos (ajustável) o Juggl busca os work items abertos atribuídos a você e põe os novos na caixa de entrada, com quem criou, projeto, prazo (Due Date ou Target Date), link e descrição. É só leitura: nada muda no Azure.
- Um work item que já entrou nunca volta, mesmo que você arquive ou conclua no Juggl.
- `S` (ou "Buscar no Azure DevOps" na caixa de entrada, ou "Sincronizar agora" nas configurações) busca na hora. **Testar conexão** confere organização e token sem gravar nada.

## Uso real e o que irrita

- A tela **Uso** acompanha as 4 semanas de uso real do plano: dias úteis com o Juggl aberto (meta 18 de 20), dias com ritual, quanto levou o apontamento de horas (da abertura de Horas até copiar ou exportar; meta menos de 5 min), cobranças recebidas e promessas que passaram do dia, e quantos colegas pediram para usar (`−` `+`).
- O período começa no dia em que esta versão abre pela primeira vez. **Recomeçar hoje** zera a contagem.
- `!` em qualquer tela (ou "Anotar o que irrita" na barra lateral) abre uma linha para anotar o que atrapalhou. A lista fica na tela Uso: `Espaço` marca como resolvida, `Delete` apaga, `Ctrl+C` copia tudo para colar numa conversa.

## Instalar e atualizar

- Baixe o instalador `.msi` (ou o `-setup.exe`) na página [Releases](https://github.com/walterretke/juggl-releases/releases/latest) e instale. O banco é o mesmo do `npm run tauri dev`: nada se perde.
- O Juggl procura versão nova ao abrir e a cada 6 horas. Quando há, aparece "Versão X disponível" no topo: **Instalar e reiniciar** (`I`). Em Configurações há "Procurar atualização".
- Para publicar uma versão: suba a versão em `src-tauri/tauri.conf.json` e `package.json`, crie a tag `vX.Y.Z` e envie (`git push origin vX.Y.Z`). O workflow "Publicar versão" gera o instalador, assina a atualização e publica.
- O código fica neste repositório; os instaladores saem no repositório público `walterretke/juggl-releases`. A publicação usa dois segredos deste repositório (Settings › Secrets and variables › Actions): `TAURI_SIGNING_PRIVATE_KEY`, que assina a atualização, e `RELEASES_TOKEN`, um token com Contents: Read and write no juggl-releases. Sem eles, a publicação falha.

## Horas da semana

- A tela **Horas da semana** soma o tempo em foco por projeto e por dia (segunda a domingo), com `‹` `›` (ou as setas `←` `→`) para trocar de semana. Clicar num projeto mostra os itens.
- Cada projeto pode ter um código de apontamento (clique em "+ código").
- **Lançar tempo** (`N`): reunião, atendimento por telefone ou o foco que ficou desligado. Diga o que foi (um item existente ou só uma descrição, como "Reunião de planejamento"), o projeto, o dia e a duração (`1h30`, `45min`, `1:30` ou `1,5`).
- Clique no tempo de um dia para ver as sessões dele: mude o início e o fim, passe a sessão para outro item (**Mover**) ou apague.
- Embaixo da tabela, escolha o formato de Copiar e do CSV: a tabela da semana (projetos × dias) ou uma linha por dia e projeto (Data, Código, Projeto, Horas), e se arredonda para 15 ou 30 minutos. A escolha fica salva.
- **Copiar** (`Ctrl+C`) põe a tabela na área de transferência, pronta para colar numa planilha. **Exportar CSV** (`Ctrl+S`) grava `juggl-horas-AAAA-MM-DD.csv` em Downloads (separado por `;`, abre direto no Excel). Os dois usam horas decimais: 1,50 é uma hora e meia.

## Bandeja, configurações e backup

- Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. O ícone tem o foco atual, Pausar, Capturar, Abrir o Juggl e Sair.
- Abrir o Juggl de novo só traz a janela existente. `juggl --captura` abre direto a captura (útil no Linux com Wayland: ligue esse comando a um atalho do sistema).
- `,` abre as configurações: tema (igual ao sistema, claro ou escuro), atalho da captura, uso do texto selecionado, minutos até a pausa por inatividade, prioridades (renomear, cor, ordem, criar e remover) e backup na hora.
- Todo dia uma cópia do banco vai para a subpasta `backups/`, guardando as 7 mais recentes.
- **Restaurar…** (em Configurações, Backup) volta o banco para um desses backups. Antes, o Juggl guarda o estado atual como um backup "antes de restaurar". Backups de uma versão anterior também servem.
- **Itens recorrentes** (em Configurações): tarefas que voltam todo dia útil, toda semana ou todo mês. No dia, o item aparece na caixa de entrada; se o app ficou fechado, entra um só.

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
