# ISA task spec: Tuesday RFP document check

## Problem and evidence

The refresh skill (v1.8) was written for Jake's Windows laptop. Every step depended on things ISA on the VM doesn't have:
- a Chrome browser bridge, with someone signed in to HigherGov;
- a fix for the Windows file picker;
- `Sync-RfpToDrive.ps1` for Drive;
- `reference-team-and-signature.md`;
- a calendar "sync-block ledger" the calendar skill dropped in v1.1.

ISA's `AGENTS.md` also said it "cannot upload to the shared Google Drive". Yet the Friday job uploads every Strong Pursue's documents to Favorable RFP's with `gog` as `isa@seamgen.com`. So once someone started working on an RFP, nothing noticed an addendum or a moved deadline, and the Drive folder leadership reads went out of date.

A read-only HigherGov check of 15 saved RFPs on November 17, 2026 found:
- an amendment is a new version of the opportunity, with the same `opp_key`. One RFP's November 3 version moved its due date from November 2 to November 30 with no new file;
- both versions shared one `document_path`;
- document records carry `file_name`, `file_type`, `file_size`, `posted_date`, `text_extract`, `summary` and `download_url`, and no ID.

## Decisions (sales team, November 17)

- Check every **Tuesday** at 15:00 UTC, for the RFPs in Looking closer and Building. **No new documents or updates, no Telegram message.**
- **Keep the failure notice, but try again first.**
- **A new HigherGov version of an RFP already in Looking closer, Building or Submitted isn't rescored on Friday.** It is listed once as "already being worked on".
- **Close the gap for forwarded RFPs.** One moved with no HigherGov key is recognized by agency and solicitation number (or title and agency) when its listing reaches the Friday run, and its keys are kept.
- **Upload to Drive right after a refresh**, and link the Drive folder in the message.
- **Drive stays one flat folder per RFP.** Moving an RFP between tiers doesn't move or create Drive folders.
- **Only agency documents go to Drive**, on Fridays too: never the `_document-manifest` files.

## Desired behavior and acceptance

- [x] `rfp-refresh.mjs --scheduled` reads each RFP's newest HigherGov version and compares the due date and the documents (name and size) with what was last seen.
- [x] New and re-issued files are saved without overwriting anything. Re-issued ones are saved as `…-updated-<date>`. The manifest lists them.
- [x] New files are uploaded straight to the RFP's Drive folder, agency documents only, never replacing or deleting. The folder ID is taken from a Friday report or found or made by name, then kept in `_refresh.json`.
- [x] One code-built Telegram message when something changed: due date moves, new and re-issued names, and the Drive link. Nothing when nothing changed. An undownloadable file is reported once. RFPs that couldn't be checked are listed only when a message goes out.
- [x] `rfp-refresh.mjs <slug>` checks one RFP on request with no Telegram post, and `--drive` uploads what Drive lacks.
- [x] A failed run (an unsent message included) is tried once more after 10 minutes, and only then does the cron wrapper post one failure notice. A change recorded but not yet announced is announced by the retry, once, and failed Drive uploads are retried.
- [x] `RFP_REFRESH_DELIVERY=preview` is a dry run that records nothing.
- [x] The Friday upload skips `_`-prefixed files.
- [x] The Friday job matches a listing's `opp_key` against the RFPs in tiers 2–4. A match isn't scored, downloaded, picked, emailed or posted; it goes into the results file's `inProgress` list, a report section, and the audit as `in-progress`.
- [x] `rfp-stage.mjs` records `--agency` and `--number`, with or without a move, and a move of an RFP with no HigherGov key says to add them. The Friday run matches key-less RFPs by distinctive solicitation number plus agency, or title plus agency, then treats the listing as in progress and saves its keys in `_refresh.json`. The Tuesday check then follows it, downloading only what the folder lacks.
- [x] The refresh skill (v2.0), the fetch skill's Drive step (v1.13) and `AGENTS.md` describe the VM procedure. Portals are a person's check, with the same purchase gate.

## Out of scope

- Installing the crontab line (`0 15 * * 2` UTC). That is a scheduler change for the release.
- Reading agency postings anonymously (`RFP_POSTING_FETCH_ENABLED` is 0 live) or signing in to portals.
- Reading the new documents' contents in the scheduled run. ISA reads them in chat when asked, per the skill.
- Making the Friday job use the kept Drive folder ID.

## Constraints and risks

- **Drive is shared.** Uploads add files only. A file whose name is already in the folder is skipped, which is why re-issued files get a dated name.
- **Name and size are the only match.** A re-issued file of exactly the same size is missed. HigherGov gives nothing better.
- **A returning listing is matched by `opp_key`, or for a forwarded RFP by agency plus solicitation number or title.** HigherGov's API has no keyword or solicitation-number search (`source_id` is the posting site's internal ID), so matching happens when the listing reaches the Friday run. A forwarded RFP with no recorded agency can only match on nothing, and the move says so. A wrong title match would hide a listing as "already being worked on"; it needs the same agency, and the report names the listing it matched.
- **HigherGov quota:** one opportunity call and one document-list call per RFP per week, plus downloads of new files only.
- **Rollback:** remove the crontab line. The scripts can stay; nothing runs them unless asked.

## References

- `workspace/scripts/rfp-refresh.mjs`, `run-rfp-refresh-cron.sh`, `highergov-document-flow.mjs` (`listOpportunityVersions`), `weekly-rfp-pursue-decision.mjs` (Drive helpers)
- `devtools/rfp-refresh.test.mjs`, `devtools/rfp-cron-wrapper.test.mjs`
- [RFP workflow](../../domains/rfp/README.md), "Tuesday document check"; [data models](../../data-models.md); [live jobs](../../live-jobs.md)
