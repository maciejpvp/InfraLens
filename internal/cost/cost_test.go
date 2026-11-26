package cost

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestCatalogMatchesRegionUnitAndConfiguration(t *testing.T) {
	body := `FormatVersion,v1
SKU,TermType,Currency,Region Code,usageType,Unit,operation,StartingRange,EndingRange,PricePerUnit,Instance Type
other-region,OnDemand,USD,eu-west-1,USE1-BoxUsage:t3.micro,Hrs,RunInstances,0,Inf,12,t3.micro
reserved,Reserved,USD,us-east-1,USE1-BoxUsage:t3.micro,Hrs,RunInstances,0,Inf,13,t3.micro
wrong-unit,OnDemand,USD,us-east-1,USE1-BoxUsage:t3.micro,Seconds,RunInstances,0,Inf,15,t3.micro
wrong-instance,OnDemand,USD,us-east-1,USE1-BoxUsage:t3.micro,Hrs,RunInstances,0,Inf,20,t3.large
variant,OnDemand,USD,us-east-1,TS-BoxUsage:t3.micro,Hrs,RunInstances,0,Inf,14,t3.micro
instance,OnDemand,USD,us-east-1,BoxUsage:t3.micro,Hrs,RunInstances,0,Inf,0.01,t3.micro
other-tier,OnDemand,USD,us-east-1,IA-Requests-Tier1,Requests,,0,Inf,30,
topic,OnDemand,USD,us-east-1,Requests-Tier1,Requests,,0,100,0,
topic,OnDemand,USD,us-east-1,Requests-Tier1,Requests,,100,1000,0.5,
topic,OnDemand,USD,us-east-1,Requests-Tier1,Requests,,1000,Inf,0.2,
`
	reader := &io.LimitedReader{R: strings.NewReader(body), N: 8192}
	catalog, err := readCatalog(reader, "us-east-1", []pending{
		{quote: quote{usage: "BoxUsage:t3.micro", unit: "Hrs", operation: "RunInstances", attributes: map[string]string{"Instance Type": "t3.micro"}}},
		{quote: quote{usage: "Requests-Tier1", unit: "Requests"}},
		{quote: quote{usage: "Nonexistent", unit: "Hrs"}},
	}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	got := catalog.matches
	if got[0].sku != "instance" || got[0].tiers[0].Price != 0.01 || len(got[2].tiers) != 0 {
		t.Fatalf("unexpected matched rates: %+v", got)
	}
	tiers := got[1].tiers
	if len(tiers) != 2 || tiers[0].UpTo == nil || *tiers[0].UpTo != 900 ||
		tiers[0].Price != 0.5 || tiers[1].UpTo != nil || tiers[1].Price != 0.2 {
		t.Fatalf("unexpected paid tiers: %+v", tiers)
	}
}

func TestBuildReusesCatalogAcrossStatesAndKeepsPartialResults(t *testing.T) {
	before := Resource{ID: "fn", Name: "Function", Service: "lambda", Type: "AWS::Lambda::Function",
		Region: "us-east-1", Properties: map[string]any{"MemorySize": 128.0}}
	after := before
	after.Properties = map[string]any{"MemorySize": 256.0}
	nat := Resource{ID: "nat", Service: "ec2", Type: "AWS::EC2::NatGateway"}
	queue := Resource{ID: "queue", Service: "sqs", Type: "AWS::SQS::Queue"}
	report := (Estimator{Region: "us-east-1"}).build(t.Context(), Inventory{
		Compare: true, Before: []Resource{before}, After: []Resource{queue, after, nat},
	}, nil, nil, func(_ context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
		requests := request.components
		if key.service == "AWSQueueService" {
			return catalogResult{}, errors.New("test network outage")
		}
		if key.region != "us-east-1" {
			t.Errorf("unexpected region %q", key.region)
		}
		if key.service == "AWSLambda" && len(requests) != 4 {
			t.Errorf("expected one catalog load for both states, got %d quotes", len(requests))
		}
		matches := make([]match, len(requests))
		for i, request := range requests {
			matches[i] = match{request.quote.usage, []Tier{{Price: 0.045}}}
		}
		return catalogResult{matches: matches}, nil
	})
	if report.Before == nil || len(*report.Before) != 1 || len(report.After) != 3 || report.Fallback != "us-east-1" {
		t.Fatalf("unexpected comparison: %+v", report)
	}
	oldFunction, newFunction := (*report.Before)[0], report.After[0]
	if oldFunction.Usage.Charges[0].Quantity != 125 || newFunction.Usage.Charges[0].Quantity != 250 ||
		newFunction.Usage.Charges[0].Input != "lambdaMs" || len(newFunction.Monthly.Missing) != 0 {
		t.Fatalf("unexpected Lambda estimates: %+v, %+v", oldFunction, newFunction)
	}
	if report.After[1].Monthly.Charges[0].Quantity != 730 || len(report.After[1].Usage.Missing) != 1 ||
		len(report.After[2].Usage.Missing) != 1 || len(report.After[2].Usage.Charges) != 0 {
		t.Fatalf("expected partial NAT estimate and unresolved queue: %+v", report.After)
	}
}

func TestUsageBilledResourcesHaveNoFixedRate(t *testing.T) {
	for _, r := range []Resource{
		{Type: "AWS::DynamoDB::Table", Properties: map[string]any{"BillingMode": "PAY_PER_REQUEST"}},
		{Type: "AWS::Logs::LogGroup"},
		{Type: "AWS::Cognito::UserPool"},
	} {
		var item Item
		requests := r.model(&item, Rule{})
		if len(item.Monthly.Missing) > 0 || len(item.Monthly.Charges) > 0 {
			t.Errorf("%s: expected no fixed charges: %+v", r.Type, item.Monthly)
		}
		if len(requests) == 0 && len(item.Usage.Missing) == 0 {
			t.Errorf("%s: expected metered usage or an explanation", r.Type)
		}
	}
}
