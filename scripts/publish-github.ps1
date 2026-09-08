# Publica CRM/ no clone GitHub ../DISPARO DE MSG/ (raiz do repo, sem pasta CRM/).
# Nao copia .env, node_modules, .next, data, logs nem .git.
# Nao faz git commit nem push — isso e passo seguinte no clone.

$ErrorActionPreference = 'Stop'

$source = Split-Path -Parent $PSScriptRoot
$dest = Join-Path (Split-Path -Parent $source) 'DISPARO DE MSG'

if (-not (Test-Path -LiteralPath $dest)) {
  throw "Clone de publicacao nao encontrado: $dest"
}

$destGit = Join-Path $dest '.git'
if (-not (Test-Path -LiteralPath $destGit)) {
  throw "Destino nao e um git: $destGit"
}

Write-Host "Fonte: $source"
Write-Host "Destino: $dest"

$xd = @(
  '.git'
  'node_modules'
  '.next'
  'data'
  'logs'
  '.impeccable'
  'coverage'
  'test-results'
  'playwright-report'
  'blob-report'
)

$xf = @(
  '.env'
  '.env.local'
  'tsconfig.tsbuildinfo'
  'tsc-out.txt'
  'next-env.d.ts'
)

$args = @($source, $dest, '/E', '/NFL', '/NDL', '/NJH', '/NP')
foreach ($dir in $xd) {
  $args += '/XD'
  $args += $dir
}
foreach ($file in $xf) {
  $args += '/XF'
  $args += $file
}

& robocopy @args
$code = $LASTEXITCODE
# Robocopy: 0-7 = sucesso (bits de copiado/extra). 8+ = falha.
if ($code -ge 8) {
  throw "robocopy falhou com codigo $code"
}

$copiedEnv = Get-ChildItem -LiteralPath $dest -Filter '.env' -File -ErrorAction SilentlyContinue
if ($copiedEnv) {
  throw "Abortado: .env apareceu no destino. Nao publique."
}

Write-Host "Copia ok (robocopy $code). Proximo: cd `"$dest`"; git status; git add; commit; push."
exit 0
