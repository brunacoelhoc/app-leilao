# Backup do banco do Docker (pg_dump) em backups\leiloes-AAAA-MM-DD_HHmm.sql
# Uso (na raiz do projeto):  .\scripts\backup-banco.ps1
# Restaurar:  Get-Content backups\ARQUIVO.sql | docker compose exec -T postgres psql -U leiloes -d leiloes
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

New-Item -ItemType Directory -Force backups | Out-Null
$arquivo = "backups\leiloes-$(Get-Date -Format 'yyyy-MM-dd_HHmm').sql"

# --clean --if-exists: o dump recria as tabelas, entao da para restaurar por cima
docker compose exec -T postgres pg_dump -U leiloes -d leiloes --clean --if-exists | Set-Content -Encoding utf8 $arquivo
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou (o container do banco esta de pe?)' }

"Backup salvo em $arquivo ($([math]::Round((Get-Item $arquivo).Length / 1KB)) KB)"
