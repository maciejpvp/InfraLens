---
name: infra-report
description: Generate and link a local InfraLens HTML report after changing Pulumi or AWS CDK infrastructure. Use when asked to show or verify the infrastructure effect of an edit, or when completing an IaC change in a project using InfraLens.
---

# InfraLens report after an infrastructure change

1. After finishing the IaC edits, identify the affected project and provider from `Pulumi.yaml`, `Pulumi.yml`, or `cdk.json`. Use the project and stack in the task context. If the target is ambiguous, establish it before running a preview.
2. Create a fresh local output directory with `mktemp -d`. Keep the report files out of commits.
3. From the project directory, run the installed CLI with the corresponding provider and absolute output paths:

   ```sh
   InfraLens preview --provider=pulumi --no-open \
     --output "$report_dir/report.html" --graph-output "$report_dir/graph.json"
   ```

   Use `--provider=aws-cdk` for CDK. Preview runs the IaC project code and uses its configured access. The Pulumi baseline is the saved stack state. The CDK baseline is the deployed template, with replacement estimates based on template comparison. Use the task's permissions for any preview execution. A report requires no deployment.
4. If the task already has an up-to-date Pulumi JSON preview, use `InfraLens render --provider=pulumi --input FILE --output "$report_dir/report.html" --graph-output "$report_dir/graph.json"`. For a current stack export or synthesized CDK template, use the matching provider and label the result a snapshot. If preview fails and there is no current input, report the failure.
5. Check the newly written HTML and link to its absolute path in the final response. Name the comparison baseline or label the snapshot. Use `InfraLens query --input "$report_dir/graph.json" --summary` for counts, `--changed` to list planned changes, and `--name` or `--id` to inspect evidence. Summarize up to three material findings. If a JSON output failed, link the HTML if it was saved and report the failed output. Never substitute a report from another run.

For CDK replacement checks, use `--change replace`. A resource with `mayReplace: true` is a possible replacement. Count it separately from resources with `change: "replace"`.

For a task that explicitly asks for costs, use `--costs --cost-output "$report_dir/costs.json"` and pass `--cost-assumptions` when the task supplies such a file. Use the cost JSON to report assumptions, coverage, and missing data.
