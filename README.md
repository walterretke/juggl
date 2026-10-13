# Juggl

Organizador desktop para quem é interrompido o dia todo: captura em segundos, uma caixa de entrada única e foco no que importa. Especificação completa no `juggl.pdf` do projeto.

Stack: Tauri 2 + React + TypeScript + Tailwind + SQLite local (Windows, macOS e Linux).

## Rodar em desenvolvimento

Pré-requisitos: Node 20+, Rust estável e os [pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) do seu sistema (no Windows 11: Microsoft C++ Build Tools; o WebView2 já vem instalado).

```sh
npm install
npm run tauri dev
```

## Nova tarefa

`Ctrl+Shift+Espaço` abre a janela de nova tarefa sobre qualquer janela. Enter (de qualquer lugar da janela) ou o botão Salvar grava, Esc cancela. Em "Entra em" você escolhe a coluna: Chegou (caixa de entrada), Hoje (Meu dia) ou A fazer; a escolha fica lembrada.

Toda atividade tem título e descrição. Se houver texto selecionado na janela em uso, ele vira a descrição (com as quebras de linha) e o título já vem preenchido como "Atividade 1", "Atividade 2"... e selecionado, para trocar digitando por cima. Título vazio com descrição também vira "Atividade N"; o número só avança quando esse nome é usado. Para pegar a seleção o Juggl simula o comando de copiar (Ctrl+Insert no Windows e no Linux, Cmd+C no macOS) e depois devolve a área de transferência como estava. Dá para desligar nas configurações. Limitações: no macOS o Juggl precisa da permissão de Acessibilidade; no Linux com Wayland não funciona; se a área de transferência tinha uma imagem, ela é trocada pelo texto copiado.

O modo padrão é um formulário: título, descrição com formatação (negrito, itálico, tachado e listas; Shift+Enter quebra a linha), quem pediu e projeto (com sugestões dos nomes já usados), prioridade e prazo (Hoje, Amanhã, Esta semana, Este mês ou um calendário). A descrição é guardada em Markdown. Tab passa de um campo para o outro, as setas escolhem a prioridade e o prazo, e Enter salva de qualquer campo.

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

A janela principal tem a tela **Agora** (o item em foco) e as listas: **Caixa de entrada** (as tarefas novas), **A fazer** (o que já foi triado, ordenado por prazo e prioridade), **Aguardando** (o que depende da resposta de alguém) e **Fechadas** (concluídas e arquivadas, com busca e "Restaurar", que devolve cada tarefa para a lista em que estava).

Clicar num cartão do Meu dia, `A` ou dois cliques numa linha abrem a tarefa para editar tudo de uma vez (título, descrição, quem pediu, projeto, prioridade e prazo), com Focar, Concluir, Arquivar e Apagar. Na descrição, Enter quebra a linha e `Ctrl+Enter` salva; as quebras de linha aparecem na lista. Apagar tira a tarefa de vez (`Z` desfaz); as horas já trabalhadas nela continuam nas Horas da semana.

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
| `A` | abrir a tarefa para editar |
| `X` / `E` | concluir / arquivar |
| `Delete` | apagar (`Z` desfaz) |
| `Z` | desfazer |
| `O` | abrir o link |
| `W` | aguardando alguém (quem e quando cobrar) |
| `Ctrl+C` | copiar o status do item, pronto para responder no Teams |
| `F` | pôr o item em foco |
| `Tab` | trocar de tela |
| `C` | nova tarefa |

## Busca

- `Ctrl+K` (ou `/`, ou "Buscar" na barra lateral) busca qualquer pedido pelo título, descrição, quem pediu, projeto ou número do chamado, sem ligar para acentos. Concluídos e arquivados também aparecem.
- Enter abre o item na lista dele. Um concluído ou arquivado volta para a lista em que estava (`Z` desfaz). `Ctrl+C` copia o status.
- Sem nada digitado, a mesma janela lista os comandos: ir para uma tela, criar uma tarefa, copiar a daily, abrir o overlay de foco, ligar o som.

## Aguardando alguém

- `W` (ou a ampulheta do item) põe o item em **Aguardando**: diga de quem é a vez (Carlos, fornecedor, equipe de redes) e quando cobrar o retorno (amanhã, em 2 dias, em 1 semana ou outra data).
- O item sai de A fazer e de Hoje. No dia de cobrar, ele volta sozinho para A fazer com a etiqueta "cobrar Carlos" e o Juggl avisa (regra pronta **Cobrar retorno**, em Regras).
- Na lista Aguardando, Enter volta o item para A fazer. Focar ou concluir encerra a espera.

## Foco e timer

