# PowerShell start script for FlourishVNE
# Tries Node (npx http-server) first, then Python's http.server.
param(
  [int]$Port = 8080
)

function Start-WithNode {
  Write-Host "Checking for Node.js..."
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    Write-Host "Node.js detected. Starting npx http-server on port $Port (serving ./dist)..."
    Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "npx http-server dist -p $Port --silent"
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:$Port"
    return $true
  }
  return $false
}

function Start-WithPython {
  Write-Host "Checking for Python..."
  $py = Get-Command python -ErrorAction SilentlyContinue
  if ($py) {
    Write-Host "Python detected. Starting http.server on port $Port (serving ./dist)..."
    Start-Process -NoNewWindow -FilePath "cmd.exe" -ArgumentList "/c", "pushd dist && python -m http.server $Port"
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:$Port"
    return $true
  }
  return $false
}

if (-not (Start-WithNode)) {
  if (-not (Start-WithPython)) {
    Write-Host "Could not find Node.js or Python on this machine.`n"
    Write-Host "Options:`n 1) Install Node.js (https://nodejs.org/)`n 2) Install Python (https://www.python.org/)`n 3) Upload 'dist' to a static host (GitHub Pages, Netlify, etc.)"
    pause
    exit 1
  }
}
