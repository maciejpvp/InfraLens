# InfraLens agent instructions

## Adding an IaC adapter

When adding the next IaC adapter, validate the graph with `g.Validate()` in the JSON output path in `internal/app/output.go` before writing or replacing the report. The HTML renderer already validates graphs. Add a regression test with an adapter that returns a dangling edge. Both output formats should reject the invalid graph and preserve any existing reports.
