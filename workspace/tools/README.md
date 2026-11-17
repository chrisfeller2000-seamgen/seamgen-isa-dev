# HigherGov intake (inbound — pulls RFPs to score)

This pulls new RFP opportunities *in* from HigherGov, prefilters them, and writes candidate files for Claude to score.
It reads from HigherGov only — it never writes to HigherGov, and it can't spend money,
only your monthly record quota.

## What's in here

| File | What it is |
|---|---|
| `Get-HigherGovOpportunities.ps1` | The workhorse. Fetches, prefilters, writes candidate files. |
| `Test-HigherGovConnection.ps1` | Checks the key and probes the API. Spends ~6 records; writes nothing. |
| `HigherGov.Common.ps1` | Shared helpers. Not run directly. |
| `highergov-config.json` | The saved-search ID + Seamgen's profile (certs, set-aside deny-list). |

Candidate files and logs land in the **`RFP-pipeline/`** folder (a sibling of `RFPs/`).

## Setup — three steps, once

### Step 1 — Get an API key from HigherGov

Only an account admin can generate one, at `https://www.highergov.com/api-management/`.
(The key is shown once — copy it immediately.)

### Step 2 — Store the key as an environment variable, via the Windows GUI

The key travels inside the request URL, so it must never be typed at a PowerShell prompt
(PowerShell saves your command history to disk in plaintext, forever). Set it through the
GUI instead:

1. Press the **Windows key**, type **environment variables**
2. Click **"Edit environment variables for your account"**
3. Under "User variables", click **New…**
4. **Variable name:** `HIGHERGOV_API_KEY`  **Value:** your key
5. **OK**, **OK**, then **fully close and reopen VS Code**

### Step 3 — Confirm the saved search

`highergov-config.json` already holds the `searchId` for the "Seamgen Core RFP Filter."
The API has almost no filters of its own — NAICS, keywords, agency types all live *inside*
that saved search. If you edit the saved search in HigherGov's website, the pipeline's
filter changes with it.

## Using it

**Everything you can test without a key spends nothing:**

```powershell
cd C:\Users\jolik\OneDrive\Projects\Seamgen-RFPs\tools

# Show config + state. No network.
.\Get-HigherGovOpportunities.ps1 -Status

# Run the whole prefilter + candidate-writing pipeline against test fixtures. No network.
.\Get-HigherGovOpportunities.ps1 -FromFile ..\pipeline\fixtures
```

**Once the key is set**, first prove the connection and answer the open questions about
the API's behavior (spends ~6 records, writes nothing):

```powershell
.\Test-HigherGovConnection.ps1
```

Then a real pull turns on after those answers are recorded. (Live fetch is intentionally
gated off in this build until the connection test confirms how the API behaves.)

## Things worth knowing

**The prefilter kills on exactly three facts** — due in under 10 days, a set-aside Seamgen
doesn't hold, or an RFI / Sources Sought notice. Everything else passes through to the
scorer. Deal size is deliberately *not* a kill. Everything killed is logged to
`RFP-pipeline/killed.csv`, so nothing ever vanishes silently.

**The monthly quota is 10,000 records** (not requests). The scripts count every record and
stop well before the limit. A pre-flight count check means a mistyped or over-broad saved
search can't burn the month in one run.

**The key is a password, and it rides in the URL.** Never paste a HigherGov URL from an
error message into a chat, a file, or a ticket without checking it for `api_key=` first.
The scripts scrub it from their own output automatically.

---

# Google Drive sync (outbound — pushes RFP documents to the Sales shared drive)

`Sync-RfpToDrive.ps1` copies an RFP's agency source documents into its folder under
**Sales (shared drive) › Favorable RFP's**, so Peter and Marianne can read a solicitation
from one link instead of navigating HigherGov. It wraps **rclone**, a single portable
binary that talks to Google Drive.

Local disk stays the source of truth. Drive is the copy leadership reads.

## What's in here

| File | What it is |
|---|---|
| `Sync-RfpToDrive.ps1` | Takes one or more RFP slugs, copies each one's `resources/` to its Drive folder, verifies the counts. |
| *(rclone itself)* | Installed by winget, lives outside this folder. Not checked in. |

