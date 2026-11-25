package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"infralens/internal/cost"
	"infralens/internal/graph"
)

func TestRenderCostFlagAndPreservedOutput(t *testing.T) {
	dir := t.TempDir()
	output := filepath.Join(dir, "report.html")
	costOutput := filepath.Join(dir, "costs-report.json")
	g := graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{{ID: "one", Name: "example", Type: "AWS::IAM::Role"}}}
	read := func([]string, func(string) (io.Reader, error)) (graph.Graph, error) { return g, nil }
	pricedReads := 0
	var logs bytes.Buffer
	c := New(&logs, &logs, map[string]Provider{
		"test": {ReadInputs: read, ReadCostInputs: func(_ []string, _ func(string) (io.Reader, error), inventory *cost.Inventory) (graph.Graph, error) {
			pricedReads++
			inventory.After = []cost.Resource{{ID: "one", Name: "example", Type: "AWS::IAM::Role", Service: "iam"}}
			return g, nil
		}},
	})
	args := []string{"render", "--provider=test", "--input", "unused", "--output", output}
	for _, enabled := range []bool{false, true} {
		flags := args
		if enabled {
			flags = append(flags, "--costs", "--cost-region", "eu-west-1", "--cost-output", costOutput)
		}
		if c.Run(flags) != 0 {
			t.Fatal(logs.String())
		}
		body, err := os.ReadFile(output)
		if err != nil {
			t.Fatal(err)
		}
		marker := []byte(`<script id="infralens-costs" type="application/json">`)
		if bytes.Contains(body, marker) != enabled {
			t.Fatalf("incorrect cost payload presence for --costs=%v", enabled)
		}
		if enabled && !bytes.Contains(body, []byte(`"fallback":"eu-west-1"`)) {
			t.Fatal("missing partial estimate")
		}
		if enabled {
			_, embedded, _ := bytes.Cut(body, marker)
			embedded, _, _ = bytes.Cut(embedded, []byte("</script>"))
			saved, err := os.ReadFile(costOutput)
			var compact bytes.Buffer
			if err != nil || json.Compact(&compact, saved) != nil || !bytes.Equal(compact.Bytes(), embedded) {
				t.Fatalf("the HTML and cost JSON differ: %v", err)
			}
		}
	}
	if pricedReads != 1 {
		t.Fatalf("resource collection ran %d times, want 1", pricedReads)
	}
	if c.Run(append(args, "--costs", "--cost-output", costOutput)) != 0 {
		t.Fatal("could not replace prior InfraLens cost report:", logs.String())
	}
	rules := filepath.Join(dir, "costs.json")
	data := []byte(`{"AWS::IAM::Role":{"monthly":[{"serviceCode":"AWSExample","sku":"SKU","unit":"Hrs","quantity":1,"quantityFrom":"Missing"}]}}`)
	if err := os.WriteFile(rules, data, 0600); err != nil {
		t.Fatal(err)
	}
	if c.Run(append(args, "--costs", "--cost-rules", rules)) != 0 {
		t.Fatal(logs.String())
	}
	if report, err := os.ReadFile(output); err != nil || !bytes.Contains(report, []byte("A cost rule quantity property is unresolved.")) {
		t.Fatalf("cost rules were not applied, read error: %v", err)
	}
	if c.Run([]string{"render", "--provider=test", "--input", "unused", "--output", rules, "--costs", "--cost-rules", rules}) == 0 {
		t.Fatal("accepted the rules file as the output")
	}
	if body, err := os.ReadFile(rules); err != nil || !bytes.Equal(body, data) {
		t.Fatalf("modified rules input, read error: %v", err)
	}
	assumptions := filepath.Join(dir, "assumptions.json")
	data = []byte(`{"version":1,"scenario":"One request","resources":[{"id":"one","after":{"operations":0}}]}`)
	if err := os.WriteFile(assumptions, data, 0600); err != nil {
		t.Fatal(err)
	}
	if c.Run(append(args, "--cost-output", costOutput)) == 0 ||
		c.Run(append(args, "--costs", "--cost-output", assumptions, "--cost-assumptions", assumptions)) == 0 ||
		c.Run(append(args, "--costs", "--cost-output", costOutput, "--graph-output", costOutput)) == 0 {
		t.Fatal("accepted cost output without pricing or with a conflicting path")
	}
	if c.Run(append(args, "--costs", "--cost-assumptions", assumptions)) != 0 {
		t.Fatal(logs.String())
	}
	if report, err := os.ReadFile(output); err != nil ||
		!bytes.Contains(report, []byte(`"assumptions":{"operations":0}`)) ||
		!bytes.Contains(report, []byte(`"usageAssumptions":{"scenario":"One request"`)) {
		t.Fatalf("cost assumptions were not embedded, read error: %v", err)
	}
	before, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	g.Edges = []graph.Edge{{From: "one", To: "missing", Kind: graph.DependsOn, Evidence: []graph.Evidence{{Source: "test"}}}}
	for _, command := range []string{"render", "graph"} {
		args[0] = command
		if code := c.Run(args); code == 0 {
			t.Fatalf("%s accepted an invalid graph", command)
		}
		after, err := os.ReadFile(output)
		if err != nil || !bytes.Equal(after, before) {
			t.Fatalf("%s replaced existing report, read error: %v", command, err)
		}
	}
}
