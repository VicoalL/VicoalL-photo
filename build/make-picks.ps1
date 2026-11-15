# 生成精选清单 build\picks.json
param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Out
)
$ErrorActionPreference = 'Stop'
$ex = '^\.(jpg|jpeg|png)$'

function Even($dir, [int]$n) {
  $files = @(Get-ChildItem -LiteralPath $dir -Recurse -File -ErrorAction SilentlyContinue |
             Where-Object { $_.Extension -match $ex } | Sort-Object Name)
  if ($files.Count -eq 0) { return @() }
  if ($files.Count -le $n) { return $files.Name }
  $out = @()
  for ($i = 0; $i -lt $n; $i++) {
    $idx = [int][Math]::Floor($files.Count * ($i + 0.5) / $n)
    if ($idx -ge $files.Count) { $idx = $files.Count - 1 }
    $out += $files[$idx].Name
  }
  return $out
}

$picks = [ordered]@{}

$picks['field'] = @(
  '_DSC0083-73.jpg','_DSC0947-88.jpg','_DSC3876-108.jpg','_DSC4051-118.jpg',
  '_DSC4757-123.jpg','_DSC7754-7.jpg','_DSC8435-26.jpg','_DSC8641-38.jpg',
  '_DSC9803-6.jpg','_DSC1761-93.jpg','_DSC0717-83.jpg','_DSC8691-41.jpg'
)

$campus = @()
$campus += Even (Join-Path $Root '高中时期乱七八糟的照片') 12
$campus += Even (Join-Path $Root '高二高三') 2
$campus += Even (Join-Path $Root '国旗队') 2
$picks['campus'] = $campus

$u = Join-Path $Root '大学picture'
$uni = @()
$uni += Even (Join-Path $u '11.20开幕式') 2
$uni += Even (Join-Path $u '11.20运动会') 3
$uni += Even (Join-Path $u '11.21 运动会') 3
$uni += Even (Join-Path $u '11.22运动会') 3
$uni += Even (Join-Path $u '音乐节视频照片') 3
$uni += Even (Join-Path $u '4.11 主持人风采大赛 粟泽宇') 2
$uni += Even (Join-Path $u '25.12.31 元旦游园 粟泽宇') 2
$uni += Even (Join-Path $u '26.5.31 宿舍文化节粟泽宇') 1
$uni += Even (Join-Path $u '12.15升旗lr') 2
$uni += Even (Join-Path $u '6.9  气象馆宣传 粟泽宇') 1
$uni += Even (Join-Path $u '2026.6.16 消防演习 粟泽宇') 1
$uni += Even (Join-Path $u '2026.3.14 宣讲队') 1
$uni += Even (Join-Path $u '5.28 考研动员大会') 2
$uni += Even (Join-Path $u '26.6.29 国旗下讲话 粟泽宇') 1
$uni += Even (Join-Path $u '黄武') 1
$picks['uni'] = $uni

$picks['scene'] = @(
  '微信图片_20261115152232.jpg','微信图片_20261115152230.jpg',
  '微信图片_20261115152231.jpg','微信图片_20261115152233.jpg',
  '微信图片_20261115152234.jpg',
  'DSC_0383.jpg','DSC_0503.jpg','DSC_0668.jpg',
  '5794edcf-7f31-4545-8aa1-56d4700d3a1f.png','DSC_3391.jpg',
  '_DSC6481-HDR-2-1.jpg','_DSC6506-已增强-降噪-1-2.jpg','_DSC6511-HDR-1.jpg',
  '_DSC6517-HDR-1.jpg','_DSC6434-1.jpg'
)

$picks['sport'] = @(
  '_DSC1196.jpg','_DSC2971.jpg','_DSC3188.jpg','_DSC3189-2.jpg',
  '_DSC3733-已增强-降噪.jpg','_DSC3282-Pano.jpg','_DSC1487-Pano-3.jpg',
  '_DSC3007-Pano-4.jpg','_DSC1184.jpg','_DSC3189.jpg'
)

$picks['cos'] = @(
  '_DSC0581.jpg','_DSC0626.jpg','_DSC0640.jpg','_DSC0656.jpg',
  '_DSC0682.jpg','_DSC0690(1).jpg','_DSC0697(1).jpg','_DSC0704(1).jpg',
  '_DSC0706(1).jpg','_DSC0709(1).jpg','_DSC0761-已增强-降噪.jpg','_DSC0805(1).jpg',
  '_DSC0873(1).jpg','_DSC0892(1).jpg','_DSC0903(1).jpg','_DSC0931.jpg',
  '_DSC0946(1).jpg','_DSC0954.jpg','_DSC1045.jpg','_DSC0884(1).jpg'
)

$json = $picks | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
foreach ($k in $picks.Keys) { "{0,-7} {1,3} 张" -f $k, $picks[$k].Count }
Write-Output ("-> " + $Out)
