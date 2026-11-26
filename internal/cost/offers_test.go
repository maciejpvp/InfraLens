package cost

import (
	"context"
	"io"
	"strings"
	"sync/atomic"
	"testing"
)

func TestCatalogDiscoveryWithoutPricingModel(t *testing.T) {
	offers, err := readOffers(strings.NewReader(`{"offers":{"AmazonFutureService":{},"AmazonCloudWatch":{},"AWSQueueService":{}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if got := offers.codes("logs"); len(got) != 1 || got[0] != "AmazonCloudWatch" {
		t.Fatalf("CloudWatch Logs offer: %v", got)
	}
	if got := offers.codes("sqs"); len(got) != 1 || got[0] != "AWSQueueService" {
		t.Fatalf("SQS offer: %v", got)
	}
	const prices = `SKU,TermType,Currency,Region Code,Product Family,Unit,StartingRange,EndingRange,PricePerUnit
FREE,OnDemand,USD,eu-west-1,Request,Requests,0,100,0
A,OnDemand,USD,eu-west-1,Request,Requests,100,Inf,0.01
B,OnDemand,USD,eu-west-1,Request,Requests,0,Inf,0.05
C,OnDemand,USD,us-east-1,Request,Requests,0,Inf,0.70
STORAGE,OnDemand,USD,eu-west-1,Storage,GB-Mo,0,Inf,0.15
`
	r := Resource{ID: "resource", Name: "New", Type: "AWS::FutureService::Resource", Service: "futureservice", Region: "eu-west-1"}
	var loads atomic.Int32
	report := Estimator{}.build(t.Context(), Inventory{Compare: true, Before: []Resource{r}, After: []Resource{r}},
		offers, nil, func(_ context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
			loads.Add(1)
			if key != (catalogKey{"AmazonFutureService", "eu-west-1"}) || len(request.components) != 0 {
				t.Errorf("unexpected automatic catalog lookup: %+v", key)
			}
			return readCatalog(&io.LimitedReader{R: strings.NewReader(prices), N: 4096}, key.region, request.components, true, false)
		})
	entries := report.Catalogs["futureservice"]
	if loads.Load() != 1 || len(entries) != 1 || entries[0].Code != "AmazonFutureService" || len(entries[0].Rates) != 2 {
		t.Fatalf("expected one catalog load shared by both snapshots: %+v", entries)
	}
	if got := entries[0].Rates[0]; got.Unit != "Requests" || got.Min != 0.01 || got.Max != 0.05 {
		t.Fatalf("unexpected request price range: %+v", got)
	}
	usage := report.After[0].Usage
	if len(usage.Charges) != 0 || len(usage.Missing) == 0 {
		t.Fatalf("a catalog without quantities must leave usage unavailable: %+v", usage)
	}
}

func TestGlobalCatalogSummaryExcludesOtherAWSRegions(t *testing.T) {
	const input = `SKU,TermType,Currency,Region Code,Product Family,Unit,StartingRange,EndingRange,PricePerUnit
REGIONAL,OnDemand,USD,eu-west-1,Transfer,GB,0,Inf,75
EDGE,OnDemand,USD,,Transfer,GB,0,Inf,0.10
`
	result, err := readCatalog(&io.LimitedReader{R: strings.NewReader(input), N: 4096}, "global", nil, true, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.rates) != 1 || result.rates[0].Min != 0.10 || result.rates[0].Max != 0.10 {
		t.Fatalf("unexpected unscoped rates %+v", result.rates)
	}
}
