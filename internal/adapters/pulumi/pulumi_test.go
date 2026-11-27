package pulumi

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"laytrace/internal/graph"
)

func TestFixtures(t *testing.T) {
	for _, name := range []string{"export", "preview"} {
		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile("../../../testdata/pulumi/" + name + ".json")
			if err != nil {
				t.Fatal(err)
			}
			g, err := Read(strings.NewReader(string(data)))
			if err != nil {
				t.Fatal(err)
			}
			if len(g.Nodes) != 2 || len(g.Edges) != 1 {
				t.Fatalf("unexpected graph: %+v", g)
			}
			for _, node := range g.Nodes {
				if node.Name == "worker" && node.Service != "lambda" {
					t.Fatalf("worker service = %q, want lambda", node.Service)
				}
			}
			if name == "export" && len(g.Edges[0].Evidence) != 2 {
				t.Fatal("lost property evidence")
			}
			if name == "preview" {
				found := false
				for _, n := range g.Nodes {
					if n.Name == "worker" {
						found = n.Change == graph.Create
					}
				}
				if !found || g.Edges[0].State != "after" {
					t.Fatal("lost preview operation/topology")
				}
			}
			out, _ := json.Marshal(g)
			if strings.Contains(string(out), "CANARY_SECRET") || strings.Contains(string(out), "urn:pulumi:") {
				t.Fatal("raw data escaped adapter")
			}
			again, err := Read(strings.NewReader(string(data)))
			if err != nil {
				t.Fatal(err)
			}
			second, _ := json.Marshal(again)
			if string(out) != string(second) {
				t.Fatal("nondeterministic graph")
			}
		})
	}
}

func TestPreviewChangesAndOldTopology(t *testing.T) {
	for _, op := range []string{"same", "create", "update", "delete", "replace"} {
		t.Run(op, func(t *testing.T) {
			old := &resource{URN: "urn:pulumi:dev::test::aws:test:Resource::item", Type: "aws:test:Resource", Dependencies: []string{"urn:pulumi:dev::test::aws:test:Resource::old"}}
			newState := &resource{URN: old.URN, Type: old.Type, Dependencies: []string{"urn:pulumi:dev::test::aws:test:Resource::new"}}
			s := step{URN: old.URN, Op: op, Old: old, New: newState}
			if op == "create" {
				s.Old = nil
			}
			if op == "delete" {
				s.New = nil
			}
			steps := []step{s}
			for _, name := range []string{"old", "new"} {
				r := &resource{URN: "urn:pulumi:dev::test::aws:test:Resource::" + name, Type: old.Type}
				steps = append(steps, step{URN: r.URN, Op: "same", Old: r, New: r})
			}
			data, _ := json.Marshal(map[string]any{"steps": steps})
			g, err := Read(strings.NewReader(string(data)))
			if err != nil {
				t.Fatal(err)
			}
			want := op
			if op == "same" {
				want = "unchanged"
			}
			for _, n := range g.Nodes {
				if n.Name == "item" && string(n.Change) != want {
					t.Fatalf("change = %s", n.Change)
				}
			}
			count := 2
			if op == "create" || op == "delete" {
				count = 1
			}
			if len(g.Edges) != count {
				t.Fatal("lost before/after relations")
			}
		})
	}
}

func TestInvalidInputs(t *testing.T) {
	for _, input := range []string{`{`, `{}`, `null`, `{"version":4,"deployment":{}}`, `{"steps":null}`, `{"steps":[]} {}`, `{"steps":[{"op":"unknown"}]}`, `{"steps":[{"op":"create","urn":"x"}]}`, `{"version":3,"deployment":{"resources":[{"urn":"invalid","type":"x"}]}}`} {
		if _, err := Read(strings.NewReader(input)); err == nil {
			t.Errorf("accepted %s", input)
		}
	}
}

func TestEmptyExportAndHiddenReferences(t *testing.T) {
	g, err := Read(strings.NewReader(`{"version":3,"deployment":{}}`))
	if err != nil || len(g.Nodes) != 0 {
		t.Fatalf("empty export: %+v %v", g, err)
	}
	input := `{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::test::pulumi:pulumi:Stack::stack","type":"pulumi:pulumi:Stack"},{"urn":"urn:pulumi:dev::test::aws:test:Resource::item","type":"aws:test:Resource","parent":"urn:pulumi:dev::test::pulumi:pulumi:Stack::stack","dependencies":["missing"]}]}}`
	g, err = Read(strings.NewReader(input))
	if err != nil || len(g.Nodes) != 1 || len(g.Edges) != 0 || g.OmittedRelations != 2 {
		t.Fatalf("hidden references: %+v %v", g, err)
	}
}

