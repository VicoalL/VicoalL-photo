param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string[]]$Folders,
  [int]$PerFolder = 24,
  [int]$Cols = 6,
  [int]$Cell = 250,
  [string]$Out = "",
  [string]$MapOut = ""
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not $Out) { $Out = Join-Path $env:TEMP 'sheet.png' }
if (-not $MapOut) { $MapOut = [System.IO.Path]::ChangeExtension($Out, '.json') }

$ex = '^\.(jpg|jpeg|png)$'
$items = @()
foreach ($name in $Folders) {
  $dir = Join-Path $Root $name
  if (-not (Test-Path -LiteralPath $dir)) { Write-Output ("missing: " + $name); continue }
  $all = @(Get-ChildItem -LiteralPath $dir -Recurse -File | Where-Object { $_.Extension -match $ex } | Sort-Object Name)
  if ($all.Count -eq 0) { continue }
  $step = [Math]::Max(1, [Math]::Floor($all.Count / $PerFolder))
  $taken = @()
  for ($i = 0; $i -lt $all.Count -and $taken.Count -lt $PerFolder; $i += $step) { $taken += $all[$i] }
  foreach ($t in $taken) { $items += [pscustomobject]@{ Folder = $name; File = $t.FullName; Name = $t.Name } }
}

$rows = [math]::Ceiling($items.Count / $Cols)
$ch = [int]($Cell * 0.75)
$bmp = New-Object System.Drawing.Bitmap ($Cell * $Cols), ($rows * ($ch + 20))
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(12,12,16))
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font('Consolas', 9)

$map = @()
for ($k = 0; $k -lt $items.Count; $k++) {
  $it = $items[$k]
  $x = ($k % $Cols) * $Cell
  $y = [math]::Floor($k / $Cols) * ($ch + 20)
  try {
    $img = [System.Drawing.Image]::FromFile($it.File)
    $w0 = $img.Width; $h0 = $img.Height
    $scale = [Math]::Min(($Cell - 6) / $w0, ($ch - 6) / $h0)
    $w = [int]($w0 * $scale); $h = [int]($h0 * $scale)
    $g.DrawImage($img, $x + [int](($Cell - $w) / 2), $y + [int](($ch - $h) / 2), $w, $h)
    $img.Dispose()
  } catch { $w0 = 0; $h0 = 0 }
  $g.DrawString(("#{0}" -f $k), $font, [System.Drawing.Brushes]::Yellow, $x + 5, $y + 3)
  $g.DrawString($it.Name.Substring(0, [Math]::Min(22, $it.Name.Length)), $font, [System.Drawing.Brushes]::White, $x + 5, $y + $ch + 2)
  $map += [pscustomobject]@{ cell = $k; folder = $it.Folder; file = $it.File; w = $w0; h = $h0 }
}
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
[System.IO.File]::WriteAllText($MapOut, ($map | ConvertTo-Json -Depth 4), (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("cells=" + $items.Count + " out=" + $Out)
