# Deploy na VPS: resultados-eleicao.yvesscopy.com

**Suba antes das 17h.** O coletor precisa estar rodando quando a apuração começar: o que o TSE publica não dá para
baixar de novo depois. Antes da apuração ele faz cerca de 1 requisição a cada 20 s.

## 0. Pré-requisitos
- VPS Ubuntu com Docker e o plugin compose (`docker compose version`).
- DNS: registro `A` de `resultados-eleicao.yvesscopy.com` apontando para o IP da VPS. Com Cloudflare, pode deixar
  "proxied" (nuvem laranja), com SSL/TLS em **Full**.

## 1. Copiar o projeto
**Opção 1, via GitHub** (repositório privado `sandes-blip/apuracao-eleicao-2026`; a VPS precisa de acesso:
`gh auth login` ou um token/deploy key):
```bash
sudo git clone https://github.com/sandes-blip/apuracao-eleicao-2026.git /opt/apuracao && cd /opt/apuracao
sudo cp .env.example .env && sudo nano .env   # preencher ANTHROPIC_API_KEY e POSTGRES_PASSWORD
```
Para atualizar durante a noite: `sudo git pull && sudo docker compose up -d --build motor web` (os dados em `data/` ficam).

**Opção 2, via pacote.** Na máquina local:
```bash
./infra/empacotar.sh                        # gera dist/apuracao-2026.tar.gz (inclui a base do 1º turno e os mapas)
scp dist/apuracao-2026.tar.gz usuario@IP_DA_VPS:/opt/
```
Na VPS:
```bash
sudo mkdir -p /opt/apuracao && cd /opt/apuracao
sudo tar xzf /opt/apuracao-2026.tar.gz
sudo cp .env.example .env && sudo nano .env   # preencher ANTHROPIC_API_KEY e POSTGRES_PASSWORD
```

## 2. Subir
**Opção A: portas 80/443 livres na VPS** (HTTPS automático via Caddy):
```bash
sudo docker compose --profile https up -d --build
```
**Opção B: já existe nginx/Traefik na VPS**: suba sem o Caddy e aponte o proxy existente para `127.0.0.1:8080`:
```bash
sudo docker compose up -d --build
```
Exemplo de bloco para um nginx já existente:
```nginx
server {
    server_name resultados-eleicao.yvesscopy.com;
    location / { proxy_pass http://127.0.0.1:8080; proxy_set_header Host $host; }
    # (certificado via certbot ou Cloudflare origin cert)
}
```

## 3. Conferir que está coletando
```bash
sudo docker compose ps                                   # postgres, coletor, motor, web (e caddy) "running"
sudo docker compose logs -f --tail 50 coletor            # "EA12: 5757 municípios", depois ciclos
curl -s http://127.0.0.1:8080/data/status.json           # status "aguardando" antes das 17h, "ao_vivo" depois
ls -la data/raw/6258/latest | head                       # arquivos do 2º turno chegando
wc -l data/raw/6258/index.jsonl                          # cresce a cada arquivo novo baixado
```
Depois das 17h, `data/raw/6258/index.jsonl` deve crescer continuamente e o portal deve mostrar o percentual de seções.

## 4. Durante a noite
- Atualizar portal ou motor **sem parar o coletor**: `sudo docker compose up -d --build motor web`
- Reiniciar só o motor: `sudo docker compose restart motor`
- Logs da IA: `sudo docker compose logs motor | grep -i "análise"`; auditoria completa em `data/state/ia_log.jsonl`
- Alertas (WhatsApp via Evolution API ou e-mail): preencher as variáveis `EVOLUTION_*` / `SMTP_*` no `.env` e
  `sudo docker compose up -d coletor motor`.
- Se o TSE responder 403/429, o coletor pausa 60 s sozinho. Nunca aumente `TSE_RPS` acima de 20.

## 5. Cloudflare (recomendado)
- Regra de cache para `resultados-eleicao.yvesscopy.com/data/*`: "Respect origin" (o nginx manda `max-age=15`).
- Não cachear HTML por muito tempo (o nginx manda `no-cache` no `index.html`).

## 6. Recarregar a base do 1º turno (só se necessário)
A base já vai no pacote (`data/base/base_1turno.parquet`). Para baixar de novo do TSE (~6 min, 15 req/s):
```bash
sudo docker compose run --rm motor python -m apuracao.base.carga
```

## 7. Depois da eleição
- **Trocar a chave da API da Anthropic** (ela foi compartilhada em conversa).
- Fazer backup de `data/raw/` (fonte de auditoria e replay) e do volume do Postgres.
- Rodar o backtest com os snapshots reais de 2026 e recalibrar `backtest/params_calibrados.json`.