func TestMultipleStacks(t *testing.T) {
	var sources []Source
	for _, name := range []string{"base", "separation", "transcription"} {
		f, err := os.Open("../../../testdata/pulumi/multi/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		sources = append(sources, Source{Reader: f, Stack: "example/" + name + "/dev"})
	}
	g, err := ReadSources(sources...)
	if err != nil {
		t.Fatal(err)
	}
	if len(g.Nodes) != 8 || g.OmittedRelations != 0 {
		t.Fatalf("unexpected combined graph: %+v", g)
	}
	roots := 0
	references := 0
	for _, n := range g.Nodes {
		if n.Stack == "" {
			t.Fatal("missing source stack")
		}
		if n.StackRoot != (n.Type == "pulumi:pulumi:Stack") {
			t.Fatalf("incorrect stack root marker for %s", n.Type)
		}
		if n.StackRoot {
			roots++
		}
	}
	for _, e := range g.Edges {
		for _, proof := range e.Evidence {
			if proof.Source == "stackReference" {
				references++
				if e.To != id("urn:pulumi:dev::base::pulumi:pulumi:Stack::base-dev") || e.Kind != graph.DependsOn {
					t.Fatal("incorrect stack link")
				}
			}
		}
	}
	if roots != 3 || references != 2 {
		t.Fatalf("roots=%d cross-stack links=%d", roots, references)
	}
	out, _ := json.Marshal(g)
	if strings.Contains(string(out), "MULTI_CANARY_SECRET") {
		t.Fatal("leaked raw properties")
	}
	for _, s := range sources {
		if _, err := s.Reader.(*os.File).Seek(0, 0); err != nil {
			t.Fatal(err)
		}
	}
	reversed, err := ReadSources(sources[2], sources[0], sources[1])
	if err != nil {
		t.Fatal(err)
	}
	other, _ := json.Marshal(reversed)
	if string(out) != string(other) {
		t.Fatal("input ordering changed graph")
	}
}

func TestMultipleInputsResolveBeforeDroppingEdges(t *testing.T) {
	a := `{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::a::test:Resource::a","type":"test:Resource","dependencies":["urn:pulumi:dev::b::test:Resource::b"]}]}}`
	b := `{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::b::test:Resource::b","type":"test:Resource"}]}}`
	g, err := ReadSources(Source{Reader: strings.NewReader(a)}, Source{Reader: strings.NewReader(b)})
	if err != nil || len(g.Edges) != 1 || g.OmittedRelations != 0 {
		t.Fatalf("cross-input dependency lost: %+v %v", g, err)
	}
	if _, err := ReadSources(Source{Reader: strings.NewReader(a)}, Source{Reader: strings.NewReader(a)}); err == nil {
		t.Fatal("accepted duplicate resource across inputs")
	}
	if _, err := ReadSources(Source{Reader: strings.NewReader(a), Stack: "example/wrong/dev"}); err == nil {
		t.Fatal("accepted incorrect stack identity")
	}
	if _, err := ReadSources(); err == nil {
		t.Fatal("accepted no inputs")
	}
}

func TestUnresolvedStackReference(t *testing.T) {
	for _, name := range []string{`"other/base/dev"`, `{"secret":"MULTI_CANARY_SECRET"}`} {
		input := `{"version":3,"deployment":{"resources":[{"urn":"urn:pulumi:dev::app::pulumi:pulumi:StackReference::reference","type":"pulumi:pulumi:StackReference","inputs":{"name":` + name + `}}]}}`
		empty := `{"version":3,"deployment":{}}`
		g, err := ReadSources(Source{Reader: strings.NewReader(input)}, Source{Reader: strings.NewReader(empty)})
		if err != nil || g.OmittedRelations != 1 {
			t.Fatalf("unresolved reference: %+v %v", g, err)
		}
		out, _ := json.Marshal(g)
		if strings.Contains(string(out), "MULTI_CANARY_SECRET") {
			t.Fatal("leaked unresolved reference")
		}
	}
}

func TestMultiplePreviewInputs(t *testing.T) {
	var sources []Source
	for _, name := range []string{"base", "separation", "transcription"} {
		data, err := os.ReadFile("../../../testdata/pulumi/multi/" + name + ".json")
		if err != nil {
			t.Fatal(err)
		}
		var export struct {
			Deployment struct {
				Resources []resource `json:"resources"`
			} `json:"deployment"`
		}
		if err := json.Unmarshal(data, &export); err != nil {
			t.Fatal(err)
		}
		steps := []step{}
		for i := range export.Deployment.Resources {
			r := &export.Deployment.Resources[i]
			steps = append(steps, step{Op: "same", URN: r.URN, Old: r, New: r})
		}
		preview, err := json.Marshal(map[string]any{"steps": steps})
		if err != nil {
			t.Fatal(err)
		}
		sources = append(sources, Source{Reader: strings.NewReader(string(preview)), Stack: "example/" + name + "/dev"})
	}
	g, err := ReadSources(sources...)
	if err != nil {
		t.Fatal(err)
	}
	count := map[string]int{}
	for _, e := range g.Edges {
		for _, proof := range e.Evidence {
			if proof.Source == "stackReference" {
				count[e.State]++
			}
		}
	}
	if count["before"] != 2 || count["after"] != 2 || g.OmittedRelations != 0 {
		t.Fatalf("preview cross-stack topology lost: %+v", g)
	}
}
