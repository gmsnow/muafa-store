# Auto-commit & push on any working-tree change (triggers a Vercel deploy).
# Usage:  npm run autopush    (stop with Ctrl+C)
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$branch = git rev-parse --abbrev-ref HEAD
Write-Host "Auto-push watching '$branch' - saving every change as 'auto: ...' commits (Ctrl+C to stop)"

while ($true) {
    Start-Sleep -Seconds 5
    if (-not (Test-Path ".git")) { continue }

    # Never touch a conflicted / mid-operation repo
    $busy = (Test-Path ".git\MERGE_HEAD") -or (Test-Path ".git\rebase-merge") -or (Test-Path ".git\rebase-apply")
    if ($busy) { continue }

    $dirty = @(git status --porcelain 2>$null | Where-Object { $_ })
    if ($dirty.Count -eq 0) { continue }

    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    git add -A
    git commit -m "auto: sync $stamp" --no-verify 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { continue }

    git push 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[$stamp] pushed $($dirty.Count) path(s)" -ForegroundColor Green
    }
    else {
        Write-Host "[$stamp] commit created but push failed - will retry" -ForegroundColor Yellow
    }
}
