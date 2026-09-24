# Memory

## Seamgen

- Seamgen is an AI-forward design and development agency focused on mobile and web applications.
- Core messaging emphasizes human-centered design, AI agentic workflows, and digital transformation.
- They highlight experience with Fortune 500 companies and funded startups.
- Common service themes include iOS, Android, Xamarin/cross-platform work, IoT/beacon implementation, backend, and web development.
- Current people docs in Drive point to a delivery-heavy team mix: UX/accessibility leadership, technical leadership/architecture, backend development, front-end development, and full-stack engineering.
- Named people docs found so far include Hoda Zaker as UX Lead/accessibility specialist, Amy Brown as Technical Lead/Architect, Alec Prassinos as Back End Developer, Frank Garcia as Front End Developer, Seth Lutske as Full Stack Engineer / Technical Lead, and Chris Feller as Full-Stack Software Engineer.
- Some other resume-like files in Drive appear to be partner or proposal personnel and should not be treated as Seamgen staff without checking the document context.
- Their process style is hybrid agile, collaborative, and transparent.
- Verticals mentioned on the site include automotive, healthcare, and theme parks/resort hotels.
- Company location: `13500 Evening Creek Dr N Ste 110, San Diego, CA 92128, United States`.
- Website: `https://www.seamgen.com/`.
- Main HubSpot sales flows to prioritize: `Sale Pipeline` and `Government Sale Pipeline` for RFP work.
- Proposal mails should go directly to `mariannefaro@seamgen.com` and should not CC `sales@seamgen.com`.
- The two weekly jobs should be sent to `mariannefaro@seamgen.com` alongside `sam.saes@youtility.nl`.
- Weekly customer re-engagement scans should be limited to people already in HubSpot with more than a bare contact record, ideally tied to prior conversations or deals; ignore one-off email hits.
- Weekly customer re-engagement scans should also check the internet for worthwhile recent news on those HubSpot contacts to help restart conversations.
- For outreach registration, use the `Prospecting` flow under `Leads` in HubSpot (`ID: 2487349963`); its stages map to the outreach steps.
- In outreach logic, `Reminder` and `Closure` only apply when the customer has not replied yet; use the same `Introduction` / `Qualification` / `Reminder` / `Closure` definitions in the daily mail-HubSpot sync.
- The daily mail-HubSpot sync should include emails addressed to `sale@seamgen.com` in addition to emails where `sales@seamgen.com` is on CC.
- For non-RFP deals registration, use the `Sale Flow` under `Deals` in HubSpot (`ID: 2487085796`) and keep its stages aligned with the deal steps.
- Treat mail domains at `@itility` and `@youtility` as internal Seamgen mail, not as customer accounts, for sync and routing decisions.
- RFP-related mails should not be registered in the Lead or Sale Flow; keep the daily mail sync focused on non-RFP outreach/deals only.
- Daily mail-sync Telegram summaries should explicitly name which outreaches or deals were updated.
- Weekly re-engagement customer-facing draft emails should be written in English only.
- Weekly reengagement advice should use HubSpot contact activity as the source of truth for the last contact moment date, and lead blocks should use the gray card style from the weekly report mail.
- Weekly reengagement advice should base the trigger on the strongest available signal, and the report should state both the signal and why it justifies outreach.
- Weekly New Reengagement Outreach Advice app signals should include the actual app rating whenever a rating is available, not just a presence mention.
- Weekly New Reengagement Outreach Advice should show an `Open record` link next to `Last contact moment` whenever a contact ID is available.
- Weekly reengagement advice should always send a customer email, even when no new lead qualifies; in that case, use a short fallback update instead of skipping the send.
- Weekly reengagement advice may include existing lead follow-ups when the last outreach mail, last communication, or reply thread gives a clear follow-up trigger.
- For new leads in weekly reengagement advice, use creative outreach angles by learning from prior outreaches, comparing similar companies, and finding a believable reference-case bridge.
- For new leads in weekly reengagement advice, also use recent web news from the last 14 days and an outdated or stale company website as possible outreach triggers when they reveal a real business signal.
- Weekly reengagement advice currently emails `nurrea@seamgen.com` with `mariannefaro@seamgen.com` on CC and sends a Telegram group update to `-1003890997073` with a client-ready draft prompt based on the strongest signal per company.
- Weekly reengagement advice should open with the applied filter and the companies scanned so the reader immediately sees the review scope.
- Weekly reengagement advice should use the exact opening format `Filter applied: ...` and `Companies scanned: ...` on separate lines.
- Weekly reengagement advice should always include an explicit `Companies scanned: N` line in the summary.
- The reengagement outreach agent now runs in smaller batches with a lower default thinking level and a retry fallback so it is less likely to pin the VM.
- For pipelines, communications, and outreach context, treat `Brady`, `Brady+`, `Waxie`, `Imperial Dade`, `Imperial Brady`, `Envoy`, and `Envoy Solutions` as the same company family unless a record explicitly proves otherwise.
- Weekly current-year sales report should treat outbound or forwarded customer emails from internal mailboxes as valid mailbox communication when they have external recipients.
- Weekly current-year sales report should now be sent to `sales@seamgen.com` by default instead of `sam.saes@youtility.nl`.
- Weekly reengagement advice company selection should be based on active companies (`company_status = active`) with more than one recent and closed deal linked, active contacts (`contact_status = active`), no existing lead linked to the company or contact, and an inactive/completed linked Drive SOW rather than a still-running one.
- Daily mail-sync Telegram summaries should also include actual deal stage moves recorded from sales mails, not just lead snapshot noise.
- Daily mail-HubSpot sync should try to resolve company and contact person from mail headers/body before classifying a thread, and surface the resolved entities in the sync output for better CRM linking.
- When a sales or routing decision is genuinely unclear, ask in the Telegram group chat first instead of guessing.
- The daily mail-HubSpot sync now runs only as the OpenClaw agent cron job `Daily mail-HubSpot sync`; the old shell-cron launcher was removed to avoid duplicate daily runs.
- The daily mail-HubSpot sync should set `company_status` and `contact_status` to `active` only when recent real activity exists and `inactive` when the latest actual activity is older than 12 months; `createdate` and `hs_lastmodifieddate` should not count as activity because our own updates can refresh them. `notes_last_contacted` should be treated as the main contact indicator for both companies and contacts when deciding active vs inactive.
- Weekly Current Year Sales Report should show overdue follow-up timing as negative business days when the next outreach deadline has passed, using the lead's contact activity when available.
- Do not infer RFP from wording like "before the RFP stage"; deals can come from both RFP and non-RFP routes, so classify by the actual thread context.
- Weekly re-engagement jobs now use a hybrid setup: scripts keep filtering, lookups, and deterministic rules; a shared agent generates the outreach body for both old and recent customer flows. Split into separate agents only if the logic meaningfully diverges.
- Outreach management / recent customer re-engagement is now lead-driven as well as company-driven: existing open leads that are due for outreach by stage timing are included even if they were not part of the initial company filter.
- Outreach management should check the linked Drive SOW schedule before drafting; if the period of performance is still active, skip outreach because the project is still running.
- The old-customer flow should use the same Drive SOW schedule check as outreach management; active SOW periods mean the project is still running and should not get outreach.
- Gog Gmail access for Seamgen should use the `file` keyring backend with the stored `gog-keyring-password`; `auto` may show no tokens even when the file keyring is populated.
- Seamgen proposal docs consistently emphasize accessible, CMS-driven, public-sector work with `.NET Core`, `React`, `Azure`, Waterfall discipline, and realistic scope phasing instead of moon-shot features.
- Seamgen’s strongest proposal themes are accessibility (`WCAG`/`Section 508`), legacy-system integration, multilingual support, admin/workflow tooling, and honest scope/risk framing.
- Use the Seamgen Sales Proposition Playbook for future proposal work: lead with accessibility, CMS modernization, `.NET Core`/`React`/`Azure`, phased scope control, and proof points over feature bloat.
- For future RFP triage, treat Seamgen as a custom software company, not a ready-product vendor; `SSO` and API work are usually manageable, and AI-heavy delivery is part of the normal stack rather than a blocker.
- For future RFPs, focus go/no-go on whether the requirement is truly product-fit, especially hard `no-code`/self-service language and any expectation of an existing platform.
- The recent customer re-engagement proposal should only use `closedate` and only include deals marked as won (`hs_is_closed_won=true`).
- In the recent customer re-engagement proposal, HubSpot conversations and mail should also inform the proposal content and angle, not just the contact selection and follow-up step.
- In the recent customer re-engagement proposal, sector and market developments should be researched per company and can shape how Seamgen website/app services are framed in the proposal.
- When the user asks a question or requests a change, reply visibly in chat right away instead of only sending confirmation notes.

## Comic-Con

- Marianne wants Comic-Con outreach framed as a reconnect, not a press story pitch, because Seamgen previously built their app.
