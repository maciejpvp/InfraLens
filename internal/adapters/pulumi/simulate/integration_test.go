//go:build integration

package simulate

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"laytrace/internal/graph"
)

func TestStackReferenceWithPulumiSDK(t *testing.T) {
	module := filepath.Join("testdata", "stack-reference")
	g, err := Run(context.Background(), []Project{
		{Stack: "org/base/dev", Directory: filepath.Join(module, "base")},
		{Stack: "org/consumer/dev", Directory: filepath.Join(module, "consumer")},
	}, filepath.Join(t.TempDir(), "result.html"))
	if err != nil {
		t.Fatal(err)
	}
	var base, stackReference, consumer string
	for _, node := range g.Nodes {
		switch {
		case node.Stack == "base/dev" && node.Type == "pulumi:pulumi:Stack":
			base = node.ID
		case node.Stack == "consumer/dev" && node.Type == "pulumi:pulumi:StackReference":
			stackReference = node.ID
		case node.Stack == "consumer/dev" && node.Type == "test:index:Consumer" && node.Name == "confirmed":
			consumer = node.ID
		}
	}
	if !g.Simulated || base == "" || stackReference == "" || consumer == "" {
		t.Fatalf("missing simulated resources: %+v", g.Nodes)
	}
	if !slices.ContainsFunc(g.Edges, func(edge graph.Edge) bool {
		return edge.From == stackReference && edge.To == base && edge.Kind == graph.DependsOn &&
			slices.ContainsFunc(edge.Evidence, func(e graph.Evidence) bool { return e.Source == "stackReference" })
	}) {
		t.Fatalf("missing StackReference edge: %+v", g.Edges)
	}
}
