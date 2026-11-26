package awscdk

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"reflect"
	"strings"
	"testing"

	"infralens/internal/graph"
)

func TestReadInputs(t *testing.T) {
	const fixture = "../../../testdata/awscdk/Example.template.json"
	data, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	open := func(path string) (io.Reader, error) {
		if path == "Other.template.json" {
			return strings.NewReader(`{"Resources":{"Worker":{"Type":"AWS::Lambda::Function","DependsOn":"Queue"}}}`), nil
		}
		if path != fixture {
			t.Fatalf("unexpected input path %q", path)
		}
		return bytes.NewReader(data), nil
	}
	g, err := (Adapter{}).ReadInputs([]string{fixture, "Second=Other.template.json"}, open, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(g.Nodes) != 12 || g.OmittedRelations != 2 {
		t.Fatalf("got %d nodes and %d omitted dependencies", len(g.Nodes), g.OmittedRelations)
	}
	if err := g.Validate(); err != nil {
		t.Fatal(err)
	}
	nodes := map[string]graph.Node{}
	for _, node := range g.Nodes {
		nodes[node.Stack+"/"+node.Name] = node
	}
	worker, other := nodes["Example/Worker"], nodes["Second/Worker"]
	if worker.ID == "" || other.ID == "" || worker.ID == other.ID || worker.Change != "" ||
		worker.Type != lambdaFunction || worker.Service != "lambda" || worker.Provider != "aws" {
		t.Fatalf("unexpected workers: %+v and %+v", worker, other)
	}
	type relation struct {
		from, to string
		kind     graph.Kind
	}
	want := map[relation][]string{
		{"Worker", "Queue", graph.DependsOn}:  {"DependsOn", "Fn::Sub", "Ref"},
		{"Worker", "Bucket", graph.DependsOn}: {"Fn::GetAtt"},
		{"Worker", "Table", graph.ConnectsTo}: {"Lambda environment", "Lambda environment"},
		{"Queue", "Worker", graph.Triggers}:   {"EventSourceMapping"},
		{"Table", "Worker", graph.Triggers}:   {"EventSourceMapping"},
		{"Bucket", "Worker", graph.Triggers}:  {"S3 notification", "S3 notification"},
		{"Api", "Worker", graph.ConnectsTo}:   {"AppSync data source"},
		{"Api", "Table", graph.ConnectsTo}:    {"AppSync data source"},
	}
	for rel, sources := range want {
		key := edgeKey{nodes["Example/"+rel.from].ID, nodes["Example/"+rel.to].ID, rel.kind}
		var got []string
		for _, edge := range g.Edges {
			if (edgeKey{edge.From, edge.To, edge.Kind}) == key {
				for _, evidence := range edge.Evidence {
					got = append(got, evidence.Source)
				}
			}
		}
		if !reflect.DeepEqual(got, sources) {
			t.Errorf("%+v evidence = %v, want %v", rel, got, sources)
		}
	}
	for _, edge := range g.Edges {
		if edge.From == other.ID || edge.To == other.ID {
			t.Errorf("linked across stack boundaries: %+v", edge)
		}
	}
	reordered, err := (Adapter{}).ReadInputs([]string{"Second=Other.template.json", fixture}, open, nil)
	if err != nil || !reflect.DeepEqual(g, reordered) {
		t.Fatalf("changing input order changed the normalized graph: %v", err)
	}
	encoded, err := json.Marshal(g)
	if err != nil || bytes.Contains(encoded, []byte("CANARY_CDK_SECRET")) {
		t.Fatalf("invalid or unsafe graph JSON: %v", err)
	}
	if _, err := (Adapter{}).ReadInputs([]string{fixture, fixture}, open, nil); err == nil {
		t.Fatal("accepted repeated stack name")
	}
}

func TestReadInputsRejectsInvalidTemplates(t *testing.T) {
	for _, input := range []string{
		`{"Resources":{"Example":`,
		`{"artifacts":{}}`,
		`{"Resources":{}} {"Resources":{}}`,
		`{"Resources":{"Example":{"Type":"AWS::SQS::Queue","DependsOn":true}}}`,
		`{"Resources":{"Example":{"Type":""}}}`,
	} {
		_, err := (Adapter{}).ReadInputs([]string{"example.json"}, func(string) (io.Reader, error) {
			return strings.NewReader(input), nil
		}, nil)
		if err == nil {
			t.Errorf("accepted invalid template %q", input)
		}
	}
}