## Setup — two steps, once

### Step 1 — Install rclone

```powershell
winget install Rclone.Rclone
```

It's a **portable zip**, not an installer: no administrator rights, no background service,
nothing added to the registry. Restart your terminal afterwards so `rclone` is on the PATH
(the script can find it either way).

### Step 2 — Connect it to the Sales shared drive

Run `rclone config` and answer:

| Prompt | Answer |
|---|---|
| `n/s/q>` | **`n`** (new remote) |
| `name>` | **`seamgen-sales`** — the script looks for exactly this name |
| `Storage>` | **`drive`** (Google Drive) |
| `client_id>` | *leave blank* |
| `client_secret>` | *leave blank* |
| `scope>` | **`1`** (full access) |
| `service_account_file>` | *leave blank* |
| `Edit advanced config?` | **`n`** |
| `Use web browser to automatically authenticate?` | **`y`** — sign in with a Seamgen Google account that has access to the Sales shared drive |
| `Configure this as a Shared Drive (Team Drive)?` | **`y`** |
| *(shared drive list)* | pick **Sales** |
| `Keep this "seamgen-sales" remote?` | **`y`**, then `q` to quit |

Confirm it worked:

```powershell
rclone lsd seamgen-sales:"Favorable RFP's"
```

That should list the RFP folders.

## Using it

```powershell
# Preview - transfers nothing
.\tools\Sync-RfpToDrive.ps1 -Slug yonkers-connect-seniors-app -WhatIf

# One RFP
.\tools\Sync-RfpToDrive.ps1 -Slug yonkers-connect-seniors-app

# Several at once
.\tools\Sync-RfpToDrive.ps1 -Slug ladbs-ai-pre-plan-check, sw-wisconsin-college-website-cms
```

You give it a **slug**; it finds that RFP's folder itself, in whichever lifecycle tier the
RFP currently sits in, so it keeps working after a promotion. A `(79) ` score prefix on the
local folder is dropped for the Drive name.

## Things worth knowing

**It only ever copies. Never sync.** `rclone sync` makes a destination match its source *by
deleting everything else there* — aimed at the wrong path, it would empty a colleague's
folder on a shared drive that the whole company can see. `copy` only ever adds. The word
`sync` does not appear as a command anywhere in the script, and it must not be added.

**The destination folder must already exist.** The script won't create it. If a slug were
mistyped, auto-creating would silently produce a second folder that no manifest points at,
and nobody would notice until Peter clicked a link to an empty folder.

**`_document-manifest.md` never goes to Drive.** It's Seamgen's own tracking file. Only the
agency's documents belong in a folder leadership reads.

**It verifies rather than trusting the exit code.** After copying it counts the files at the
destination and compares. Mismatches are printed and the script exits non-zero.

**Your rclone login is a credential, and it does not live in this folder.** `rclone config`
writes an OAuth refresh token to `%APPDATA%\rclone\rclone.conf` — outside this folder, same
rule that keeps `HIGHERGOV_API_KEY` in an environment variable and portal
logins in Secret Server. Never run `rclone config show` into a file, a chat, or a deliverable.

**⚠ Known expiry — rclone's shared Google client ID is being retired "during 2026."** Every
run prints this notice. It is not an error and nothing is broken today, but the setup above
uses rclone's built-in Google application registration, and when Google retires it the remote
will stop authenticating. The fix is to create a free Google Cloud client ID and add it to the
remote — a one-time job, instructions at <https://rclone.org/drive/#making-your-own-client-id>.
Worth doing before it breaks rather than the morning a proposal is due. **Note this was
first seen July 2026 — the deadline may already be close.**

**Scope, honestly.** Configuring the remote against the Sales shared drive pins every path the
script uses inside that drive — but the underlying Google sign-in grants Drive-wide access.
Tighter scoping is possible (`scope = drive.file`, where rclone can only touch files it
created itself) at the cost of recreating the existing folders and updating the folder IDs
recorded in each RFP's manifest. Worth doing if this ever runs unattended.
