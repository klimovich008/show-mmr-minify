# Inspect the cleanup predicate without executing the destructive cleanup script.
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PSScriptRoot '../scripts/clear_show_mmr_data.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw $errors[0] }
$assignment = $ast.Find({ param($node)
    $node -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $node.Left.VariablePath.UserPath -eq 'showMmrValue'
}, $true)
$literal = $assignment.Right.Find({ param($node)
    $node -is [System.Management.Automation.Language.StringConstantExpressionAst]
}, $true)
if (-not $literal) { throw 'Cleanup predicate must remain a string literal' }
$pattern = $literal.Value
foreach ($value in @('showmmr_user:123', '1783404000:[6000,-25]',
    'showmmr_user:123:p1:2:7000:1783500000:1783404000:8883733433:1783500100:0')) {
    if ($value -notmatch $pattern) { throw "Missed ShowMMR value: $value" }
}
foreach ($value in @('+attack', 'showmmr_user:123:p2:1',
    'showmmr_user:123:p1:2:7000:1783500000:1783404000:8883733433:1783500100:0;echo test')) {
    if ($value -match $pattern) { throw "Would remove unrelated or unsupported value: $value" }
}
Write-Output 'Cleanup recognition checks passed; no files changed'
