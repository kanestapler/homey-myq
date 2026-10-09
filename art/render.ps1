# Renders art/*.svg to the PNG sizes the Homey App Store requires.
# Uses headless Chrome for the largest size and downscales the rest.
param(
  [string]$Chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$root = Split-Path $PSScriptRoot
Add-Type -AssemblyName System.Drawing

function Render([string]$svg, [int]$w, [int]$h, [string]$outDir, [object[]]$sizes) {
  $html = Join-Path $env:TEMP "homey-myq-render.html"
  $uri = ([Uri](Join-Path $PSScriptRoot $svg)).AbsoluteUri
  Set-Content -Path $html -Encoding utf8 -Value "<html><body style='margin:0;overflow:hidden'><img src='$uri' style='display:block;width:${w}px;height:${h}px'></body></html>"
  $xlarge = Join-Path $outDir "xlarge.png"
  & $Chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 "--window-size=$w,$h" "--screenshot=$xlarge" ([Uri]$html).AbsoluteUri 2>$null | Out-Null
  Start-Sleep -Milliseconds 500

  $src = [System.Drawing.Image]::FromFile($xlarge)
  foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size.w, $size.h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($src, 0, 0, $size.w, $size.h)
    $g.Dispose()
    $bmp.Save((Join-Path $outDir "$($size.name).png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  }
  $src.Dispose()
}

Render "app.svg" 1000 700 (Join-Path $root "assets\images") @(@{ name = 'large'; w = 500; h = 350 }, @{ name = 'small'; w = 250; h = 175 })
Render "driver.svg" 1000 1000 (Join-Path $root "drivers\garage-door\assets\images") @(@{ name = 'large'; w = 500; h = 500 }, @{ name = 'small'; w = 75; h = 75 })
Render "camera.svg" 1000 1000 (Join-Path $root "drivers\camera\assets\images") @(@{ name = 'large'; w = 500; h = 500 }, @{ name = 'small'; w = 75; h = 75 })
