$ErrorActionPreference = 'Stop'
$base   = 'D:\AAA dsh\portfolio-vicoall'
$srcTpl = 'D:\AAA dsh\portfolio\index.html'   # 上游框架页（含照片墙 CSS + 框架脚本）
$dst    = Join-Path $base 'index.html'

Copy-Item $srcTpl $dst -Force
$t    = [System.IO.File]::ReadAllText($dst, [System.Text.Encoding]::UTF8)
$body = [System.IO.File]::ReadAllText((Join-Path $base 'build\_body.html'), [System.Text.Encoding]::UTF8)
$css  = [System.IO.File]::ReadAllText((Join-Path $base 'build\_extra.css'), [System.Text.Encoding]::UTF8)

function Replace-Text([string]$old, [string]$new, [string]$tag) {
  if ($script:t.Contains($old)) { $script:t = $script:t.Replace($old, $new); Write-Output ("OK   " + $tag) }
  else { Write-Output ("MISS " + $tag) }
}

# 1) swap body, keep every script tag
$s = $t.IndexOf('<div class="page-bg"')
$e = $t.IndexOf('<script', $s)
if ($s -lt 0 -or $e -lt 0) { throw 'body anchors not found' }
$t = $t.Substring(0, $s) + $body + "`n" + $t.Substring($e)
Write-Output 'OK   body'

# 2) extra css
$styleEnd = $t.IndexOf('</style>')
$t = $t.Insert($styleEnd, $css)
Write-Output 'OK   css'

# 3) title
$ts = $t.IndexOf('<title>'); $te = $t.IndexOf('</title>')
if ($ts -ge 0 -and $te -gt $ts) { $t = $t.Substring(0, $ts + 7) + 'VicoalL &mdash; Photographs' + $t.Substring($te); Write-Output 'OK   title' }

# 4) graph labels
Replace-Text 'const NAMES = ["Summer", "Spring", "Winter", "Autumn", "Contact"];' 'const NAMES = ["Fieldwork", "Campus", "University", "Landscape", "Sport"];' 'names'
Replace-Text 'const NAMES = ["Fieldwork", "Campus", "Landscape", "Sport", "Contact"];' 'const NAMES = ["Fieldwork", "Campus", "University", "Landscape", "Sport"];' 'names2'
Replace-Text '|| "summer";' '|| "field";' 'fallback'

[System.IO.File]::WriteAllText($dst, $t, (New-Object System.Text.UTF8Encoding($false)))
Write-Output ("bytes=" + (Get-Item $dst).Length)
