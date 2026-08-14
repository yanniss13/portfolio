# Génère les deux PDF du CV depuis cv.html via Edge headless.
#   - version publique  -> ../assets/CV-BOUZID-Yanniss.pdf        (sans téléphone, publiée en ligne)
#   - version privée    -> hors du dépôt, avec téléphone          (candidatures directes)
# Usage : powershell -File cv/build-cv.ps1

$ErrorActionPreference = "Stop"
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo    = Split-Path -Parent $here
$edge    = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$privDir = "C:\Users\yanni\Desktop\Yanniss Pro"

if (-not (Test-Path $edge)) { throw "Edge introuvable : $edge" }

function Build-Pdf($srcHtml, $outPdf) {
  if (Test-Path $outPdf) { Remove-Item $outPdf -Force }
  $prof = Join-Path $env:TEMP ("cvbuild-" + [guid]::NewGuid().ToString("N").Substring(0,8))
  # Les chemins peuvent contenir des espaces : sans guillemets explicites,
  # Edge les lit comme plusieurs cibles et refuse de demarrer.
  $url = "file:///" + ($srcHtml -replace '\\','/')
  $a = @(
    "--headless=new", "--disable-gpu", "--user-data-dir=`"$prof`"", "--no-first-run",
    "--no-pdf-header-footer", "--virtual-time-budget=12000",
    "--print-to-pdf=`"$outPdf`"", "`"$url`""
  )
  Start-Process -FilePath $edge -ArgumentList $a -NoNewWindow -Wait | Out-Null
  Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $outPdf)) { throw "Echec de generation : $outPdf" }
  Write-Output ("  {0}  ({1} Ko)" -f (Split-Path -Leaf $outPdf), [math]::Round((Get-Item $outPdf).Length/1KB))
}

# --- Version publique : cv.html ne contient pas le numero, rien a retirer ---
Write-Output "Version publique :"
Build-Pdf (Join-Path $here "cv.html") (Join-Path $repo "assets\CV-BOUZID-Yanniss.pdf")

# --- Version privee : le telephone est injecte depuis un fichier non versionne ---
$phoneFile = Join-Path $here "phone.local.txt"
if (-not (Test-Path $phoneFile)) {
  Write-Output ""
  Write-Output "Version privee ignoree : cv/phone.local.txt absent."
  Write-Output "  Cree ce fichier avec ton numero pour generer la variante privee."
} else {
  Write-Output "Version privee :"
  $phone = (Get-Content $phoneFile -Raw -Encoding UTF8).Trim()
  $tmp = Join-Path $here "_cv-prive.html"
  $html = Get-Content (Join-Path $here "cv.html") -Raw -Encoding UTF8
  $tel  = "tel:+33" + ($phone -replace '[^0-9]','').Substring(1)
  $line = '<li><span class="ico">T</span><a href="' + $tel + '">' + $phone + '</a></li>'
  # Marqueur explicite plutot qu'un motif devinant la structure HTML :
  # une regex sur le balisage casse en silence des qu'on edite cv.html.
  if ($html -notmatch '<!--PHONE_SLOT-->') {
    throw "Marqueur <!--PHONE_SLOT--> introuvable dans cv.html : la variante privee serait generee SANS numero. Corrige cv.html avant de relancer."
  }
  $html = $html.Replace('<!--PHONE_SLOT-->', $line)
  Set-Content -Path $tmp -Value $html -Encoding UTF8
  try {
    if (-not (Test-Path $privDir)) { New-Item -ItemType Directory -Force -Path $privDir | Out-Null }
    Build-Pdf $tmp (Join-Path $privDir "CV-BOUZID-Yanniss-prive.pdf")
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Write-Output ""
Write-Output "Termine. La version privee est hors du depot : elle ne sera jamais publiee."
