param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$OutDir,
  [string]$MapJson = "",
  [int]$WebLong = 2000,
  [int]$WebQ = 82,
  [int]$ThumbLong = 900,
  [int]$ThumbQ = 78,
  [switch]$Force,
  [string[]]$SkipDirs = @()
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$map = @{}
if ($MapJson -and (Test-Path -LiteralPath $MapJson)) {
  $json = [System.IO.File]::ReadAllText($MapJson, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($p in $json.PSObject.Properties) { $map[$p.Name] = $p.Value }
}
function Slug([string]$s) {
  if ($map.ContainsKey($s)) { return $map[$s] }
  return ($s -replace '[^\w\-]', '-').ToLower()
}

$webDir   = Join-Path $OutDir 'web'
$thumbDir = Join-Path $OutDir 'thumb'
New-Item -ItemType Directory -Force -Path $webDir, $thumbDir | Out-Null

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Save-Jpeg($bmp, [string]$path, [int]$q) {
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$q)
  $bmp.Save($path, $codec, $ps); $ps.Dispose()
}
function Resize-To($srcImg, [int]$longEdge) {
  $w = $srcImg.Width; $h = $srcImg.Height
  $m = [Math]::Max($w, $h)
  if ($m -le $longEdge) { return $null }
  $scale = $longEdge / $m
  $bmp = New-Object System.Drawing.Bitmap ([int][Math]::Round($w * $scale)), ([int][Math]::Round($h * $scale))
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
  $g.DrawImage($srcImg, 0, 0, $bmp.Width, $bmp.Height); $g.Dispose()
  return $bmp
}

$exts = '^\.(jpg|jpeg|png)$'
$folders = Get-ChildItem -LiteralPath $Root -Directory | Where-Object { $SkipDirs -notcontains $_.Name }
$manifest = @()
$used = @{}
$done = 0; $skip = 0; $fail = 0; $total = 0; $collisions = 0
foreach ($d in $folders) { $total += (Get-ChildItem -LiteralPath $d.FullName -Recurse -File | Where-Object { $_.Extension -match $exts }).Count }
Write-Output "total images: $total"

foreach ($d in $folders) {
  $slug = Slug $d.Name
  if (-not $used.ContainsKey($slug)) { $used[$slug] = New-Object 'System.Collections.Generic.HashSet[string]' }
  $wd = Join-Path $webDir $slug;   New-Item -ItemType Directory -Force -Path $wd | Out-Null
  $td = Join-Path $thumbDir $slug; New-Item -ItemType Directory -Force -Path $td | Out-Null
  $files = Get-ChildItem -LiteralPath $d.FullName -Recurse -File | Where-Object { $_.Extension -match $exts } | Sort-Object FullName
  foreach ($f in $files) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $safe = ($base -replace '[^\w\-\.]', '_')
    $name = $safe + '.jpg'
    if (-not $used[$slug].Add($name)) {
      $n = 2
      while (-not $used[$slug].Add("$safe-$n.jpg")) { $n++ }
      $name = "$safe-$n.jpg"; $collisions++
      Write-Output ("collision " + $f.Name + " -> " + $name)
    }
    $wPath = Join-Path $wd $name
    $tPath = Join-Path $td $name
    $manifest += [pscustomobject]@{ folder = $d.Name; slug = $slug; src = $f.FullName; out = $name }

    if ((-not $Force) -and (Test-Path $wPath) -and (Test-Path $tPath)) { $skip++; continue }
    try {
      $img = [System.Drawing.Image]::FromFile($f.FullName)
      $wb = Resize-To $img $WebLong
      if ($wb) { Save-Jpeg $wb $wPath $WebQ; $wb.Dispose() }
      else {
        $wb2 = New-Object System.Drawing.Bitmap $img.Width, $img.Height
        $g2 = [System.Drawing.Graphics]::FromImage($wb2); $g2.DrawImage($img, 0, 0); $g2.Dispose()
        Save-Jpeg $wb2 $wPath $WebQ; $wb2.Dispose()
      }
      $tb = Resize-To $img $ThumbLong
      if ($tb) { Save-Jpeg $tb $tPath $ThumbQ; $tb.Dispose() } else { Copy-Item $wPath $tPath -Force }
      $img.Dispose(); $done++
    } catch { $fail++; Write-Output ("FAIL " + $f.Name + " : " + $_.Exception.Message) }
    if (($done + $skip + $fail) % 50 -eq 0) { Write-Output ("progress " + ($done + $skip + $fail) + "/" + $total + " done=$done skip=$skip fail=$fail") }
  }
}

$manifestPath = Join-Path $OutDir 'manifest.json'
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("FINISHED done=$done skip=$skip fail=$fail collisions=$collisions")
Write-Output ("manifest: " + $manifestPath + " entries=" + $manifest.Count)
