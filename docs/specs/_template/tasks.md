# ISA task checklist

- [ ] Check branch/worktree, integration target, and whether the work already exists; preserve existing changes.
- [ ] Inspect the affected script, ISA skill, domain doc, and VM boundary.
- [ ] Implement the scoped source change without adding customer data or credentials.
- [ ] Add/update fixture tests and focused comments for non-obvious gates, identifiers, retries, or side effects.
- [ ] Update the owning domain/workflow doc and note any live config or scheduler work left out of Git.
- [ ] Run `npm test`, `npm run check`, and review the diff and secret scan.
- [ ] For an authorized live release only: compare fresh VM source, preview exact upload, coordinate one deployer, verify behavior, and record rollback path.
