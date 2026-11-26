package cost

import (
	"context"
	"strings"
	"testing"
)

func TestWorkflowImportResolvesSnapshotPricesAndMonthlyDuplicates(t *testing.T) {
	file, err := ReadUsage(strings.NewReader(`{
		"version":2,"activeUsers":10,"workflows":[
			{"id":"play","label":"GET /play","before":null,"after":{"runsPerUser":2,"steps":[
				{"id":"worker","label":"Lambda","resource":{"name":"Worker","type":"AWS::Lambda::Function","stack":"App"},
				 "meters":[{"label":"Duration","rate":{"builtin":"lambdaMs"},"quantity":[{"label":"Invocations","value":2},{"label":"Milliseconds","value":100}]}]},
				{"id":"s3","label":"S3","resource":{"id":"bucket"},"meters":[
					{"label":"GET","rate":{"builtin":"operations"},"quantity":3},
					{"label":"Network","rate":{"serviceCode":"AWSDataTransfer","sku":"OUT","unit":"GB"},"quantity":null}
				]}
			],"links":[{"from":"worker","to":"s3"}]}},
			{"id":"share","label":"PUT /share","after":{"runsPerUser":1,"steps":[
				{"id":"worker","label":"Lambda","resource":{"id":"worker"},"meters":[{"label":"Requests","rate":{"builtin":"operations"},"quantity":1}]}
			]}}
		],"sharedMonthly":{"after":[
			{"id":"library","label":"Storage","resource":{"id":"bucket"},"meters":[{"label":"Volume","rate":{"serviceCode":"AmazonS3","sku":"STORAGE","unit":"GB-Mo"},"quantity":100}]},
			{"id":"duplicate","label":"Storage again","resource":{"id":"bucket"},"meters":[{"label":"Volume","rate":{"serviceCode":"AmazonS3","sku":"STORAGE","unit":"GB-Mo"},"quantity":100}]}
		]}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	inventory := Inventory{Compare: true, After: []Resource{
		{ID: "worker", Name: "Worker", Type: "AWS::Lambda::Function", Service: "lambda", Stack: "App", Region: "eu-west-1", Properties: map[string]any{"MemorySize": 256.0}},
		{ID: "bucket", Type: "AWS::S3::Bucket", Service: "s3", Region: "eu-west-1"},
	}}
	workflows, err := file.Workload(inventory)
	if err != nil {
		t.Fatal(err)
	}
	report := Estimator{}.build(t.Context(), inventory, nil, workflows,
		func(_ context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
			if key.region != "eu-west-1" {
				t.Errorf("wrong rate region: %v", key)
			}
			result := catalogResult{matches: make([]match, len(request.components))}
			for i, component := range request.components {
				sku := component.quote.sku
				if sku == "" {
					sku = component.quote.usage
				}
				result.matches[i] = match{sku: sku, tiers: []Tier{{Price: 0.02}}}
			}
			return result, nil
		})
	play, share := report.Workflows.Items[0], report.Workflows.Items[1]
	if play.Before != nil || len(share.Before.Issues) == 0 {
		t.Fatal("absent and unknown states must remain distinct")
	}
	duration := play.After.Steps[0].Meters[0]
	if !strings.Contains(duration.Pricing.Charges[0].Rate, "eu-west-1") || duration.Pricing.Charges[0].Quantity != 0.00025 {
		t.Fatalf("wrong Lambda millisecond conversion: %+v", duration)
	}
	network := play.After.Steps[1].Meters[1]
	if network.Factors[0].Value != nil || network.Pricing.Charges[0].Quantity != 1 {
		t.Fatalf("unknown network quantity should still have a rate: %+v", network)
	}
	if got := report.Workflows.Shared.After[1].Meters[0]; got.Note == "" || len(got.Pricing.Charges) != 0 {
		t.Fatalf("expected monthly duplicate suppression: %+v", got)
	}
}

func TestWorkflowRejectsInvalidEdgesAndAmbiguousSelectors(t *testing.T) {
	for _, test := range []struct {
		state string
		error string
	}{
		{`{"steps":[{"id":"a","label":"A"}],"links":[{"from":"a","to":"unresolved"}]}`, "links"},
		{`{"steps":[{"id":"a","label":"A","resource":{"name":"Worker","type":"Lambda"}}]}`, "multiple resources"},
		{`{"steps":[{"id":"a","label":"A","meters":[{"label":"Unknown","rate":{"builtin":"operations"},"quantity":1}]}]}`, "require a resource"},
	} {
		input := `{"version":2,"workflows":[{"id":"route","label":"Route","after":` + test.state + `}]}`
		file, err := ReadUsage(strings.NewReader(input))
		if err != nil {
			t.Fatal(err)
		}
		_, err = (Estimator{Usage: file}).Estimate(t.Context(), Inventory{After: []Resource{
			{ID: "one", Name: "Worker", Type: "Lambda"}, {ID: "two", Name: "Worker", Type: "Lambda"},
		}}, func() { t.Fatal("pricing started with invalid workflow assumptions") })
		if err == nil || !strings.Contains(err.Error(), test.error) {
			t.Errorf("expected %q: %v", test.error, err)
		}
	}
}

func TestSemanticWorkflowUsageUsesSnapshotBilling(t *testing.T) {
	file, err := ReadUsage(strings.NewReader(`{
		"version":2,"workflows":[{"id":"avatar","label":"UserProfilePicChange","after":{
			"runsPerUser":10,"frequencyEvidence":"Estimated from profile settings.","steps":[
				{"id":"db","label":"Profile","resource":{"id":"db"},"meters":[
					{"label":"Read","usage":"dynamoReadUnits","quantity":2},
					{"label":"Write","usage":"dynamoWriteUnits","quantity":1}]},
				{"id":"bucket","label":"Photo","resource":{"id":"bucket"},"meters":[
					{"label":"Read","usage":"s3Get","quantity":2},
					{"label":"Write","usage":"s3Put","quantity":1},
					{"label":"JPEG","usage":"s3UploadBytes","quantity":786432},
					{"label":"Deliver","usage":"s3InternetBytes","quantity":1073741824}]}
			]}}],
			"sharedMonthly":{"after":[{"id":"inventory","label":"Photo library","resource":{"id":"bucket"},"meters":[
				{"label":"Retained","usage":"s3StoredBytes","quantity":1073741824}]}]}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"PAY_PER_REQUEST", "PROVISIONED"} {
		t.Run(mode, func(t *testing.T) {
			inventory := Inventory{After: []Resource{
				{ID: "db", Type: "AWS::DynamoDB::Table", Service: "dynamodb", Region: "eu-west-1",
					Properties: map[string]any{"BillingMode": mode, "ReadCapacityUnits": 2.0, "WriteCapacityUnits": 1.0}},
				{ID: "bucket", Type: "AWS::S3::Bucket", Service: "s3", Region: "eu-west-1"},
			}}
			workflows, err := file.Workload(inventory)
			if err != nil {
				t.Fatal(err)
			}
			report := Estimator{}.build(t.Context(), inventory, nil, workflows,
				func(_ context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
					if key.region != "eu-west-1" {
						t.Errorf("wrong price region: %v", key)
					}
					result := catalogResult{matches: make([]match, len(request.components))}
					for i, component := range request.components {
						result.matches[i] = match{sku: component.quote.usage, tiers: []Tier{{Price: 0.02}}}
					}
					return result, nil
				})
			state := report.Workflows.Items[0].After
			reads, writes := state.Steps[0].Meters[0], state.Steps[0].Meters[1]
			if state.FrequencyEvidence == "" || reads.Unit != "RCU" || writes.Unit != "WCU" {
				t.Fatalf("missing usage metadata: %+v", state)
			}
			assertRate := func(meter WorkflowMeter, usage string, multiplier float64) {
				t.Helper()
				charges := meter.Pricing.Charges
				if len(meter.Pricing.Missing) != 0 || len(charges) != 1 ||
					!strings.Contains(charges[0].Rate, "/"+usage+"/") || charges[0].Quantity != multiplier {
					t.Fatalf("expected %s × %g, got %+v", usage, multiplier, meter)
				}
			}
			if mode == "PAY_PER_REQUEST" {
				assertRate(reads, "ReadRequestUnits", 1)
				assertRate(writes, "WriteRequestUnits", 1)
			} else if reads.Note == "" || writes.Note == "" || len(reads.Pricing.Charges)+len(writes.Pricing.Charges) != 0 ||
				len(reads.Pricing.Missing)+len(writes.Pricing.Missing) != 0 {
				t.Fatalf("provisioned workload must be visible without a second charge: %+v %+v", reads, writes)
			}
			bucket := state.Steps[1].Meters
			assertRate(bucket[0], "Requests-Tier2", 1)
			assertRate(bucket[1], "Requests-Tier1", 1)
			if bucket[2].Note == "" || len(bucket[2].Pricing.Charges)+len(bucket[2].Pricing.Missing) != 0 {
				t.Fatalf("upload volume must be visible: %+v", bucket[2])
			}
			assertRate(bucket[3], "DataTransfer-Out-Bytes", 1.0/(1<<30))
			if !strings.HasPrefix(bucket[3].Pricing.Charges[0].Rate, "AWSDataTransfer/") {
				t.Fatal("Internet egress must use the public outbound catalog")
			}
			assertRate(report.Workflows.Shared.After[0].Meters[0], "TimedStorage-ByteHrs", 1.0/(1<<30))
		})
	}
}
