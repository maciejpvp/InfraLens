package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"infralens/internal/app"
	"infralens/internal/cost"
	"infralens/internal/graph"
)

func TestRenderCostFlagAndPreservedOutput(t *testing.T) {
	dir := t.TempDir()
	output := filepath.Join(dir, "report.html")
	costOutput := filepath.Join(dir, "costs-report.json")
	g := graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{{ID: "one", Name: "example", Type: "AWS::IAM::Role"}}}
	pricedReads := 0
	var logs bytes.Buffer
	c := newTestCLI(&logs, &logs, map[string]app.Provider{
		"test": {Adapter: stubAdapter{readInputs: func(_ []string, _ func(string) (io.Reader, error), inventory *cost.Inventory) (graph.Graph, error) {
			if inventory != nil {
				pricedReads++
				inventory.After = []cost.Resource{{ID: "one", Name: "example", Type: "AWS::IAM::Role", Service: "iam"}}
			}
			return g, nil
		}}},
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

func TestPreviewCosts(t *testing.T) {
	dir := t.TempDir()
	output := filepath.Join(dir, "preview.html")
	graphOutput := filepath.Join(dir, "graph.json")
	costOutput := filepath.Join(dir, "costs.json")
	var logs bytes.Buffer
	c := newTestCLI(&logs, &logs, map[string]app.Provider{"test": {Adapter: stubAdapter{
		preview: func(_ context.Context, onStart func(), inventory *cost.Inventory) (graph.Graph, error) {
			if inventory == nil {
				t.Fatal("preview did not request a cost inventory")
			}
			onStart()
			inventory.After = []cost.Resource{{ID: "one", Name: "example", Type: "AWS::IAM::Role", Service: "iam"}}
			return graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{
				{ID: "one", Name: "example", Type: "AWS::IAM::Role", Change: graph.Create},
			}}, nil
		},
	}}})

	if c.Run([]string{"preview", "--provider=test", "--no-open", "--costs", "--cost-region", "eu-west-1", "--output", output, "--graph-output", graphOutput, "--cost-output", costOutput}) != 0 {
		t.Fatal(logs.String())
	}
	html, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	for _, sidecar := range []struct {
		path, element string
	}{
		{graphOutput, "infralens-data"},
		{costOutput, "infralens-costs"},
	} {
		marker := []byte(`<script id="` + sidecar.element + `" type="application/json">`)
		_, payload, found := bytes.Cut(html, marker)
		embedded, _, closed := bytes.Cut(payload, []byte("</script>"))
		if !found || !closed {
			t.Fatalf("missing embedded %s data", sidecar.element)
		}
		saved, err := os.ReadFile(sidecar.path)
		if err != nil {
			t.Fatal(err)
		}
		var compact bytes.Buffer
		if err := json.Compact(&compact, saved); err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(compact.Bytes(), embedded) {
			t.Fatalf("%s differs from HTML", sidecar.path)
		}
	}
	if !bytes.Contains(html, []byte(`"previewProvider":"test"`)) || !bytes.Contains(html, []byte(`"fallback":"eu-west-1"`)) {
		t.Fatal("missing provider metadata or priced inventory")
	}
}
