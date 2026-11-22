package graph

import "testing"

func TestValidateTopology(t *testing.T) {
	base := func(kind Kind) Graph {
		return Graph{SchemaVersion: 1, Nodes: []Node{{ID: "a", Name: "a", Type: "test"}, {ID: "b", Name: "b", Type: "test"}}, Edges: []Edge{{From: "a", To: "b", Kind: kind, Evidence: []Evidence{{Source: "test"}}}, {From: "b", To: "a", Kind: kind, Evidence: []Evidence{{Source: "test"}}}}}
	}
	if err := base(DependsOn).Validate(); err != nil {
		t.Fatal("dependency cycles should be allowed", err)
	}
	if err := base(Contains).Validate(); err == nil {
		t.Fatal("accepted cyclic hierarchy")
	}
	g := base(DependsOn)
	g.Edges[0].To = "missing"
	if g.Validate() == nil {
		t.Fatal("accepted dangling edge")
	}
	g = base(DependsOn)
	g.Nodes[0].Change = "unknown"
	if g.Validate() == nil {
		t.Fatal("accepted unknown change")
	}
	g = base(Contains)
	g.Edges[0].State = "before"
	g.Edges[1].State = "after"
	if err := g.Validate(); err != nil {
		t.Fatal("combined before/after topology incorrectly treated as cycle", err)
	}
}

func TestDescriptionNormalization(t *testing.T) {
	g := Graph{Edges: []Edge{{Evidence: []Evidence{{Source: "aws_rule", Label: "POST /x", Details: "b"}, {Source: "aws_rule", Label: "GET /x", Details: "b"}, {Source: "aws_rule", Label: "GET /x", Details: "a"}}}}}
	g.Normalize()
	if g.Edges[0].Evidence[0].Label != "GET /x" || g.Edges[0].Evidence[0].Details != "a" || g.Edges[0].Evidence[2].Label != "POST /x" {
		t.Fatal("unstable description order")
	}
}
