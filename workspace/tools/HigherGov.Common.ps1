<#
  HigherGov.Common.ps1 - shared helpers for the HigherGov intake scripts.
  Dot-sourced by Test-HigherGovConnection.ps1 and Get-HigherGovOpportunities.ps1.
  Windows PowerShell 5.1. No external modules.

  All the 5.1 traps documented in the design live here so they're fixed once:
   - UTF-8 writes WITHOUT a BOM (a BOM breaks YAML front-matter)
   - contact fields are OBJECTS, not strings (reach through to .contact_email)
   - date math uses .Date on both sides (else 14.4 days floors to 14 and flips a kill)
   - the API key rides in the URL, so it is scrubbed from all output
#>

Set-StrictMode -Off
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

# --- Paths -------------------------------------------------------------------

$script:ToolsDir    = $PSScriptRoot
$script:RepoRoot    = Split-Path $PSScriptRoot -Parent
$script:PipelineDir = Join-Path $script:RepoRoot 'RFP-pipeline'
$script:ConfigPath  = Join-Path $PSScriptRoot 'highergov-config.json'

function Get-HGPipelinePath { param([string]$Leaf) if ($Leaf) { Join-Path $script:PipelineDir $Leaf } else { $script:PipelineDir } }

# --- Config & key ------------------------------------------------------------

