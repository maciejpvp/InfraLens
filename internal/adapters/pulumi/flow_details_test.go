package pulumi

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"infralens/internal/graph"
)

func TestFlowDetailsFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/pulumi/flow-details.json")
	if err != nil {
		t.Fatal(err)
	}
	g, err := Read(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	labels := map[string]bool{}
	for _, edge := range g.Edges {
		if edge.Kind != graph.ConnectsTo && edge.Kind != graph.Triggers {
			continue
		}
		described := false
		for _, proof := range edge.Evidence {
			if proof.Label == "s3:ObjectCreated:*" && strings.Contains(proof.Details, "deleted/") {
				t.Fatal("mixed S3 notification filters")
			}
			if proof.Label == "s3:ObjectRemoved:*" && (!strings.Contains(proof.Details, "deleted/") || strings.Contains(proof.Details, "uploads/")) {
				t.Fatal("lost notification filter association")
			}
			if proof.Label != "" {
				described = true
				labels[proof.Label] = true
			}
		}
		if !described {
			t.Fatalf("missing description: %+v", edge)
		}
	}
	for _, label := range []string{"GET /search", "POST /search", "$default", "s3:ObjectCreated:*", "s3:ObjectRemoved:*", "DynamoDB Streams · INSERT, MODIFY · disabled", "SQS messages", "DLQ", "Task Prepare", "Task Batch/Run", "environment.TABLE_NAME", "taskDefinition", "rate(5 minutes)", "aws.s3"} {
		if !labels[label] {
			t.Errorf("missing %s; labels=%v", label, labels)
		}
	}
	encoded, _ := json.Marshal(g)
	for _, secret := range []string{"CANARY_SECRET", "private-bucket", "private-table", "private-function", "private-api", "private-integration", "arn:aws:", "urn:pulumi:", unknownValue} {
		if strings.Contains(string(encoded), secret) {
			t.Errorf("leaked %s", secret)
		}
	}
	if !strings.Contains(string(encoded), "uploads/") || !strings.Contains(string(encoded), ".jpg") || !strings.Contains(string(encoded), "InvocationType: Event") {
		t.Fatal("lost filters or task mode")
	}
	again, err := Read(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	second, _ := json.Marshal(again)
	if string(encoded) != string(second) {
		t.Fatal("nondeterministic descriptions")
	}
	// Same relation and operation may have different descriptions before and after.
	var doc struct {
		Steps []step `json:"steps"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	for i := range doc.Steps {
		s := &doc.Steps[i]
		s.Op = "update"
		old := *s.New
		s.Old = &old
		if s.New.Type == "aws:apigatewayv2/route:Route" {
			s.Old.Inputs = map[string]json.RawMessage{}
			for k, v := range s.New.Inputs {
				s.Old.Inputs[k] = v
			}
			s.Old.Inputs["routeKey"] = json.RawMessage(`"GET /old"`)
		}
	}
	changed, _ := json.Marshal(doc)
	g, err = Read(strings.NewReader(string(changed)))
	if err != nil {
		t.Fatal(err)
	}
	before, after := false, false
	for _, e := range g.Edges {
		for _, p := range e.Evidence {
			if e.State == "before" && p.Label == "GET /old" {
				before = true
			}
			if e.State == "after" && p.Label == "GET /search" {
				after = true
			}
			if e.State == "after" && p.Label == "GET /old" {
				t.Fatal("mixed topology descriptions")
			}
		}
	}
	if !before || !after {
		t.Fatal("lost before/after route labels")
	}
}

func TestDetailRedaction(t *testing.T) {
	for _, raw := range []string{
		`{"socket":"wss://private.socket/path","file":"ftp://private.files/path","url":"https://private.example/path","arn":"arn:aws:private","ip":"192.168.1.4","ipv6":"2001:db8::1","ok":"INSERT"}`,
		`{"filters":[{"pattern":"{\"hidden\":{\"4dabf18193072939515e22adb298388d\":\"1b47061264138c4ac30d75fd1eb44270\",\"value\":\"CANARY_SECRET\"},\"eventName\":[\"INSERT\"]}"}]}`,
	} {
		value := detailValue(json.RawMessage(raw))
		for _, private := range []string{"private.example", "private.socket", "private.files", "arn:aws:", "192.168.1.4", "2001:db8::1", "CANARY_SECRET"} {
			if strings.Contains(value, private) {
				t.Fatalf("leaked %s: %s", private, value)
			}
		}
		if !strings.Contains(value, "INSERT") {
			t.Fatal("lost safe filter")
		}
	}
}

func TestDetailRedactionOmitsPrivatePairs(t *testing.T) {
	raw := json.RawMessage(`{"https://private.invalid/a":["alpha"],"https://private.invalid/b":["beta"],"[redacted]":"ordinary","ok":"INSERT"}`)
	want := `{"[redacted]":"ordinary","ok":"INSERT"} · contains [redacted] keys`
	if got := detailValue(raw); got != want {
		t.Fatalf("detailValue = %q, want %q", got, want)
	}
}

func TestMappingFilterDescriptions(t *testing.T) {
	for _, tc := range []struct{ raw, label string }{
		{`null`, "INSERT, MODIFY, REMOVE"}, {`{}`, "INSERT, MODIFY, REMOVE"}, {`{"filters":[]}`, "INSERT, MODIFY, REMOVE"},
		{`{"filters":null}`, "INSERT, MODIFY, REMOVE"}, {`{"other":[]}`, "filtered"},
		{`"` + unknownValue + `"`, "unknown filter"},
		{`{"filters":[{"pattern":"{\"eventName\":[\"REMOVE\"]}"}]}`, "REMOVE"},
		{`{"filters":[{"pattern":"{\"dynamodb\":{\"Keys\":{\"id\":[\"a\"]}}}"}]}`, "filtered"},
		{`{"filters":[{"pattern":"invalid"}]}`, "filtered"},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			label, _ := mappingDescription(resource{Inputs: map[string]json.RawMessage{"filterCriteria": json.RawMessage(tc.raw)}}, true)
			if !strings.Contains(label, tc.label) {
				t.Fatalf("%s, want %s", label, tc.label)
			}
		})
	}
}

func TestRoutesDoNotMatchOtherAPIsOrAmbiguousTargets(t *testing.T) {
	raw, err := os.ReadFile("../../../testdata/pulumi/flow-details.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"other api", "unmatched target", "ambiguous target"} {
		t.Run(mode, func(t *testing.T) {
			var doc struct {
				Steps []step `json:"steps"`
			}
			if err := json.Unmarshal(raw, &doc); err != nil {
				t.Fatal(err)
			}
			var integration *resource
			for _, s := range doc.Steps {
				if s.New.Type == "aws:apigatewayv2/integration:Integration" {
					integration = s.New
				}
			}
			extra := *integration
			extra.URN += "-other"
			extra.ID = "another-integration"
			if mode == "ambiguous target" {
				doc.Steps = append(doc.Steps, step{Op: "create", URN: extra.URN, New: &extra})
			}
			for _, s := range doc.Steps {
				if s.New.Type != "aws:apigatewayv2/route:Route" {
					continue
				}
				switch mode {
				case "other api":
					s.New.Inputs["apiId"] = json.RawMessage(`"not-this-api"`)
				case "unmatched target":
					s.New.Inputs["target"] = json.RawMessage(`"integrations/missing"`)
				case "ambiguous target":
					s.New.PropertyDependencies["target"] = []string{integration.URN, extra.URN}
				}
			}
			data, _ := json.Marshal(doc)
			g, err := Read(strings.NewReader(string(data)))
			if err != nil {
				t.Fatal(err)
			}
			for _, e := range g.Edges {
				for _, p := range e.Evidence {
					if p.Label == "GET /search" || p.Label == "POST /search" || p.Label == "$default" {
						t.Fatalf("invented route in %s: %+v", mode, p)
					}
				}
			}
		})
	}
}
