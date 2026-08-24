$ErrorActionPreference = "Stop"
$root = "H:\hitham\new project\grocery"
$src = "$root\backups\snapshot-taxfix\reports-service-FIXED.ts"
$dst = "$root\src\features\reports\service.ts"
$s = [IO.File]::ReadAllText($src)

# Fix 1: replace broken truncated SQL lines with correct tax subselect
$broken = "        COALESCE((SELECT SUM(s.\" + [char]10
$badBlock = "        COALESCE((SELECT SUM(s.\`n        COALESCE((SELECT SUM(s.\`n"
if ($s.Contains($badBlock)) {
  $good = "        COALESCE((SELECT SUM(s.`"taxTotal`") FROM sales s`n          WHERE date_trunc('month', s.`"saleDate`") = m.bucket AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')), 0)::text AS tax,"
  $s = $s.Replace($badBlock, $good)
  Write-Output "OK sql-tax-subselect"
} elseif ($s.Contains("AS tax,")) { Write-Output "SKIP sql-tax-subselect" }
else { Write-Output "MISS sql-tax-subselect" }

# Fix 2: add CSV tax case before expenses case
if (-not $s.Contains('case "tax": {')) {
  $anchor = '    case "expenses": {'
  $csvCase = @'
    case "tax": {
      const t = await taxReport(range);
      return [
        toCsv(["metric", "value"], [["outputTax", t.outputTax], ["inputTax", t.inputTax], ["netPayable", t.netPayable]]),
        "",
        toCsv(["month", "output", "input", "net"], t.monthly.map((m) => [m.month, m.output, m.input, m.net])),
      ].join("\n");
    }
'@
  if ($s.Contains($anchor)) {
    # normalize here-string LF already; ensure anchor match by trying both EOL styles
    $s = $s.Replace($anchor, ($csvCase.TrimEnd() + "`n" + $anchor))
    Write-Output "OK csv-tax-case"
  } else { Write-Output "MISS csv anchor" }
} else { Write-Output "SKIP csv-tax-case" }

[IO.File]::WriteAllText($dst, $s, (New-Object System.Text.UTF8Encoding($false)))
Copy-Item -LiteralPath $dst -Destination "$root\backups\snapshot-taxfix\reports-service-FINAL.ts" -Force
# protect from accidental source-control discards / stale editor saves
attrib +R $dst
Write-Output "WROTE + READ-ONLY: $dst"