- Clique num cartão (ou `A`/`D` numa lista) para abrir o editor da tarefa: descrição formatada, checklist de passos (arraste para reordenar), anexos e horário na agenda. Enter quebra a linha, `Ctrl+Enter` salva.
- `F` em qualquer item põe ele em foco e abre a tela **Agora**, com o timer correndo. Só um item fica em foco por vez.
- Na tela Agora: `P` para o timer (pergunta onde você parou; a tarefa continua aberta), `X` conclui a tarefa (`Z` desfaz) e `1` `2` `3` focam uma das próximas de A fazer.
- Trocar de foco pausa o item anterior com a nota de onde parou. Itens pausados voltam para A fazer mostrando essa nota.
- O tempo fica gravado nos eventos `foco_inicio` e `foco_fim`. Se o app for fechado ou o computador dormir no meio do foco, a sessão é encerrada no último minuto em que o app estava rodando.
- A bandeja mostra o item em foco e há quanto tempo, com a opção Parar timer.
- A barra lateral mostra o item em foco com o timer e o botão de pausar; clicar abre a tela Agora, e soltar um item ali põe ele em foco.
- **Overlay de foco**: ao começar um foco abre uma faixa discreta no canto inferior direito, sempre por cima e quase transparente até o mouse passar. Tem o timer, o som, Pausar (depois, Retomar) e Finalizar, que pede uma mensagem de encerramento opcional, guardada na tarefa. Desliga em Configurações; o botão ao lado do timer (ou "Overlay no canto" no Agora) abre na hora.
- **Sons para focar**: no Agora e em Meu dia, o botão Som toca ruído marrom, rosa, chuva ou ondas (gerados no próprio app, funcionam offline) ou uma rádio (lofi, ambiente, clássica, jazz; precisa de internet). Dá para tocar sozinho quando um foco começa; para quando o timer para.
- Sem teclado nem mouse por 10 minutos (ajustável em Configurações, 0 desliga), o foco pausa sozinho e o tempo parado não conta. No Linux isso funciona no X11; no Wayland a pausa automática fica desligada.

## Agenda

A tela **Agenda** mostra mês, semana ou dia, como o Google Agenda. Tarefas com horário aparecem no horário; as sem horário ficam na faixa "Sem horário" do dia planejado ou do prazo. Arraste uma tarefa para um horário para marcar, ou para a faixa de cima para tirar o horário. Clique num horário vazio para criar um compromisso (que pode repetir todo dia, nos dias úteis, em certos dias da semana ou todo mês) ou uma tarefa. Na visão do mês, o que se repete fica discreto. O botão 24h mostra o dia inteiro sem rolar; a escolha fica salva. `←` `→` mudam o período e `T` volta para hoje.

## Fechadas e apagar

**Fechadas** lista as tarefas concluídas e arquivadas, com busca; "Restaurar" devolve para a coluna de onde a tarefa saiu. `Delete` (ou a lixeira) apaga uma tarefa, e `Z` desfaz. Uma tarefa apagada sai das Horas da semana, do projeto e de todos os totais.

## Anexos

No editor da tarefa, "Anexar arquivo", arrastar ou colar (`Ctrl+V`) adiciona anexos, até 15 MB cada. Fotos e prints são reduzidos para no máximo 1600 px e convertidos para WebP; os outros arquivos são guardados com gzip quando isso economiza espaço. Imagens abrem numa prévia; o resto abre no programa padrão. "Salvar em Downloads" grava uma cópia.

## Ritual da manhã

- Na primeira abertura do dia, com algo pendente, o Juggl abre o **Ritual da manhã**: o que vence até amanhã (prazo ou promessa), o que alguém cobrou, o que ficou pausado, o resto de A fazer e a caixa de entrada.
- Escolha o que vai fazer no dia com clique, arrastando para o quadro Hoje ou com `Espaço` (setas andam). Arraste dentro do Hoje para mudar a ordem. Depois, **Começar o dia** (`Enter`); `Esc` pula. As escolhidas ganham a etiqueta "Do dia" e ficam no topo de A fazer e das próximas do Agora.
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

- Cada item aberto tem uma pontuação de urgência, sem caixa-preta: prazo ou promessa (atrasado 50, hoje 40, amanhã 25, esta semana 10), 15 por cobrança (até 45), 2 por dia parado (até 20), prioridade contada de baixo (a última 0, a penúltima 10, as de cima 20) e 15 se está em Hoje.
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

- Fechar a janela deixa o Juggl na bandeja do sistema, com o atalho ativo. O ícone tem o foco atual, Parar timer, Nova tarefa, Abrir o Juggl e Sair.
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
