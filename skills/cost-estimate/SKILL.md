---
name: cost-estimate
description: Use InfraLens CLI graphs and cached traces to estimate application workflow usage for cost-assumptions.json, including Before/After comparisons across a Git diff.
---

# Cost assumptions for InfraLens

Write `cost-assumptions.json` at the repository root or at the requested path. Use [the workload JSON format](references/assumptions.md). Work from local code, IaC, tests, documentation, fixtures, and telemetry the user already provides. The output contains business workflows, resource bindings, usage quantities, and evidence. InfraLens resolves billing from the infrastructure and AWS Price List. During the skill, never call AWS, access pricing pages or APIs, request AWS credentials, run cloud lookups, or write prices, SKUs, catalog selectors, billing modes, regions, or resource sizing copied from IaC into the model.

## Prepare infrastructure and cached evidence

1. Identify the requested IaC project and stack. Select trusted local IaC snapshots for each side. Use [the CLI and cache workflow](references/context.md) to run `prepare` before reading application code. InfraLens supplies normalized resource IDs, relationships and evidence, coverage, and changed resource candidates. Use `query` to inspect relevant resources. Read raw IaC or application configuration for material properties missing from the graph, such as an S3 notification prefix. If a matching graph is unavailable, trace from the Git diff and available code/IaC, and record the coverage gap.
2. Start with the requested diff and the plan's `changedPaths`, `changedResourceIds` and `review`. Inspect changed entry points and their connected code, including new routes or triggers absent from the cache. Carry forward reusable states as-is unless changes affect their behavior, bindings, assumptions or evidence. On a cold current-state run, inventory entry points in the requested scope. On a cold diff run, start at the diff and follow only affected paths on each side.
3. Name workflows after the business action and trace through async completion, including meaningful client handoffs. Bind steps by exact graph resource ID when available. Use the same ID when a workflow revisits a resource. Trace links from trigger bindings or code and cite the evidence. Deployment dependencies and permission grants alone do not establish runtime calls. Preserve unresolved bindings as issues.
4. Derive per-run counts from code. Include branches, fan-out, retries, cache behavior and re-triggering when material. Use total billed Lambda milliseconds across invocations, DynamoDB units reflecting size and consistency, and separate S3 GET/Range and PUT/multipart counts. Use measured or scenario payload sizes for transfers, and use average retained bytes in shared monthly usage. Record unsupported dimensions with `unpriced`.

## Set and explain assumptions

- Prefer user-provided values, measurements and explicit product constraints for frequency, billed duration, payload size and traffic mix. Calculate `runsPerUser` as average monthly executions across all active users, including users who never take that action. Record its basis in `frequencyEvidence`. Use zero only when supported by evidence.
- Batch missing inputs that materially affect the estimate into one interactive question round. Use the client's interactive question tool when available (in Codex, `request_user_input` or `request_user_input_async`). Put a grounded recommendation first and label it `(Recommended)`. When there is no basis for a numeric recommendation, recommend leaving the value unknown. Offer a custom value through the tool's free-text input when available. Wait for an explicit answer before using a value. A displayed default is a suggestion until submitted.
- While a question is pending, finish only work that can proceed without the answer. If there is no interactive tool, end the current turn with a normal chat message containing numbered choices and a clear invitation to reply with the choice or a custom value. Resume from the reply before writing the final assumptions. If the user chooses to proceed with unknowns, use `null` and list the gaps in `issues`.
- Use labeled factors for calculations such as requests per batch × batches per run. Cite exact file paths and lines or local measurements for the material quantities. Record inference and uncertainty without including credentials, customer data or raw logs.

## Handle snapshots and validate

- The default analyzes the working tree, including relevant untracked files, and writes After. For `--diff [BASE [TARGET]]`, default BASE to HEAD and TARGET to the working tree. Use separate plans for Before and After. Resolve committed refs to SHA and use `git show` without switching branches. Label a dirty target as a working tree based on its HEAD SHA. Reuse workflow IDs. Write a null state only if confirmed absent. Omit an uninvestigated state.
- Validate the output's JSON, bindings, links, units, frequency evidence and async coverage. Record all source files used for each traced state and run `save` for each prepared side after writing assumptions. Summarize material usage and unresolved assumptions and supply the matching InfraLens command with `--costs --cost-assumptions <file>`. Run catalog pricing as a separate InfraLens step.