function Get-HGConfig {
    if (-not (Test-Path $script:ConfigPath)) {
        throw "Config not found: $script:ConfigPath"
    }
    return (Get-Content $script:ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Get-HGApiKey {
    $k = $env:HIGHERGOV_API_KEY
    if ([string]::IsNullOrWhiteSpace($k)) {
        throw "HIGHERGOV_API_KEY is not set. See tools/README.md (HigherGov section)."
    }
    return $k
}

# --- Key scrubbing (the key is in the URL - never let it reach disk/console) --

function Hide-ApiKey {
    param([string]$Text)
    if ($null -eq $Text) { return $Text }
    return ($Text -replace '(api_key=)[^&\s"'']*', '$1***REDACTED***')
}

# --- Leak guard: refuse to let an api_key ever cross a disk boundary ----------
# The key rides in request URLs (and, in later phases, inside document_path).
# This throws BEFORE any write that still carries it. Redundant with Hide-ApiKey
# by design - a scrub that silently fails is worse than a loud stop.
function Assert-NoSecret {
    param([string]$Text, [string]$Context = 'output')
    if ($null -ne $Text -and $Text -match 'api_key=') {
        throw "LEAK GUARD: refusing to write $Context - it still contains an 'api_key=' secret."
    }
}

# --- UTF-8 without BOM (the #1 way to corrupt a YAML front-matter file) -------

function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    Assert-NoSecret $Text $Path
    $enc = New-Object System.Text.UTF8Encoding($false)   # $false = no BOM
    [System.IO.File]::WriteAllText($Path, $Text, $enc)
}

# --- Safe property access on a PSCustomObject (no -AsHashtable in 5.1) --------

function Get-Prop {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $p = $Object.PSObject.Properties[$Name]
    if ($p) { return $p.Value } else { return $null }
}

# Reach through the contact OBJECT to a scalar. "$obj" would render @{...}.
function Get-ContactField {
    param($Contact, [string]$Field)
    if ($null -eq $Contact) { return $null }
    return (Get-Prop $Contact $Field)
}

# --- Dates -------------------------------------------------------------------

function ConvertTo-HGDate {
    # Parse an API date/datetime robustly. Returns [datetime] or $null. Never throws.
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    try {
        $dto = [System.DateTimeOffset]::Parse($Value, [System.Globalization.CultureInfo]::InvariantCulture)
        return $dto.DateTime      # keep the wall-clock date; do NOT convert to local (would shift the day)
    } catch {
        return $null
    }
}

function Get-DaysUntil {
    # Whole calendar days from $FromDate to $DueDate, using .Date on both sides.
    param([datetime]$FromDate, [datetime]$DueDate)
    return [int]([math]::Floor(($DueDate.Date - $FromDate.Date).TotalDays))
}

# --- Slug (the join key across the whole workflow - freeze it once) -----------

function ConvertTo-Slug {
    param([string]$Text, [int]$MaxLen = 60)
    if ([string]::IsNullOrWhiteSpace($Text)) { return 'untitled' }

    $s = $Text.ToLowerInvariant().Replace('&', ' and ')

    # strip diacritics: e -> e, i -> i, etc.
    $formD = $s.Normalize([System.Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $formD.ToCharArray()) {
        if ([System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    $s = $sb.ToString().Normalize([System.Text.NormalizationForm]::FormC)

    $s = $s -replace '[^a-z0-9]+', '-'
    $s = $s.Trim('-')

    if ($s.Length -gt $MaxLen) {
        $s = $s.Substring(0, $MaxLen)
        $cut = $s.LastIndexOf('-')
        if ($cut -ge 30) { $s = $s.Substring(0, $cut) }   # break on a word boundary if reasonable
        $s = $s.Trim('-')
    }

    $s = $s.TrimEnd('.')   # Windows silently drops trailing dots
    if ([string]::IsNullOrWhiteSpace($s)) { $s = 'untitled' }

    $reserved = @('con','prn','aux','nul','com1','com2','com3','com4','com5','com6','com7','com8','com9','lpt1','lpt2','lpt3','lpt4','lpt5','lpt6','lpt7','lpt8','lpt9')
    if ($reserved -contains $s) { $s = "$s-rfp" }

    return $s
}

# --- The prefilter - kills on exactly three unarguable facts; fails open ------

function Test-HGPrefilter {
    <#
      Returns a hashtable:
        pass       [bool]
        killReason [string] or $null   (due-in-under-10-days | set-aside-not-held | excluded-opp-type-rfi-sources-sought)
        flags      [string[]]          (non-fatal: unrecognized-set-aside, no-due-date, no-contact)
        daysUntilDue [int] or $null    (basis: captured_date)
      A false kill is invisible and costs a deal; a false pass costs a little scoring effort.
      So: kill ONLY on the three known facts; anything unrecognized passes with a flag.
    #>
    param($Record, $Config)

    $prof = $Config.seamgenProfile
    $flags = New-Object System.Collections.Generic.List[string]

    # 1) Opportunity type - RFI / Sources Sought are excluded (client-side; API can't filter it)
    $oppType = Get-Prop (Get-Prop $Record 'opp_type') 'description'
    if ($oppType) {
        foreach ($ex in $prof.excludedOppTypes) {
            if ($oppType -match [regex]::Escape($ex)) {
                return @{ pass=$false; killReason='excluded-opp-type-rfi-sources-sought'; flags=$flags.ToArray(); daysUntilDue=$null }
            }
        }
    }

    # 2) Set-aside - explicit DENY list only; unrecognized => pass + flag (fail open)
    $setAside = Get-Prop $Record 'set_aside'
    if (-not [string]::IsNullOrWhiteSpace($setAside)) {
        foreach ($deny in $prof.setAsideDenyList) {
            if ($setAside -match [regex]::Escape($deny)) {
                return @{ pass=$false; killReason='set-aside-not-held'; flags=$flags.ToArray(); daysUntilDue=$null }
            }
        }
        $recognized = $false
        foreach ($ok in $prof.setAsidePassList) {
            if ($setAside -match [regex]::Escape($ok)) { $recognized = $true; break }
        }
        if (-not $recognized) { $flags.Add('unrecognized-set-aside') }
    }

    # 3) Timeline - under minDaysToDue kills. A NULL due date does NOT kill (fail open).
    $days = $null
    $dueRaw = Get-Prop $Record 'due_date'
    $due = ConvertTo-HGDate $dueRaw
    if ($null -eq $due) {
        $flags.Add('no-due-date')
    } else {
        $capturedBasis = ConvertTo-HGDate (Get-Prop $Record 'captured_date')
        if ($null -eq $capturedBasis) { $capturedBasis = Get-Date }
        $days = Get-DaysUntil -FromDate $capturedBasis -DueDate $due
        if ($days -lt [int]$prof.minDaysToDue) {
            return @{ pass=$false; killReason='due-in-under-10-days'; flags=$flags.ToArray(); daysUntilDue=$days }
        }
    }

    # sole_source_flag is unreliable (true on plainly competitive RFPs) - FLAG, never kill
    $sole = Get-Prop $Record 'sole_source_flag'
    if ("$sole" -eq 'True') { $flags.Add('sole-source-flagged') }

    # NAICS outside Seamgen's profile is a signal to eyeball, not a kill (a false kill is invisible)
    $recNaics = Get-Prop (Get-Prop $Record 'naics_code') 'naics_code'
    if (-not [string]::IsNullOrWhiteSpace($recNaics) -and ($prof.naics -notcontains $recNaics)) {
        $flags.Add('naics-outside-profile')
    }

    # contact presence is informational, never a kill
    if ($null -eq (Get-Prop $Record 'primary_contact_email')) { $flags.Add('no-contact') }

    return @{ pass=$true; killReason=$null; flags=$flags.ToArray(); daysUntilDue=$days }
}

# --- YAML helper -------------------------------------------------------------

function Format-YamlValue {
    param($Value)
    if ($null -eq $Value -or ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value))) { return 'unknown' }
    $s = [string]$Value
    $s = $s -replace '\\', '\\' -replace '"', '\"'
    return '"' + $s + '"'
}

# --- Candidate file content --------------------------------------------------

function New-CandidateContent {
    <#
      Builds the candidate .md (YAML front-matter + body) that the scoring skill reads.
      $Attachments is an array of @{ file_name; char_count; text } (may be empty offline).
    #>
    param($Record, $Prefilter, [string]$Slug, $Attachments = @())

    $primary   = Get-Prop $Record 'primary_contact_email'
    $secondary = Get-Prop $Record 'secondary_contact_email'
    $agency    = Get-Prop $Record 'agency'
    $naics     = Get-Prop $Record 'naics_code'

    $hasText = $false
    foreach ($a in $Attachments) { if ($a.text -and $a.text.Trim().Length -gt 0) { $hasText = $true; break } }
    $confidence = if ($hasText) { 'full-text' } else { 'metadata-only' }

    $prefilterState = if ($Prefilter.flags.Count -gt 0) { 'pass-with-flag' } else { 'pass' }
    $flagYaml = if ($Prefilter.flags.Count -gt 0) { '[' + (($Prefilter.flags | ForEach-Object { '"' + $_ + '"' }) -join ', ') + ']' } else { '[]' }

    $daysAtCapture = if ($null -ne $Prefilter.daysUntilDue) { [string]$Prefilter.daysUntilDue } else { 'unknown' }

    $fm = @()
    $fm += '---'
    $fm += '# --- provenance ---'
    $fm += 'source: HigherGov'
    $fm += 'source_url: ' + (Format-YamlValue (Get-Prop $Record 'path'))
    $fm += 'solicitation_url: ' + (Format-YamlValue (Get-Prop $Record 'source_path'))
    $fm += 'opp_key: ' + (Format-YamlValue (Get-Prop $Record 'opp_key'))
    $fm += 'version_key: ' + (Format-YamlValue (Get-Prop $Record 'version_key'))
    $fm += 'captured_date: ' + (Format-YamlValue (Get-Prop $Record 'captured_date'))
    $fm += 'slug: ' + (Format-YamlValue $Slug)
    $fm += '# --- scoring header fields ---'
    $fm += 'title: ' + (Format-YamlValue (Get-Prop $Record 'title'))
    $fm += 'rfp_number: ' + (Format-YamlValue (Get-Prop $Record 'source_id'))
    $fm += 'agency_name: ' + (Format-YamlValue (Get-Prop $agency 'agency_name'))
    $fm += 'agency_type: ' + (Format-YamlValue (Get-Prop $agency 'agency_type'))
    $fm += 'primary_contact_name: ' + (Format-YamlValue (Get-ContactField $primary 'contact_name'))
    $fm += 'primary_contact_title: ' + (Format-YamlValue (Get-ContactField $primary 'contact_title'))
    $fm += 'primary_contact_email: ' + (Format-YamlValue (Get-ContactField $primary 'contact_email'))
    $fm += 'primary_contact_phone: ' + (Format-YamlValue (Get-ContactField $primary 'contact_phone'))
    $fm += 'secondary_contact_email: ' + (Format-YamlValue (Get-ContactField $secondary 'contact_email'))
    $fm += 'posted_date: ' + (Format-YamlValue (Get-Prop $Record 'posted_date'))
    $fm += 'due_date: ' + (Format-YamlValue (Get-Prop $Record 'due_date'))
    $fm += 'due_date_time: unknown          # HigherGov carries no time or timezone'
    $fm += 'days_until_due_at_capture: ' + $daysAtCapture
    $fm += 'questions_due_date: unknown     # NOT carried by the HigherGov API'
    $fm += '# --- gate inputs ---'
    $fm += 'naics_code: ' + (Format-YamlValue (Get-Prop $naics 'naics_code'))
    $fm += 'naics_description: ' + (Format-YamlValue (Get-Prop $naics 'naics_description'))
    $fm += 'psc_code: ' + (Format-YamlValue (Get-Prop $Record 'psc_code'))
    $fm += 'opp_type: ' + (Format-YamlValue (Get-Prop (Get-Prop $Record 'opp_type') 'description'))
    $fm += 'source_type: ' + (Format-YamlValue (Get-Prop $Record 'source_type'))
    $fm += 'set_aside: ' + (Format-YamlValue (Get-Prop $Record 'set_aside'))
    $fm += 'val_est_low: ' + (Format-YamlValue (Get-Prop $Record 'val_est_low'))
    $fm += 'val_est_high: ' + (Format-YamlValue (Get-Prop $Record 'val_est_high'))
    $fm += 'pop_state: ' + (Format-YamlValue (Get-Prop $Record 'pop_state'))
    $fm += '# --- pipeline metadata ---'
    $fm += 'prefilter: ' + $prefilterState
    $fm += 'prefilter_flags: ' + $flagYaml
    $fm += 'scoring_confidence: ' + $confidence
    $fm += 'status: awaiting-scoring'
    $fm += 'score: null'
    $fm += '---'
    $fm += ''

    $title = Get-Prop $Record 'title'
    $body = @()
    $body += "# $title"
    $body += ''
    $body += '> **For Claude.** This is a HigherGov intake record, not the full solicitation.'
    $body += '> Score it with `skills/rfp-scoring-skill.md`. `Source (found via)` is **HigherGov** - do not ask Jake.'
    $body += '> **Recompute "Days until due" against today**; `days_until_due_at_capture` was correct at capture, not now.'
    $body += '> Any field marked `unknown` was not available from HigherGov - write "unknown", never guess.'
    if ($confidence -eq 'metadata-only') {
        $body += '> **`scoring_confidence: metadata-only`** - no attachment text was available. You are scoring off a summary;'
        $body += '> Gate 2, Gate 4, Gate 5 and Category 1 are all weaker. Mark the score provisional and say so.'
    }
    $body += ''
    $body += '## HigherGov AI summary'
    $body += ([string](Get-Prop $Record 'ai_summary')).Trim()
    $body += ''
    $body += '## Opportunity description (verbatim from HigherGov)'
    $body += ([string](Get-Prop $Record 'description_text')).Trim()
    $body += ''
    if ($Attachments.Count -gt 0) {
        foreach ($a in $Attachments) {
            $body += "## Attachment: $($a.file_name)  ($($a.char_count) chars)"
            $body += ([string]$a.text).Trim()
            $body += ''
        }
    } else {
        $body += '## Attachments'
        $body += '_No attachment text retrieved. Read the original solicitation before relying on the score._'
        $body += ''
    }
    $body += '## Links'
    $body += '- HigherGov page: ' + [string](Get-Prop $Record 'path')
    $body += '- Original solicitation: ' + [string](Get-Prop $Record 'source_path')
    $body += ''

    return (($fm + $body) -join "`r`n")
}

# --- killed.csv row ----------------------------------------------------------

function Add-KilledRow {
    param([string]$CsvPath, $Record, $Prefilter)
    $agency = Get-Prop $Record 'agency'
    $naics  = Get-Prop $Record 'naics_code'
    $row = [PSCustomObject]@{
        captured_date  = Get-Prop $Record 'captured_date'
        opp_key        = Get-Prop $Record 'opp_key'
        version_key    = Get-Prop $Record 'version_key'
        title          = Get-Prop $Record 'title'
        agency         = Get-Prop $agency 'agency_name'
        due_date       = Get-Prop $Record 'due_date'
        days_until_due = $Prefilter.daysUntilDue
        set_aside      = Get-Prop $Record 'set_aside'
        naics          = Get-Prop $naics 'naics_code'
        opp_type       = Get-Prop (Get-Prop $Record 'opp_type') 'description'
        kill_reason    = $Prefilter.killReason
        highergov_url  = Get-Prop $Record 'path'
    }
    Assert-NoSecret ([string]$row.highergov_url) $CsvPath
    $exists = Test-Path $CsvPath
    if ($exists) {
        $row | Export-Csv -Path $CsvPath -Append -NoTypeInformation -Encoding UTF8
    } else {
        $row | Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8   # BOM kept: Excel needs it for em-dashes
    }
}

# --- State ledger + quota counter (RFP-pipeline/state.json) ------------------
# state.json is the durable watermark. Because captured_date is EXACT-match,
# highWaterCapturedDate is a day-completion ledger (last whole day drained), not
# a cursor. Dedupe lives in seen.csv (version_key), NOT here - state.json must
# stay small. Written via Write-Utf8NoBom, so the leak guard covers it.

function Get-HGStatePath { Get-HGPipelinePath 'state.json' }
function Get-HGSeenPath  { Get-HGPipelinePath 'seen.csv' }

function Get-HGUtcToday { return ([datetime]::UtcNow).Date }   # day boundary is UTC (captured_date is UTC)
function Get-HGUtcMonth { return ([datetime]::UtcNow).ToString('yyyy-MM') }

function New-HGState {
    param([string]$SearchId)
    return [PSCustomObject]@{
        schemaVersion         = 1
        searchId              = $SearchId
        highWaterCapturedDate = $null
        quota                 = [PSCustomObject]@{
            month          = Get-HGUtcMonth
            recordsFetched = 0
            totalFetched   = 0
            history        = @()
        }
        days             = [PSCustomObject]@{}
        documentsPending = @()
        drift            = [PSCustomObject]@{}
    }
}

function Get-HGState {
    $p = Get-HGStatePath
    if (-not (Test-Path $p)) { return $null }
    return (Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Save-HGState {
    param($State)
    $p   = Get-HGStatePath
    $dir = Split-Path $p -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Write-Utf8NoBom -Path $p -Text ($State | ConvertTo-Json -Depth 12)
}

# Record that a calendar day was drained whole; prune the ledger to 60 days.
function Set-HGDay {
    param($State, [string]$Day, [int]$Fetched, [int]$Count)
    $val = [PSCustomObject]@{ fetched = $Fetched; count = $Count }
    if ($State.days.PSObject.Properties[$Day]) {
        $State.days.$Day = $val
    } else {
        $State.days | Add-Member -NotePropertyName $Day -NotePropertyValue $val -Force
    }
    $keys = @($State.days.PSObject.Properties.Name | Sort-Object -Descending)
    if ($keys.Count -gt 60) {
        foreach ($old in ($keys | Select-Object -Skip 60)) {
            $State.days.PSObject.Properties.Remove($old)
        }
    }
}

# Monthly quota counter; rolls over (archiving the prior month) when the UTC month changes.
function Add-HGQuota {
    param($State, [int]$Records)
    $month = Get-HGUtcMonth
    if ($State.quota.month -ne $month) {
        if ($State.quota.month) {
            $hist = @()
            if ($State.quota.history) { $hist = @($State.quota.history) }   # '[]' round-trips to $null in 5.1
            $hist += ,([PSCustomObject]@{ month = $State.quota.month; recordsFetched = $State.quota.recordsFetched })
            $State.quota.history = $hist
        }
        $State.quota.month          = $month
        $State.quota.recordsFetched = 0
    }
    $State.quota.recordsFetched += $Records
    $State.quota.totalFetched   += $Records
}

# --- Dedupe ledger (RFP-pipeline/seen.csv, keyed on version_key) -------------

function Get-HGSeenSet {
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    $p = Get-HGSeenPath
    if (Test-Path $p) {
        Import-Csv $p | ForEach-Object { if ($_.version_key) { [void]$set.Add([string]$_.version_key) } }
    }
    return ,$set   # comma: stop PowerShell unrolling the set (an empty set would unroll to $null)
}

function Add-HGSeenRow {
    param([string]$VersionKey, [string]$OppKey, [string]$CapturedDate)
    Assert-NoSecret $VersionKey 'seen.csv'
    $p   = Get-HGSeenPath
    $dir = Split-Path $p -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $row = [PSCustomObject]@{
        version_key   = $VersionKey
        opp_key       = $OppKey
        captured_date = $CapturedDate
        seen_utc      = ([datetime]::UtcNow).ToString('o')
    }
    if (Test-Path $p) {
        $row | Export-Csv -Path $p -Append -NoTypeInformation -Encoding UTF8
    } else {
        $row | Export-Csv -Path $p -NoTypeInformation -Encoding UTF8
    }
}

# --- Live API call (used only by scripts that hit the network) ---------------

function Invoke-HigherGov {
    param([string]$Method, [hashtable]$Query)
    $key = Get-HGApiKey
    $timeoutSec = 60
    if (-not [string]::IsNullOrWhiteSpace($env:HIGHERGOV_TIMEOUT_SEC)) {
        try { $timeoutSec = [int]$env:HIGHERGOV_TIMEOUT_SEC } catch { $timeoutSec = 60 }
    }
    $q = @("api_key=$([uri]::EscapeDataString($key))")
    foreach ($k in $Query.Keys) {
        $v = $Query[$k]
        if ($null -ne $v -and "$v" -ne '') {
            $q += "$k=$([uri]::EscapeDataString([string]$v))"
        }
    }
    $uri = "https://www.highergov.com/api-external/$Method/?" + ($q -join '&')
    try {
        $resp = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec $timeoutSec
        $json = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
        return ($json | ConvertFrom-Json)
    }
    catch [System.Net.WebException] {
        $r = $_.Exception.Response
        $status = if ($r) { [int]$r.StatusCode } else { 0 }
        $body = ''
        if ($r) {
            try { $body = (New-Object System.IO.StreamReader($r.GetResponseStream())).ReadToEnd() } catch {}
        }
        $msg = Hide-ApiKey ("HigherGov $Method failed (HTTP $status): " + $_.Exception.Message + " " + $body)
        throw $msg
    }
    catch {
        # DNS / TLS / timeout / JSON errors are NOT WebExceptions; their messages
        # can carry the full request URI - with the key. Scrub before rethrow.
        throw (Hide-ApiKey $_.Exception.Message)
    }
}
