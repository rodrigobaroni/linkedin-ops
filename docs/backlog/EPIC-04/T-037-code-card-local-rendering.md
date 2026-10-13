# T-037 · Render local de cards de código (Satori/Sharp/Resvg)

- Épico: EPIC-04 Draft Studio
- Responsável (papel/agente): Pêndulo (automação/integrações) · estilo por Aurora
- Branch/floor: `feat/T-037-code-card-rendering`
- Estado: todo (MVP corte — decisão pendente, PRD §13.7)
- Dependências: T-003 (MinIO), T-033

## Contexto

Quando `suggestedFormat = code-card`, o rascunho traz um snippet; o sistema renderiza localmente uma imagem (sem serviço externo) para prévia e publicação (T-040).

## Resultado esperado

Job `media.render_code_card` (snippet, linguagem, título, tema) → PNG via Satori + Resvg/Sharp, salvo no storage S3-compatible com URL assinada de curta duração; registro `MediaAsset` vinculado à `ContentVersion`; template visual aprovado por Aurora.

## Critérios de aceite (verificáveis)

- [ ] Render de snippet de 30 linhas em ≤ 3 s; dimensões 1200×1200 ou 1200×627.
- [ ] Snippet com caracteres especiais/HTML renderiza como texto.
- [ ] Storage indisponível → job falha com retry e o rascunho permanece válido como `text`.
- [ ] Nenhuma chamada externa durante o render (teste com rede bloqueada).

## Fora de escopo

Carrossel/documento; upload ao LinkedIn (T-040).

## Plano de teste

Vitest com snapshot de imagem (hash) e Testcontainers (MinIO).

## Riscos de segurança / compliance

Snippet é dado; fontes embutidas com licença compatível.
