package cost

import (
	"reflect"
	"strings"
	"testing"
)

func TestUsageImportsCommonAndSnapshotValues(t *testing.T) {
	file, err := ReadUsage(strings.NewReader(`{
		"version":1, "scenario":"orders", "baseline":"HEAD", "target":"working tree",
		"resources":[
			{"name":"Worker","type":"AWS::Lambda::Function","stack":"Target","common":{"operations":1,"lambdaMs":100},
			 "before":{"lambdaMs":120},"after":{"operations":0}, "evidence":["app/worker.go:3"]},
			{"id":"added","after":{"reads":0.5}},
			{"id":"stale","common":{"operations":2}}
		]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	worker := Resource{ID: "worker", Name: "Worker", Type: "AWS::Lambda::Function", Stack: "Target"}
	other := Resource{ID: "other", Name: worker.Name, Type: worker.Type, Stack: "Other"}
	added := Resource{ID: "added"}
	item := Item{ID: worker.ID, Usage: Metric{Charges: []Charge{{Input: "lambdaMs"}}}}
	before := []Item{item, {ID: other.ID}}
	report := Report{Before: &before, After: []Item{item, {ID: added.ID, Usage: Metric{Charges: []Charge{{Input: "reads"}}}}}}
	inventory := Inventory{Before: []Resource{worker, other}, After: []Resource{worker, added}}
	if err := file.Apply(inventory, &report); err != nil {
		t.Fatal(err)
	}
	if got, want := before[0].Assumptions, (map[string]float64{"operations": 1, "lambdaMs": 120}); !reflect.DeepEqual(got, want) {
		t.Fatalf("before assumptions %v, want %v", got, want)
	}
	if got, want := report.After[0].Assumptions, (map[string]float64{"operations": 0, "lambdaMs": 100}); !reflect.DeepEqual(got, want) {
		t.Fatalf("after assumptions %v, want %v", got, want)
	}
	if before[1].Assumptions != nil || report.After[1].Assumptions["reads"] != 0.5 || len(report.Usage.Warnings) != 1 {
		t.Fatalf("unexpected selectors or warnings: before %v, after %v, usage %v", before, report.After, report.Usage)
	}
}

func TestUsageRejectsInvalidAndAmbiguousInputs(t *testing.T) {
	for _, invalid := range []string{
		`{"version":2,"resources":[]}`,
		`{"version":1,"resources":[{"id":"id","common":{"operations":null}}]}`,
		`{"version":1,"resources":[{"id":"id","common":{"lambdaMs":900001}}]}`,
		`{"version":1,"resources":[{"name":"worker","after":{"operations":1}}]}`,
		`{"version":1,"resources":[{"id":"id","after":{"requests":1}}]}`,
	} {
		if _, err := ReadUsage(strings.NewReader(invalid)); err == nil {
			t.Errorf("accepted %s", invalid)
		}
	}
	f, err := ReadUsage(strings.NewReader(`{"version":1,"resources":[
		{"name":"Worker","type":"AWS::Lambda::Function","after":{"operations":2}}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	inventory := Inventory{After: []Resource{
		{ID: "one", Name: "Worker", Type: "AWS::Lambda::Function", Stack: "first"},
		{ID: "two", Name: "Worker", Type: "AWS::Lambda::Function", Stack: "second"},
	}}
	if err := f.Apply(inventory, &Report{After: []Item{{ID: "one"}, {ID: "two"}}}); err == nil || !strings.Contains(err.Error(), "matches multiple") {
		t.Fatalf("expected ambiguous selector error, got %v", err)
	}
}
