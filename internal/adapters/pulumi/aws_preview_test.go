package pulumi

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"laytrace/internal/graph"
)

func TestPreviewPropertyRelations(t *testing.T) {
	fixture, err := os.ReadFile("../../../testdata/pulumi/image-preview.json")
	if err != nil {
		t.Fatal(err)
	}
	g, err := Read(strings.NewReader(string(fixture)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]string{}
	for _, n := range g.Nodes {
		names[n.ID] = n.Name
	}
	expected := map[string]string{
		"uploads-bucket → onCreateLambda":      "bucketNotification",
		"searchApi → searchLambda":             "searchApiIntegration",
		"onCreateLambda → opensearch-instance": "onCreateLambda",
		"searchLambda → opensearch-instance":   "searchLambda",
	}
	for _, e := range g.Edges {
		if e.Kind == graph.DependsOn {
			continue
		}
		key := names[e.From] + " → " + names[e.To]
		owner, ok := expected[key]
		if !ok || e.Kind != graph.ConnectsTo || e.State != "after" || len(e.Evidence) != 1 || names[e.Evidence[0].Resource] != owner || !strings.Contains(e.Evidence[0].Property, "propertyDependencies.") {
			t.Fatalf("unexpected relation or evidence: %s %+v", key, e)
		}
		delete(expected, key)
	}
	if len(expected) != 0 {
		t.Fatalf("missing connections: %v", expected)
	}
	data, _ := json.Marshal(g)
	for _, secret := range []string{"CANARY_SECRET", "OPENSEARCH_ENDPOINT", "private-api", unknownValue, "urn:pulumi:"} {
		if strings.Contains(string(data), secret) {
			t.Fatalf("leaked %s", secret)
		}
	}

	for _, tc := range []struct {
		name   string
		mutate func([]step)
		count  int
	}{
		{"plain dependencies", func(steps []step) {
			for _, s := range steps {
				for _, deps := range s.New.PropertyDependencies {
					s.New.Dependencies = append(s.New.Dependencies, deps...)
				}
				s.New.PropertyDependencies = nil
			}
		}, 0},
		{"wrong bucket type", func(s []step) { s[5].New.PropertyDependencies["bucket"] = []string{s[7].URN} }, 3},
		{"wrong lambda type", func(s []step) { s[5].New.PropertyDependencies["lambdaFunctions"] = []string{s[7].URN} }, 3},
		{"ambiguous lambda", func(s []step) { s[5].New.PropertyDependencies["lambdaFunctions"] = []string{s[1].URN, s[2].URN} }, 3},
		{"wrong api type", func(s []step) {
			s[6].New.Inputs["apiId"] = json.RawMessage(`"` + unknownValue + `"`)
			s[6].New.PropertyDependencies["apiId"] = []string{s[0].URN}
		}, 3},
		{"unknown api identity", func(s []step) { s[6].New.Inputs["apiId"] = json.RawMessage(`"` + unknownValue + `"`) }, 4},
		{"changed API does not reuse old identity", func(s []step) { s[4].Op = "update" }, 3},
		{"unchanged provider outputs", func(s []step) {
			old := *s[1].New
			old.Outputs = map[string]json.RawMessage{"arn": json.RawMessage(`"private-function"`)}
			s[1].Old, s[1].Op = &old, "same"
			s[0].Old.ID = "private-bucket"
			s[5].New.Inputs["bucket"] = json.RawMessage(`"private-bucket"`)
			s[5].New.Inputs["lambdaFunctions"] = json.RawMessage(`[{"lambdaFunctionArn":"private-function","events":["s3:ObjectCreated:*"]}]`)
		}, 4},
		{"ambiguous integration target", func(s []step) { s[6].New.PropertyDependencies["integrationUri"] = []string{s[1].URN, s[2].URN} }, 3},
		{"not AWS_PROXY", func(s []step) { s[6].New.Inputs["integrationType"] = json.RawMessage(`"HTTP_PROXY"`) }, 3},
		{"known unmatched api", func(s []step) { s[6].New.Inputs["apiId"] = json.RawMessage(`"unmatched-api"`) }, 3},
		{"known unmatched bucket", func(s []step) { s[5].New.Inputs["bucket"] = json.RawMessage(`"unmatched-bucket"`) }, 3},
		{"known unmatched notification target", func(s []step) {
			s[5].New.Inputs["lambdaFunctions"] = json.RawMessage(`[{"lambdaFunctionArn":"unmatched-function","events":["s3:ObjectCreated:*"]}]`)
		}, 3},
		{"known API identifiers", func(s []step) {
			s[4].New.ID = "private-api"
			s[2].New.Outputs = map[string]json.RawMessage{"arn": json.RawMessage(`"private-function"`)}
			s[6].New.Inputs["apiId"] = json.RawMessage(`"private-api"`)
			s[6].New.Inputs["integrationUri"] = json.RawMessage(`"private-function"`)
			s[6].New.PropertyDependencies = nil
		}, 4},
		{"missing target", func(s []step) {
			s[6].New.PropertyDependencies["integrationUri"] = []string{"urn:pulumi:dev::example::aws:lambda/function:Function::missing"}
		}, 3},
		{"IAM environment is not EC2", func(s []step) { s[1].New.PropertyDependencies["environment"] = []string{s[7].URN} }, 3},
		{"duplicate dependency", func(s []step) { s[6].New.PropertyDependencies["apiId"] = []string{s[4].URN, s[4].URN} }, 4},
		{"target only exists before", func(s []step) { s[3].Old = s[3].New; s[3].New = nil; s[3].Op = "delete" }, 2},
		{"before topology", func(s []step) {
			s[4].New.ID = s[4].Old.ID
			for i := range s {
				s[i].Old = s[i].New
				s[i].New = nil
				s[i].Op = "delete"
			}
		}, 4},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var doc struct {
				Steps []step `json:"steps"`
			}
			if err := json.Unmarshal(fixture, &doc); err != nil {
				t.Fatal(err)
			}
			tc.mutate(doc.Steps)
			raw, err := json.Marshal(doc)
			if err != nil {
				t.Fatal(err)
			}
			g, err := Read(strings.NewReader(string(raw)))
			if err != nil {
				t.Fatal(err)
			}
			count := 0
			for _, e := range g.Edges {
				if e.Kind == graph.ConnectsTo || e.Kind == graph.Triggers {
					count++
					state := "after"
					if tc.name == "before topology" {
						state = "before"
					}
					if e.State != state {
						t.Fatalf("connection crossed topologies: %+v", e)
					}
				}
			}
			if count != tc.count {
				t.Fatalf("got %d connections, want %d", count, tc.count)
			}
		})
	}
}
