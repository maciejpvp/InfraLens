# Laytrace CLI and trace cache

Run from the target Git repository. The helper needs Python 3.9+ and a Laytrace CLI with `graph` and `query`. Use a current executable via `--cli` if the installed one lacks those commands. Select an existing local Pulumi export or synthesized CDK JSON template for the requested code state. Repeat `--input` for multiple stacks, using `STACK=FILE` when stack identity matters. You may pass `--graph FILE` instead when a normalized graph already exists. Confirm how each artifact was produced. The helper validates graph structure and coverage with Laytrace. Artifact provenance is supplied by the caller. A deployed preview may use a different baseline than the Git diff, so prepare each side with its own local snapshot. Keep artifacts in an ignored directory or outside the worktree.

```sh
python3 /path/to/cost-estimate/scripts/context.py prepare \
  --scope project/uploads --side after \
  --provider aws-cdk --input Uploads=/path/to/after.template.json > /tmp/uploads-plan.json
```

For Before pass `--side before --ref BASE` and the matching artifact. For a committed After also pass `--ref TARGET`. Keep UI/report output and provider operations separate. This helper runs local `graph` and `query` commands.

## Read the plan

- Use `git diff --name-status --no-renames BASE TARGET --` for a committed comparison. For a working-tree target omit TARGET and add paths from `git ls-files --others --exclude-standard`. Resolve both committed refs before relying on the file list. Start with entries and bindings affected by those paths.
- `summary` contains CLI coverage and change counts. `graph` is the normalized graph path. Use `Laytrace query --input GRAPH --search TEXT` to find candidate resources and `Laytrace query --input GRAPH --id ID` to inspect a binding and its direct relationships. Follow `nextOffset` or `nextRelationOffset` when relevant. Distinguish `triggers` and configuration references from `depends_on`. Check the cited code or IaC for properties the CLI does not expose.
- `changedPaths` compares the current Git snapshot with the last stored trace in the same scope and side, including changes to previously dirty or untracked files. A null list means no usable prior snapshot. In diff mode also inspect the user's BASE→TARGET changed paths. `changedResourceIds` lists changed resource fingerprints, including incident edges and neighboring identities. On a cold run it contains the available resources. Treat those IDs as candidates, not as proof of a workflow change.
- `reusable` contains exact cached workflow states. `review` identifies states with changed source files or graph evidence. Check new or changed entry points even when every old state is reusable. When `inputsChanged` is true, check whether the changed raw IaC affects any properties the graph misses. If an analysis used generated IaC to establish such a property, record that artifact as a dependency if it is a repository file, or recheck the relevant bindings when it changes. For a caller-supplied graph, verify any underlying IaC change separately.
- Keep scope stable for the same project, stacks, and workflow set. Revisit a cached state when the user updates an assumption, telemetry or scope. Cache entries describe workflow states. Review shared monthly assumptions against the applicable inputs as part of the final model.

## Save validated traces

Create a JSON object mapping each newly analyzed workflow ID to its repository-relative source paths for that side. Include every material dependency used in the analysis, such as routing, configuration, lockfiles, shared client code, IaC properties, test fixtures and measurements. Use actual source files for symlinked paths. Write the trace manifest and plan outside the worktree or in an ignored directory. Untouched reusable states can use an empty manifest entry or omit it.

```json
{"upload-photo":["app/upload.ts","workers/resize.ts","infra/uploads.ts"]}
```

```sh
python3 /path/to/cost-estimate/scripts/context.py save \
  --scope project/uploads --side after \
  --provider aws-cdk --input Uploads=/path/to/after.template.json \
  --plan /tmp/uploads-plan.json --traces /tmp/uploads-traces.json
```

Run `save` with the same infrastructure and snapshot arguments as `prepare`. Both commands accept `--assumptions FILE` for a custom output path. By default the assumptions file is at the repository root. Use exact graph IDs for cached bindings. Missing states, explicit absence, and unresolved resource bindings require fresh review. The helper reuses converted graphs by exact input and CLI fingerprints, and reuses workflow states by recorded source and graph fingerprints. It stores data under `.cache/laytrace/cost-estimate/`. Keep that directory local and omit secrets, raw logs and customer data from assumptions and traces.
