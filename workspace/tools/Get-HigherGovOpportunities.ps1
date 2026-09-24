<#
.SYNOPSIS
    Pulls new HigherGov opportunities, prefilters them, and writes candidate files
    for Claude to score. Send-only on your quota: reads, never writes to HigherGov.

.DESCRIPTION
    Offline modes need no API key and spend no quota - use them to test everything:
      -Status              Show config + state. No network.
      -FromFile <path>     Run the full prefilter + candidate-write pipeline against a
                           JSON fixture file, or a folder of them. No network. Output
                           goes to RFP-pipeline/_test-output/ so real data stays clean.

    Live modes (need HIGHERGOV_API_KEY and spend quota):
      -DryRun              Count probe only (~1 record), print the plan, write nothing.
      (default run)        Fetch new records since the last high-water mark, prefilter,
                           fetch documents for survivors, write candidates.
      -Backfill -Since <yyyy-MM-dd> -Confirm    First-time / catch-up fetch.
      -MaxRecords <n>      Hard cap for this run (default from config).

.EXAMPLE
    .\Get-HigherGovOpportunities.ps1 -FromFile ..\pipeline\fixtures
    Runs all six test fixtures offline. Nothing hits the network.
#>
[CmdletBinding()]
param(
    [switch]$Status,
    [string]$FromFile,
    [switch]$DryRun,
    [switch]$Backfill,
    [string]$Since,
    [switch]$AcceptQuotaCost,
    [int]$MaxRecords
)

. (Join-Path $PSScriptRoot 'HigherGov.Common.ps1')

$config = Get-HGConfig

