<#
.SYNOPSIS
    Copies an RFP's agency source documents into its Google Drive folder under
    Sales > Favorable RFP's.

.DESCRIPTION
    Mirrors RFPs/<stage>/<slug>/resources/ to the matching Drive subfolder, so
    Peter and Marianne can read a solicitation from one link instead of
    navigating HigherGov. Local disk stays the source of truth; Drive is the
    copy leadership reads.

    SAFETY - this script only ever runs 'rclone copy', which is purely additive.
    It never runs sync, move, delete, or purge. 'rclone sync' makes a destination
    match its source BY DELETING everything else there; pointed at the wrong path
    it would empty a teammate's folder on a shared drive. Do not add it.

    Only the agency's own documents are copied. _document-manifest.md is
    Seamgen's tracking file and is excluded.

.PARAMETER Slug
    One or more RFP slugs, e.g. yonkers-connect-seniors-app. The local folder is
    found automatically across all four RFPs/ lifecycle tiers, so this keeps
    working as an RFP is promoted. A leading "(NN) " score prefix on the local
    folder is stripped for the Drive folder name.

.PARAMETER WhatIf
    Preview only. Runs rclone with --dry-run; transfers nothing.

.EXAMPLE
    .\tools\Sync-RfpToDrive.ps1 -Slug yonkers-connect-seniors-app -WhatIf

.EXAMPLE
    .\tools\Sync-RfpToDrive.ps1 -Slug ladbs-ai-pre-plan-check, south-dakota-doe-website-cms

.NOTES
    Requires rclone with a remote named 'seamgen-sales' pointing at the Sales
    shared drive. Setup is in tools/README.md. The rclone config holds an OAuth
    refresh token and lives in %APPDATA%\rclone\rclone.conf - never inside this
    folder, same rule as SLACK_BOT_TOKEN and HIGHERGOV_API_KEY.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string[]] $Slug,

    [string] $Remote = 'seamgen-sales',

    [string] $DriveParent = "Favorable RFP's"
)

$ErrorActionPreference = 'Stop'

# The manifest is ours, not the agency's - it never goes to Drive.
$ExcludeFile = '_document-manifest.md'

