<#
.SYNOPSIS
    Sends a Slack message to a Seamgen teammate (as a DM) or to a channel.

.DESCRIPTION
    Talks to the Slack Web API over plain HTTPS. No Node, no Python, no installs.
    Reads the Slack token from the SLACK_BOT_TOKEN environment variable.

    Nothing is ever sent unless you pass -Confirm. By default the script only
    shows you a preview of what WOULD be sent, so a mistake costs nothing.

.PARAMETER To
    Who to send to. Either:
      - a teammate's name from team.json  (e.g. "Chris", "Marianne")
      - a channel                         (e.g. "#rfp-status")
      - a raw Slack user ID               (e.g. "U01ABCDEF")

.PARAMETER Message
    The message text. Slack markdown ("mrkdwn") is supported: *bold*, _italic_,
    `code`, and <https://example.com|link text>. Use `n for a line break.

.PARAMETER Confirm
    Actually send. Without this flag the script previews and exits.

.EXAMPLE
    .\Send-SlackMessage.ps1 -To Chris -Message "Timeline estimate for the RPV RFP?"
    Previews the DM without sending it.

.EXAMPLE
    .\Send-SlackMessage.ps1 -To Chris -Message "Timeline estimate?" -Confirm
    Actually sends the DM.

.EXAMPLE
    .\Send-SlackMessage.ps1 -To "#rfp-status" -Message "RPV scored 72 - Worth a Look." -Confirm
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$To,

    [Parameter(Mandatory = $true)]
    [string]$Message,

    [switch]$Confirm
)

$ErrorActionPreference = 'Stop'

# --- Token -------------------------------------------------------------------

$token = $env:SLACK_BOT_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "ERROR: No Slack token found." -ForegroundColor Red
    Write-Host "The SLACK_BOT_TOKEN environment variable is not set. See README.md, step 4."
    exit 1
}

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json; charset=utf-8'
}

function Invoke-Slack {
    param([string]$Method, [hashtable]$Body)

    $uri = "https://slack.com/api/$Method"
    $json = ($Body | ConvertTo-Json -Depth 5 -Compress)
    # Slack requires UTF-8; PowerShell 5.1 would otherwise mangle non-ASCII characters.
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    try {
        $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $bytes
    }
    catch {
        Write-Host "ERROR: Could not reach Slack ($Method)." -ForegroundColor Red
        Write-Host $_.Exception.Message
        exit 1
    }

    if (-not $response.ok) {
        Write-Host "ERROR: Slack rejected the request ($Method): $($response.error)" -ForegroundColor Red
        switch ($response.error) {
            'invalid_auth'      { Write-Host "The token is wrong or expired. Re-copy it from the Slack app page." }
            'not_authed'        { Write-Host "The token is missing. Set SLACK_BOT_TOKEN. See README.md, step 4." }
            'missing_scope'     { Write-Host "The Slack app is missing a permission. Needed: $($response.needed). Add it in the app's OAuth page, then REINSTALL the app." }
            'users_not_found'   { Write-Host "No Slack user has that email address. Check the address in team.json." }
            'channel_not_found' { Write-Host "That channel does not exist, or the app cannot see it. Private channels must have the app invited: /invite @Seamgen RFP Assistant" }
            'not_in_channel'    { Write-Host "The app is not a member of that channel. In Slack, run: /invite @Seamgen RFP Assistant" }
        }
        exit 1
    }

    return $response
}

# --- Resolve the destination -------------------------------------------------

$targetLabel = $To
$channelId = $null

if ($To.StartsWith('#')) {
    # A channel. Slack accepts the channel name directly on chat.postMessage.
    $channelId = $To
    $targetLabel = "channel $To"
}
elseif ($To -match '^U[A-Z0-9]{6,}$') {
    # A raw Slack user ID. Open a DM with them.
    $im = Invoke-Slack -Method 'conversations.open' -Body @{ users = $To }
    $channelId = $im.channel.id
    $targetLabel = "user $To (direct message)"
}
else {
    # A teammate's name. Look up their email in team.json, then find them in Slack.
    $teamFile = Join-Path $PSScriptRoot 'team.json'
    if (-not (Test-Path $teamFile)) {
        Write-Host "ERROR: team.json not found next to this script." -ForegroundColor Red
        exit 1
    }

    $team = Get-Content $teamFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $key = $To.Trim().ToLower()
    $email = $team.people.$key

    if ([string]::IsNullOrWhiteSpace($email)) {
        Write-Host "ERROR: No email address on file for '$To'." -ForegroundColor Red
        Write-Host "Add it to team.json, or pass a #channel or a Slack user ID instead."
        Write-Host ""
        Write-Host "Names currently in team.json:"
        $team.people.PSObject.Properties |
            Where-Object { $_.Name -ne '_comment' } |
            ForEach-Object {
                $status = if ([string]::IsNullOrWhiteSpace($_.Value)) { "(no email yet)" } else { $_.Value }
                Write-Host ("  {0,-10} {1}" -f $_.Name, $status)
            }
        exit 1
    }

    $user = Invoke-Slack -Method 'users.lookupByEmail' -Body @{ email = $email }
    $im = Invoke-Slack -Method 'conversations.open' -Body @{ users = $user.user.id }
    $channelId = $im.channel.id
    $displayName = $user.user.profile.real_name
    $targetLabel = "$displayName <$email> (direct message)"
}

# --- Preview -----------------------------------------------------------------

Write-Host ""
Write-Host "  To:      $targetLabel" -ForegroundColor Cyan
Write-Host "  Message:" -ForegroundColor Cyan
$Message -split "`n" | ForEach-Object { Write-Host "    $_" }
Write-Host ""

if (-not $Confirm) {
    Write-Host "PREVIEW ONLY - nothing was sent." -ForegroundColor Yellow
    Write-Host "Re-run the same command with -Confirm to actually send it."
    exit 0
}

# --- Send --------------------------------------------------------------------

$result = Invoke-Slack -Method 'chat.postMessage' -Body @{
    channel = $channelId
    text    = $Message
}

Write-Host "SENT to $targetLabel" -ForegroundColor Green
Write-Host "  (Slack timestamp: $($result.ts))" -ForegroundColor DarkGray
