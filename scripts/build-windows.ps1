$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$sourceExe = Join-Path $repo "target\release\remotehand-editor.exe"
$stageDir = Join-Path $repo "bin\windows-x86_64"
$stageExe = Join-Path $stageDir "remotehand-editor.exe"
$packageDir = Join-Path $repo "dist\remotehand-editor-windows-x86_64"
$packageBinDir = Join-Path $packageDir "bin\windows-x86_64"
$packageUiDir = Join-Path $packageDir "ui"
$packageAssetsDir = Join-Path $packageDir "assets"
$pluginVersion = (Get-Content (Join-Path $repo "plugin.json") -Raw | ConvertFrom-Json).version

Write-Host "Building RemoteHand Editor UI..."
Push-Location $repo
try {
    if (-not (Test-Path (Join-Path $repo "node_modules\codemirror")) -or
        -not (Test-Path (Join-Path $repo "node_modules\esbuild"))) {
        npm.cmd install --no-package-lock
        if ($LASTEXITCODE -ne 0) {
            throw "npm install failed with exit code $LASTEXITCODE"
        }
    }

    npm.cmd run build:ui
    if ($LASTEXITCODE -ne 0) {
        throw "UI build failed with exit code $LASTEXITCODE"
    }

    Write-Host "Building RemoteHand Editor backend (release)..."
    cargo build --release
    if ($LASTEXITCODE -ne 0) {
        throw "Cargo build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $sourceExe)) {
    throw "Build completed but executable was not found: $sourceExe"
}

New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
Copy-Item -Force $sourceExe $stageExe

if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
New-Item -ItemType Directory -Force -Path $packageBinDir | Out-Null
New-Item -ItemType Directory -Force -Path $packageUiDir | Out-Null
New-Item -ItemType Directory -Force -Path $packageAssetsDir | Out-Null

Copy-Item -Force (Join-Path $repo "plugin.json") (Join-Path $packageDir "plugin.json")
Copy-Item -Force (Join-Path $repo "README.md") (Join-Path $packageDir "README.md")
Copy-Item -Force (Join-Path $repo "CHANGELOG.md") (Join-Path $packageDir "CHANGELOG.md")
Copy-Item -Force (Join-Path $repo "LICENSE") (Join-Path $packageDir "LICENSE")

# RemoteHand plugin panels load their entry document from a virtual source where
# sibling relative assets are not guaranteed to resolve. Keep the development
# sources split cleanly, but package one self-contained HTML document.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$indexTemplate = [System.IO.File]::ReadAllText((Join-Path $repo "ui\index.html"), [System.Text.Encoding]::UTF8)
$editorCss = [System.IO.File]::ReadAllText((Join-Path $repo "ui\editor.css"), [System.Text.Encoding]::UTF8)
$editorJs = [System.IO.File]::ReadAllText((Join-Path $repo "ui\editor.js"), [System.Text.Encoding]::UTF8)

# Keep inline assets safe for the HTML parser. Bundled dependencies may contain
# literal closing-tag text even though it is only JavaScript/CSS data.
$editorCss = $editorCss.Replace("</style", "<\/style")
$editorJs = $editorJs.Replace("</script", "<\/script")

$packagedIndex = $indexTemplate.Replace(
    '<link rel="stylesheet" href="./editor.css">',
    "<style>`r`n$editorCss`r`n</style>"
).Replace(
    '<script src="./editor.js"></script>',
    "<script>`r`n$editorJs`r`n</script>"
)

[System.IO.File]::WriteAllText((Join-Path $packageUiDir "index.html"), $packagedIndex, $utf8NoBom)

Copy-Item -Force (Join-Path $repo "assets\*") $packageAssetsDir
Copy-Item -Force $sourceExe (Join-Path $packageBinDir "remotehand-editor.exe")

$zipPath = Join-Path $repo ("dist\remotehand-editor-v{0}-windows-x86_64.zip" -f $pluginVersion)
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$zipHash = (Get-FileHash -Algorithm SHA256 $zipPath).Hash
$checksumPath = Join-Path $repo "dist\SHA256SUMS.txt"
"$zipHash  $(Split-Path -Leaf $zipPath)" | Set-Content -Encoding ascii $checksumPath

Write-Host ""
Write-Host "Installable package:"
Write-Host "  $packageDir"
Write-Host ""
Write-Host "Validation ZIP:"
Write-Host "  $zipPath"
Write-Host "  SHA256: $zipHash"