function Resolve-Rclone {
    # winget's portable install adds a shim to PATH, but a shell opened before
    # the install won't see it. Fall back to the known install locations.
    $cmd = Get-Command rclone -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $link = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\rclone.exe'
    if (Test-Path $link) { return $link }

    $pkgRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $pkgRoot) {
        $found = Get-ChildItem $pkgRoot -Filter 'rclone.exe' -Recurse -ErrorAction SilentlyContinue |
                 Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

function Find-RfpFolder {
    param([string] $Name)

    $root = Join-Path $PSScriptRoot '..\RFPs'
    if (-not (Test-Path $root)) { return $null }

    # Match the slug with or without a leading "(NN) " score prefix.
    $matches = Get-ChildItem $root -Directory -Recurse -Depth 1 -ErrorAction SilentlyContinue |
               Where-Object { ($_.Name -replace '^\(\d+\)\s*', '') -eq $Name }

    if ($matches.Count -gt 1) {
        Write-Warning "Slug '$Name' matches $($matches.Count) folders; using the first: $($matches[0].FullName)"
    }
    return $matches | Select-Object -First 1
}

# ---------------------------------------------------------------- pre-flight

$rclone = Resolve-Rclone
if (-not $rclone) {
    Write-Error "rclone not found. Install it with: winget install Rclone.Rclone (no admin needed). See tools/README.md."
    exit 1
}

$remotes = & $rclone listremotes
if ($remotes -notcontains "${Remote}:") {
    Write-Error "rclone remote '$Remote' is not configured. Run 'rclone config' and create it against the Sales shared drive. See tools/README.md."
    exit 1
}

# ---------------------------------------------------------------- per-RFP

$results = @()

foreach ($name in $Slug) {

    $folder = Find-RfpFolder -Name $name
    if (-not $folder) {
        Write-Warning "[$name] no folder found under RFPs/ in any tier - skipped."
        $results += [PSCustomObject]@{ RFP = $name; Local = 0; Drive = 0; Status = 'no local folder' }
        continue
    }

    $resources = Join-Path $folder.FullName 'resources'
    if (-not (Test-Path $resources)) {
        Write-Warning "[$name] has no resources/ subfolder - nothing to copy. (Agency documents may still be sitting at the RFP folder root.)"
        $results += [PSCustomObject]@{ RFP = $name; Local = 0; Drive = 0; Status = 'no resources/' }
        continue
    }

    $localFiles = @(Get-ChildItem $resources -File | Where-Object { $_.Name -ne $ExcludeFile })
    if ($localFiles.Count -eq 0) {
        Write-Warning "[$name] resources/ holds no agency documents - skipped."
        $results += [PSCustomObject]@{ RFP = $name; Local = 0; Drive = 0; Status = 'empty' }
        continue
    }

    # Drive folder name drops the internal score prefix: leadership shouldn't
    # read "(79)" off a folder name.
    $driveName = $folder.Name -replace '^\(\d+\)\s*', ''
    $dest = "${Remote}:$DriveParent/$driveName"

    $sizeMB = [math]::Round((($localFiles | Measure-Object Length -Sum).Sum) / 1MB, 1)
    Write-Host ""
    Write-Host "[$name] $($localFiles.Count) file(s), $sizeMB MB" -ForegroundColor Cyan
    Write-Host "  from $resources"
    Write-Host "  to   $dest"

    # Destination must already exist. Creating it here would silently spawn a
    # duplicate if the slug were mistyped, and the folder IDs are recorded in
    # each RFP's manifest.
    # Note: never redirect a native command's stderr with 2>&1 here. Windows
    # PowerShell 5.1 wraps each stderr line in an ErrorRecord and trips
    # $ErrorActionPreference='Stop' - and rclone writes an unrelated
    # deprecation NOTICE to stderr on every call. Check the exit code instead.
    $null = & $rclone lsjson $dest --stat --log-level ERROR
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "[$name] Drive folder '$driveName' does not exist under $DriveParent. Create it first, then record its URL on the manifest's 'Drive folder:' line."
        $results += [PSCustomObject]@{ RFP = $name; Local = $localFiles.Count; Drive = 0; Status = 'no Drive folder' }
        continue
    }

    # --stats 0 suppresses rclone's repeating progress block; this script prints
    # its own file count up front and verifies the destination afterwards.
    $args = @('copy', $resources, $dest, '--exclude', $ExcludeFile, '--stats', '0', '--log-level', 'NOTICE')
    if ($WhatIfPreference) {
        $args += '--dry-run'
        Write-Host "  (WhatIf - dry run, nothing will transfer)" -ForegroundColor Yellow
    }

    & $rclone @args
    $copyExit = $LASTEXITCODE

    if ($WhatIfPreference) {
        $results += [PSCustomObject]@{ RFP = $name; Local = $localFiles.Count; Drive = '-'; Status = 'dry run' }
        continue
    }

    if ($copyExit -ne 0) {
        Write-Warning "[$name] rclone exited $copyExit - copy failed or was incomplete."
    }

    # Verify against the destination rather than trusting the exit code.
    $remoteFiles = @(& $rclone lsf $dest --files-only --log-level ERROR)
    $status = 'ok'
    if ($remoteFiles.Count -ne $localFiles.Count) {
        $status = "MISMATCH"
        Write-Warning "[$name] expected $($localFiles.Count) file(s) in Drive, found $($remoteFiles.Count)."
    }
    if ($remoteFiles -contains $ExcludeFile) {
        $status = "MANIFEST LEAKED"
        Write-Warning "[$name] $ExcludeFile reached Drive - it should never be copied."
    }

    $results += [PSCustomObject]@{
        RFP    = $name
        Local  = $localFiles.Count
        Drive  = $remoteFiles.Count
        Status = $status
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$bad = @($results | Where-Object { $_.Status -notin @('ok', 'dry run') })
if ($bad.Count -gt 0) {
    Write-Host "$($bad.Count) RFP(s) need attention." -ForegroundColor Yellow
    exit 1
}
