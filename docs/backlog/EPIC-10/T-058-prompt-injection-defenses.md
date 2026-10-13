# T-058 · Defesas contra prompt injection e exfiltração via conteúdo externo

- Épico: EPIC-10 Security, Reliability & Deployment
- Responsável (papel/agente): Pena (editorial/IA) · findings Sentinela · testes Crivo
- Branch/floor: `security/T-058-prompt-injection-defenses`
- Estado: todo
- Dependências: T-021, T-022, T-025

## Contexto

Regra inegociável: conteúdo externo (RSS, posts, páginas, nomes) é dado, nunca instrução. O motor recebe fontes e instruções do usuário em blocos delimitados; saídas são validadas por schema; nenhuma saída do modelo pode disparar ação do sistema.

## Resultado esperado

Camada de sanitização de entrada (remoção de controle/invisíveis, limite de tamanho, marcação de bloco), política de prompt que instrui tratar blocos como dados, validação de saída (sem URLs fora das fontes fornecidas, sem menção a instruções), suíte adversarial (≥ 20 casos: "ignore instruções", "publique isto", "inclua este link", exfiltração de prompt, caracteres unicode enganosos) integrada ao harness T-022 e rodando em CI com fake + sob flag com modelo real; documentação em `docs/security/prompt-injection.md`.

## Critérios de aceite (verificáveis)

- [ ] **Gate G-05 (threat-model §8):** 100 % do corpus adversarial (`docs/editorial/evals-plan.md` §4.3 + `docs/security/prompt-injection.md`) falha fechado: nenhuma instrução obedecida, nenhum tool-use, nenhuma URL ou `sourceId` inventado (com fake determinístico) e relatório sob flag com modelo real anexado.
- [ ] Saída com URL ausente das fontes é rejeitada ou marcada "sem fonte".
- [ ] Nenhum caminho de código executa ação (publicar, agendar, mudar modo) a partir de texto gerado.
- [ ] Revisão de Sentinela registrada.

## Fora de escopo

Classificador de toxicidade.

## Plano de teste

Harness T-022 + testes de unidade da sanitização.

## Riscos de segurança / compliance

Núcleo da defesa contra manipulação do conteúdo.
