## Using Laytrace

Use Laytrace to inspect this project's infrastructure, review planned IaC changes, and estimate AWS costs when requested. Run commands from the affected IaC project directory. If the CLI is unavailable, report that briefly and continue the rest of the task where possible.

### Choose the command

| Task | Command | Input |
| --- | --- | --- |
| Review planned changes in HTML | `Laytrace preview --provider NAME --no-open --output report.html --graph-output graph.json` | A configured IaC project |
| Generate HTML from existing data | `Laytrace render --provider NAME --input FILE --output report.html --graph-output graph.json` | A current export, template, or supported saved preview |
| Export a graph | `Laytrace graph --provider NAME --input FILE --output graph.json` | The same saved inputs as `render` |
| Summarize a change or inspect a resource | `Laytrace query --input graph.json --summary` or `Laytrace query --input graph.json --name RESOURCE` | Laytrace graph JSON |

Use `--provider pulumi` for a project with `Pulumi.yaml` or `Pulumi.yml` and `--provider aws-cdk` for a project with `cdk.json`. Identify the intended project and stack before running a preview. Pulumi compares against the active stack's saved state. CDK compares against the deployed CloudFormation template and estimates replacements from the template diff. Preview executes project code and can require configured provider access. It performs no deployment.

For file-based input, Pulumi accepts stack exports and a single JSON preview document with `steps`. CDK accepts synthesized CloudFormation templates in JSON. Call `render` and `graph` directly on trustworthy, current artifacts when preview is unavailable. Describe an export or synthesized template as a snapshot. A saved Pulumi preview can still show planned changes.

### Report the effect of a change

1. After editing IaC, use the `infra-report` skill if installed or follow these steps directly. Create a fresh output directory and pass paths in that directory to `--output` and `--graph-output`.
2. Run the relevant command above. Use `--graph-output` to save HTML and its normalized graph from the same run. HTML works offline after generation.
3. Start with `query --summary`, then use `--changed` or `--change replace` and `--change delete` to find material changes. Summarize up to three with resource names and the comparison baseline. Treat replacements and deletions as planned operations. Distinguish triggers, configuration references, and deployment dependencies. Report missing topology as a coverage limit.
4. Link to the saved HTML using its absolute path. If a requested JSON output failed, link the HTML if it was saved and report the failed output. If no current report exists, report the blocker. Keep local artifacts out of commits unless the user asks to include them.

### Query a graph

Call the CLI directly. Each invocation reads a saved Laytrace graph of up to 32 MiB, prints matching results as JSON, and exits.

```sh
Laytrace query --input graph.json --summary
Laytrace query --input graph.json --changed --limit 5
Laytrace query --input graph.json --search uploads
Laytrace query --input graph.json --name UploadsQueue
```

The summary includes counts by change status. `unclassified` means the resource has no change status in the input. Use `--search` for case-insensitive text in names, types, stacks, or services, and `--stack` or `--type` to narrow results. Use the result's `nextOffset` with `--offset` for the next page.

`--change replace` includes possible CDK replacements. Report resources with `mayReplace: true` as possible replacements. They remain updates in `changeCounts` and appear separately in `possibleReplacements`.

A single match includes direct relationships, their direction, and evidence. Use `--id` for a specific match, then follow the relevant `from` or `to` IDs to inspect the next hop. Set `--relation-offset` to the result's `nextRelationOffset` to read more edges for that resource. Check `coverage` and `omittedRelations` before drawing conclusions. CDK preview relationships describe the target template and cover only the after state.

### Estimate costs when requested

Use `--costs` with `preview` or `render` for AWS catalog pricing. When workload depends on application behavior, use the `cost-estimate` skill if installed to produce `cost-assumptions.json`, or use assumptions supplied by the user. Cite code or measurements for usage quantities and record unknowns. Pass the file to Laytrace so it can resolve resources and prices.

```sh
Laytrace preview --provider=pulumi --no-open --costs \
  --cost-assumptions cost-assumptions.json --output report.html \
  --graph-output graph.json --cost-output costs.json
```

Use `--cost-output` with `--costs` to inspect the same rates, modeled quantities, workflow assumptions, and missing cost dimensions as the HTML. The HTML calculates interactive scenario totals. For a cost comparison, distinguish usage assumptions and Git revisions from the infrastructure preview baseline. State whether totals are partial and which important charges remain unresolved.
