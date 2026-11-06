# Checks every PowerShell script without running it:
#  1. it parses (no syntax errors)
#  2. PSScriptAnalyzer reports no Error-level problems (warnings are shown in the log only)
$ErrorActionPreference = 'Stop'

$scripts = Get-ChildItem -Path . -Recurse -Filter *.ps1
$failed = 0

foreach ($s in $scripts) {
  $errs = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($s.FullName, [ref]$null, [ref]$errs)
  foreach ($e in $errs) {
    Write-Host "::error file=$($s.FullName),line=$($e.Extent.StartLineNumber)::$($e.Message)"
    $failed++
  }
}

$findings = Invoke-ScriptAnalyzer -Path . -Recurse -Severity Error, Warning
foreach ($f in $findings) {
  if ($f.Severity -eq 'Error') {
    Write-Host "::error file=$($f.ScriptPath),line=$($f.Line)::$($f.RuleName): $($f.Message)"
    $failed++
  } else {
    Write-Host "warning: $($f.ScriptPath):$($f.Line) $($f.RuleName)"
  }
}

Write-Host "Checked $($scripts.Count) scripts: $failed error(s), $(@($findings | Where-Object Severity -eq 'Warning').Count) warning(s)."
if ($failed -gt 0) { exit 1 }
