# T-040 · Publicação com imagem (upload de mídia pela API oficial)

- Épico: EPIC-05 Scheduling & LinkedIn Publishing
- Responsável (papel/agente): Pêndulo (automação/integrações)
- Branch/floor: `feat/T-040-publish-image-media`
- Estado: todo
- Dependências: T-039, T-037 (ou upload manual de imagem no estúdio)

## Contexto

Posts com imagem (code-card renderizado ou imagem enviada por Rodrigo) exigem registro/upload do asset antes da criação do post, dentro da mesma transação idempotente.

## Resultado esperado

Extensão do job de publicação: se a versão tem `MediaAsset`, faz upload pela API oficial (registro + PUT do binário), grava `linkedinAssetUrn` no `MediaAsset` (idempotente: reutiliza se já existir), cria o post referenciando o asset; upload manual de imagem no estúdio (`POST /content-items/:id/media`, validação de tipo/tamanho, armazenamento S3).

## Critérios de aceite (verificáveis)

- [ ] Retry após falha pós-upload reutiliza o `linkedinAssetUrn` e não reenvia nem duplica post.
- [ ] Imagem acima do limite da API é rejeitada no estúdio com mensagem clara.
- [ ] Texto alternativo (alt) obrigatório para imagem enviada.
- [ ] Teste com fake cobre sucesso, falha no upload, falha no post.

## Fora de escopo

Carrossel/documento; vídeo.

## Plano de teste

Testcontainers (MinIO) + fake LinkedIn.

## Riscos de segurança / compliance

Validação de tipo de arquivo (magic bytes); sem URLs públicas permanentes para assets.