function Ensure-Dir { param([string]$Path) if (-not (Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null } }

# ============================================================================
#  -Status : no network, no quota
# ============================================================================
if ($Status) {
    Write-Host ""
    Write-Host "HigherGov intake - status" -ForegroundColor Cyan
    Write-Host "  search_id:        $($config.searchId)"
    Write-Host "  search verified:  $($config.lastVerifiedByHuman)"
    Write-Host "  monthly budget:   $($config.quota.monthlyBudget) records"
    Write-Host "  min days to due:  $($config.seamgenProfile.minDaysToDue)"
    $statePath = Get-HGPipelinePath 'state.json'
    if (Test-Path $statePath) {
        $state = Get-Content $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Host "  last run:         $($state.lastRunUtc)"
        Write-Host "  high-water mark:  $($state.highWaterCapturedDate)"
        Write-Host "  records this month: $($state.quota.recordsFetched) / $($config.quota.monthlyBudget)"
    } else {
        Write-Host "  state.json:       none yet (first live run must use -Backfill)"
    }
    $key = $env:HIGHERGOV_API_KEY
    Write-Host ("  API key set:      " + ($(if ([string]::IsNullOrWhiteSpace($key)) { 'NO - set HIGHERGOV_API_KEY' } else { 'yes' }))) -ForegroundColor $(if ([string]::IsNullOrWhiteSpace($key)) { 'Yellow' } else { 'Green' })
    Write-Host ""
    return
}

# ============================================================================
#  -FromFile : full pipeline against fixtures. No network, no quota.
# ============================================================================
if ($FromFile) {
    if (-not (Test-Path $FromFile)) { Write-Host "Not found: $FromFile" -ForegroundColor Red; exit 1 }

    $files = if ((Get-Item $FromFile).PSIsContainer) {
        Get-ChildItem $FromFile -Filter *.json | Sort-Object Name
    } else {
        @(Get-Item $FromFile)
    }

    $outDir       = Get-HGPipelinePath '_test-output'
    $outCand      = Join-Path $outDir 'candidates'
    $outKilled    = Join-Path $outDir 'killed.csv'
    Ensure-Dir $outDir
    Ensure-Dir $outCand
    if (Test-Path $outKilled) { Remove-Item $outKilled -Force }
    Get-ChildItem $outCand -Filter *.md -ErrorAction SilentlyContinue | Remove-Item -Force

    Write-Host ""
    Write-Host "OFFLINE fixture run - $($files.Count) record(s). No network, no quota." -ForegroundColor Cyan
    Write-Host ""

    $pass = 0; $killed = 0
    $usedSlugs = @{}

    foreach ($f in $files) {
        $rec = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $pf = Test-HGPrefilter -Record $rec -Config $config
        $title = Get-Prop $rec 'title'

        if ($pf.pass) {
            $slug = ConvertTo-Slug $title
            while ($usedSlugs.ContainsKey($slug)) { $slug = "$slug-2" }
            $usedSlugs[$slug] = $true

            $content = New-CandidateContent -Record $rec -Prefilter $pf -Slug $slug -Attachments @()
            $candPath = Join-Path $outCand ("candidate_FIXTURE_" + $slug + '.md')
            Write-Utf8NoBom -Path $candPath -Text $content

            $flagNote = if ($pf.flags.Count -gt 0) { " [flags: $($pf.flags -join ', ')]" } else { "" }
            Write-Host ("  PASS   {0}" -f $f.Name) -ForegroundColor Green
            Write-Host ("         -> {0}{1}" -f (Split-Path $candPath -Leaf), $flagNote) -ForegroundColor DarkGray
            $pass++
        } else {
            Add-KilledRow -CsvPath $outKilled -Record $rec -Prefilter $pf
            Write-Host ("  KILL   {0}  ({1})" -f $f.Name, $pf.killReason) -ForegroundColor Yellow
            $killed++
        }
    }

    Write-Host ""
    Write-Host ("Done. $pass candidate(s), $killed killed.") -ForegroundColor Cyan
    Write-Host ("  candidates: {0}" -f $outCand)
    if ($killed -gt 0) { Write-Host ("  killed.csv: {0}" -f $outKilled) }
    Write-Host ""
    return
}

# ============================================================================
#  Live modes - require the API key. Day-ledger fetch.
#  captured_date is EXACT-match, so the watermark is a day-completion ledger,
#  not a cursor: we drain one whole UTC calendar day per iteration and only
#  advance highWaterCapturedDate once a day is confirmed fully drained.
# ============================================================================

# --- live helpers ------------------------------------------------------------
function Get-HGDateList {
    param([datetime]$Start, [datetime]$End)   # inclusive, by UTC date
    $list = New-Object System.Collections.Generic.List[string]
    $d = $Start.Date
    while ($d -le $End.Date) {
        $list.Add($d.ToString('yyyy-MM-dd'))
        $d = $d.AddDays(1)
    }
    return $list
}

function Get-HGDayCount {
    param($Config, [string]$Day)
    $resp = Invoke-HigherGov -Method 'opportunity' -Query @{ search_id=$Config.searchId; source_type=$Config.sourceType; captured_date=$Day; page_size=1 }
    try { return [int]$resp.meta.pagination.count } catch { return $null }
}

function Get-HGDayRecords {
    # Drain a whole day. No 'ordering' (unstable among same-date ties) - we take
    # the UNION of all pages keyed by version_key, so order never matters.
    # NOTE: meta.pagination.count over-reports - it includes phantom matches the
    # endpoint never serves (e.g. 15 counted, 12 served, pages=1). The authoritative
    # "drained" signal is having fetched every reported PAGE, not distinct >= count.
    #
    # *** The pagination parameter is page_number, NOT page. ***
    # This was wrong from the start and cost a day on 2026-07-31. The API silently
    # IGNORES an unrecognised 'page' parameter and serves page 1 every time, so the
    # loop fetched the same records repeatedly, never advanced, and no day with more
    # than page_size records could ever drain. Confirmed by HigherGov support (Justin,
    # 2026-07-31): "There are parameters called page_number and page_size."
    # Verified after the fix: page_number=3 returns meta.pagination.page=3 correctly.
    #
    # page_size comes from config (pageSize), NOT hard-coded - HigherGov returns
    # HTTP 500 for page_size >= 50 (a real server-side fault, still open with them),
    # so 25 is the working maximum. Quota counts RECORDS, not requests, so a smaller
    # page size costs nothing but round trips.
    param($Config, [string]$Day)
    $pageSize = if ($Config.pageSize) { [int]$Config.pageSize } else { 25 }
    $byKey = New-Object System.Collections.Specialized.OrderedDictionary
    $page = 1; $maxPages = 50; $count = $null; $pages = $null; $fetched = 0; $lastPage = 0
    while ($page -le $maxPages) {
        $resp = Invoke-HigherGov -Method 'opportunity' -Query @{
            search_id = $Config.searchId; source_type = $Config.sourceType
            captured_date = $Day; page_size = $pageSize; page_number = $page
        }
        if ($null -eq $count) { try { $count = [int]$resp.meta.pagination.count } catch { $count = $null } }
        try { $pages = [int]$resp.meta.pagination.pages } catch { $pages = $null }
        $results  = @($resp.results)
        $fetched += $results.Count
        $lastPage = $page
        $before   = $byKey.Count
        foreach ($rec in $results) {
            $vk = [string](Get-Prop $rec 'version_key')
            if ($vk -and -not $byKey.Contains($vk)) { $byKey[$vk] = $rec }
        }
        if ($results.Count -eq 0) { break }
        if ($page -gt 1 -and $byKey.Count -eq $before) { break }      # page added nothing new (page param not advancing)
        if ($null -ne $pages -and $page -ge $pages) { break }         # fetched the last reported page
        $page++
    }
    $recs = @(); foreach ($k in $byKey.Keys) { $recs += $byKey[$k] }
    $drained = ($null -ne $pages) -and ($lastPage -ge $pages)
    return [PSCustomObject]@{ records = $recs; count = $count; pages = $pages; served = $byKey.Count; fetched = $fetched; fullyDrained = $drained }
}

function Get-HGUniqueSlug {
    param([string]$Title, $UsedSlugs, [string]$CandRoot)
    $base = ConvertTo-Slug $Title
    $slug = $base; $n = 1
    while ($UsedSlugs.ContainsKey($slug) -or (Test-Path (Join-Path $CandRoot $slug))) {
        $n++; $slug = "$base-v$n"                                     # amended solicitation (new version_key, same title) -> -v2
    }
    $UsedSlugs[$slug] = $true
    return $slug
}

function Invoke-HGDrainDay {
    param($Config, [string]$Day, $Seen, $UsedSlugs, [string]$CandRoot, [string]$KilledCsv)
    $dr  = Get-HGDayRecords -Config $Config -Day $Day
    $res = [PSCustomObject]@{ day=$Day; count=$dr.count; served=$dr.served; fetched=$dr.fetched; fullyDrained=$dr.fullyDrained; pass=0; killed=0; dupes=0 }
    foreach ($rec in $dr.records) {
        $vk = [string](Get-Prop $rec 'version_key')
        if ($vk -and $Seen.Contains($vk)) { $res.dupes++; continue }
        $pf = Test-HGPrefilter -Record $rec -Config $Config
        if ($pf.pass) {
            $slug = Get-HGUniqueSlug -Title (Get-Prop $rec 'title') -UsedSlugs $UsedSlugs -CandRoot $CandRoot
            $dir  = Join-Path $CandRoot $slug
            Ensure-Dir $dir
            $content = New-CandidateContent -Record $rec -Prefilter $pf -Slug $slug -Attachments @()
            Write-Utf8NoBom -Path (Join-Path $dir 'candidate.md') -Text $content
            $res.pass++
        } else {
            Add-KilledRow -CsvPath $KilledCsv -Record $rec -Prefilter $pf
            $res.killed++
        }
        if ($vk) {
            [void]$Seen.Add($vk)
            Add-HGSeenRow -VersionKey $vk -OppKey (Get-Prop $rec 'opp_key') -CapturedDate (Get-Prop $rec 'captured_date')
        }
    }
    return $res
}

# --- setup -------------------------------------------------------------------
$null = Get-HGApiKey                                                  # throws with a clear message if the key is unset

$state      = Get-HGState
$maxRecords = if ($PSBoundParameters.ContainsKey('MaxRecords') -and $MaxRecords -gt 0) { $MaxRecords } else { [int]$config.quota.defaultMaxRecordsPerRun }
$safetyLag  = [int]$config.safetyLagDays
$endDate    = (Get-HGUtcToday).AddDays(-$safetyLag)                   # inclusive last fetchable day = yesterday (UTC)

# --- guard: watermark built against a different search_id --------------------
if ($state -and $state.searchId -ne $config.searchId) {
    if (-not $Backfill) {
        Write-Host ""
        Write-Host "REFUSE: state.json watermark was built against search_id '$($state.searchId)'," -ForegroundColor Red
        Write-Host "        but config now points at '$($config.searchId)'. A watermark is meaningless across filters."
        Write-Host "        Re-seed with:  .\Get-HigherGovOpportunities.ps1 -Backfill -Since <yyyy-MM-dd> -AcceptQuotaCost"
        Write-Host ""
        exit 1
    }
    Write-Host "Search changed - -Backfill will re-seed state against '$($config.searchId)'." -ForegroundColor Yellow
}

# --- guard: monthly hard stop (offline, before any network) ------------------
$recordsSoFar = if ($state) { [int]$state.quota.recordsFetched } else { 0 }
if ($state -and $state.quota.month -ne (Get-HGUtcMonth)) { $recordsSoFar = 0 }   # new month resets the counter
if ($recordsSoFar -ge [int]$config.quota.hardStopAt) {
    Write-Host "REFUSE: monthly hard stop reached ($recordsSoFar >= $($config.quota.hardStopAt)). No network this run." -ForegroundColor Red
    exit 1
}

# --- determine the forward day window ----------------------------------------
if ($Backfill) {
    if ([string]::IsNullOrWhiteSpace($Since)) { Write-Host "REFUSE: -Backfill requires -Since <yyyy-MM-dd>." -ForegroundColor Red; exit 1 }
    if (-not $AcceptQuotaCost)                { Write-Host "REFUSE: -Backfill can burn a lot of quota - pass -AcceptQuotaCost to proceed." -ForegroundColor Red; exit 1 }
    try { $startDate = [datetime]::ParseExact($Since, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) }
    catch { Write-Host "REFUSE: -Since must be formatted yyyy-MM-dd." -ForegroundColor Red; exit 1 }
} else {
    if (-not $state -or [string]::IsNullOrWhiteSpace($state.highWaterCapturedDate)) {
        Write-Host ""
        Write-Host "REFUSE: no watermark yet. The first live run must seed one:" -ForegroundColor Red
        Write-Host "        .\Get-HigherGovOpportunities.ps1 -Backfill -Since <yyyy-MM-dd> -AcceptQuotaCost"
        Write-Host ""
        exit 1
    }
    $wm = [datetime]::ParseExact($state.highWaterCapturedDate, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $startDate = $wm.AddDays(1)
}
$forwardDays = @(Get-HGDateList -Start $startDate -End $endDate)

# --- mandatory pre-flight count probe (1 record) -----------------------------
Write-Host ""
Write-Host "Pre-flight count probe..." -ForegroundColor Cyan
try { $probe = Invoke-HigherGov -Method 'opportunity' -Query @{ search_id=$config.searchId; source_type=$config.sourceType; page_size=1 } }
catch { Write-Host "ABORT: pre-flight probe failed: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
$totalCount = $null; try { $totalCount = [int]$probe.meta.pagination.count } catch {}
if ($null -eq $totalCount) { Write-Host "ABORT: pre-flight probe returned no meta.pagination.count. The count guard depends on it." -ForegroundColor Red; exit 1 }
if ($totalCount -gt [int]$config.searchSanityMaxCount) {
    Write-Host "ABORT: search matches $totalCount > searchSanityMaxCount ($($config.searchSanityMaxCount)). The saved search looks too broad - check the UI." -ForegroundColor Red
    exit 1
}
Write-Host "  search matches $totalCount record(s) total." -ForegroundColor Green
$recordsThisRun = 1   # the pre-flight probe

# --- dry run: plan only, nothing written -------------------------------------
if ($DryRun) {
    Write-Host ""
    Write-Host "DRY RUN - plan only, nothing will be written or drained." -ForegroundColor Cyan
    Write-Host "  search_id:        $($config.searchId)"
    Write-Host "  watermark:        $(if ($state -and $state.highWaterCapturedDate) { $state.highWaterCapturedDate } else { '(none - needs -Backfill)' })"
    Write-Host "  end day (UTC):    $($endDate.ToString('yyyy-MM-dd'))   (safetyLagDays=$safetyLag)"
    Write-Host "  forward days:     $($forwardDays.Count)$(if ($forwardDays.Count) { ' -> [' + ($forwardDays -join ', ') + ']' })"
    Write-Host "  max records:      $maxRecords"
    Write-Host "  month so far:     $recordsSoFar  (soft $($config.quota.softStopAt) / hard $($config.quota.hardStopAt))"
    Write-Host "  (per-day counts are measured at run time; this dry run spent exactly 1 record.)"
    Write-Host ""
    return
}

# --- guard: soft stop (conservative - assumes the full MaxRecords could be spent)
if (($recordsSoFar + $maxRecords) -gt [int]$config.quota.softStopAt -and -not $AcceptQuotaCost) {
    Write-Host "REFUSE: this run could cross the monthly soft stop ($recordsSoFar + up to $maxRecords > $($config.quota.softStopAt))." -ForegroundColor Red
    Write-Host "        Pass -AcceptQuotaCost to proceed anyway."
    exit 1
}

# --- prepare state + output --------------------------------------------------
if (-not $state)  { $state = New-HGState -SearchId $config.searchId }
if ($Backfill)    { $state.searchId = $config.searchId }             # re-seed after a search switch

$candRoot  = Get-HGPipelinePath 'candidates'
$killedCsv = Get-HGPipelinePath 'killed.csv'
Ensure-Dir (Get-HGPipelinePath $null)
Ensure-Dir $candRoot

$seen      = Get-HGSeenSet
$usedSlugs = @{}
$pass = 0; $killed = 0; $dupes = 0

# --- recheck window: re-probe the last N completed days for back-dated records
$recheckDays = @()
if (-not $Backfill -and $state.days) {
    $completed = @($state.days.PSObject.Properties.Name | Sort-Object -Descending | Select-Object -First ([int]$config.recheckWindowDays))
    foreach ($d in $completed) {
        $now = Get-HGDayCount -Config $config -Day $d
        $recordsThisRun++
        $prev = [int]$state.days.$d.count
        if ($null -ne $now -and $now -gt $prev) {
            Write-Host "  recheck: $d grew $prev -> $now; re-draining for unseen records." -ForegroundColor Yellow
            $recheckDays += $d
        }
    }
}

if ($recheckDays.Count -eq 0 -and $forwardDays.Count -eq 0) {
    Save-HGState -State $state
    Write-Host ""
    Write-Host "Up to date - watermark $($state.highWaterCapturedDate); nothing new through $($endDate.ToString('yyyy-MM-dd'))." -ForegroundColor Green
    Write-Host ""
    return
}

Write-Host ""
Write-Host "Draining days (records this run so far: $recordsThisRun / cap $maxRecords)..." -ForegroundColor Cyan

# --- recheck days: pick up unseen records; do NOT move the watermark ---------
foreach ($d in $recheckDays) {
    if ($recordsThisRun -ge $maxRecords) { Write-Host "  MaxRecords reached; deferring remaining rechecks." -ForegroundColor Yellow; break }
    $r = Invoke-HGDrainDay -Config $config -Day $d -Seen $seen -UsedSlugs $usedSlugs -CandRoot $candRoot -KilledCsv $killedCsv
    $recordsThisRun += $r.fetched; $pass += $r.pass; $killed += $r.killed; $dupes += $r.dupes
    if ($r.fullyDrained) { Set-HGDay -State $state -Day $d -Fetched $r.served -Count $r.count }
    Add-HGQuota -State $state -Records $r.fetched
    Save-HGState -State $state
    Write-Host ("  recheck {0}: {1} pass, {2} kill, {3} dup" -f $d, $r.pass, $r.killed, $r.dupes)
}

# --- forward days: advance the watermark only on a confirmed whole drain -----
foreach ($d in $forwardDays) {
    if ($recordsThisRun -ge $maxRecords) {
        Write-Host "  MaxRecords ($maxRecords) reached; days from $d onward deferred to next run." -ForegroundColor Yellow
        break
    }
    $r = Invoke-HGDrainDay -Config $config -Day $d -Seen $seen -UsedSlugs $usedSlugs -CandRoot $candRoot -KilledCsv $killedCsv
    $recordsThisRun += $r.fetched; $pass += $r.pass; $killed += $r.killed; $dupes += $r.dupes
    Add-HGQuota -State $state -Records $r.fetched
    if ($r.fullyDrained) {
        Set-HGDay -State $state -Day $d -Fetched $r.served -Count $r.count
        $state.highWaterCapturedDate = $d                            # advance ONLY on a whole drain
        Save-HGState -State $state
        $phantom = if ($r.count -and $r.count -gt $r.served) { "  ($($r.count - $r.served) counted-but-not-served)" } else { "" }
        Write-Host ("  {0}: {1} pass, {2} kill, {3} dup  (served {4}){5}" -f $d, $r.pass, $r.killed, $r.dupes, $r.served, $phantom)
    } else {
        Save-HGState -State $state
        Write-Host ("  WARN: {0} not fully drained (pages incomplete); watermark held for re-drain next run." -f $d) -ForegroundColor Yellow
        break                                                        # never skip past an incompletely drained day
    }
}

Save-HGState -State $state
Write-Host ""
Write-Host "Live fetch complete." -ForegroundColor Cyan
Write-Host "  watermark now:     $($state.highWaterCapturedDate)"
Write-Host "  candidates:        $pass"
Write-Host "  killed:            $killed"
Write-Host "  dupes skipped:     $dupes"
Write-Host "  records this run:  ~$recordsThisRun"
Write-Host "  month:             $($state.quota.recordsFetched) / $($config.quota.monthlyBudget)"
Write-Host "  output:            $candRoot"
Write-Host ""
return
