package cost

import (
	"context"
	"io"
	"strings"
	"testing"
)

func TestRulesPriceAnUnmodeledServiceInBothStates(t *testing.T) {
	rules, err := ReadRules(strings.NewReader(`{
		"AWS::Example::Cluster": {
			"monthly": [{"serviceCode":"AWSExample","usageType":"Instance:${Capacity.Class}","unit":"Hrs","quantity":730,"quantityFrom":"Capacity.Size"}],
			"perMillion": [{"serviceCode":"AWSExample","usageType":"Requests-Paid","unit":"Requests","quantity":1000000}]
		}
	}`))
	if err != nil {
		t.Fatal(err)
	}
	const priceFile = `SKU,TermType,Currency,Region Code,usageType,Unit,StartingRange,EndingRange,PricePerUnit
SMALL,OnDemand,USD,eu-west-1,Instance:small,Hrs,0,Inf,0.01
LARGE,OnDemand,USD,eu-west-1,Instance:large,Hrs,0,Inf,0.02
LARGE,OnDemand,USD,eu-west-1,Instance:large,Seconds,0,Inf,0.0001
REQ,OnDemand,USD,eu-west-1,EU-Requests-Paid,Requests,0,1000000,0.00001
REQ,OnDemand,USD,eu-west-1,EU-Requests-Paid,Requests,1000000,Inf,0.000005
`
	resource := func(size float64, class string) Resource {
		return Resource{
			ID: "cluster", Name: "cluster", Type: "AWS::Example::Cluster", Service: "example", Region: "eu-west-1",
			Properties: map[string]any{"Capacity": map[string]any{"Size": size, "Class": class}},
		}
	}
	report := (Estimator{Rules: rules}).build(t.Context(), Inventory{
		Compare: true, Before: []Resource{resource(2, "small")}, After: []Resource{resource(3, "large")},
	}, nil, nil, func(_ context.Context, key catalogKey, request catalogRequest) (catalogResult, error) {
		pending := request.components
		if key != (catalogKey{"AWSExample", "eu-west-1"}) || len(pending) != 4 {
			t.Errorf("expected one new catalog for both states, got %v with %d queries", key, len(pending))
		}
		return readCatalog(&io.LimitedReader{R: strings.NewReader(priceFile), N: 8192}, key.region, pending, false, false)
	})
	for _, side := range []struct {
		item  Item
		want  float64
		price float64
	}{{(*report.Before)[0], 1460, 0.01}, {report.After[0], 2190, 0.02}} {
		monthly, usage := side.item.Monthly, side.item.Usage
		if len(monthly.Missing) != 0 || len(monthly.Charges) != 1 || monthly.Charges[0].Quantity != side.want {
			t.Errorf("wrong cluster capacity price inputs: %+v", monthly)
		}
		if got := report.Rates[monthly.Charges[0].Rate][0].Price; got != side.price {
			t.Errorf("unexpected cluster rate: %v", got)
		}
		if len(usage.Missing) != 0 || len(usage.Charges) != 1 || usage.Charges[0].Quantity != 1e6 ||
			usage.Charges[0].Input != "operations" || len(report.Rates[usage.Charges[0].Rate]) != 2 {
			t.Errorf("wrong metered price inputs: %+v", usage)
		}
	}
}

func TestGlobalSKUWorksWithoutRegionalColumns(t *testing.T) {
	input := `SKU,TermType,Currency,Unit,StartingRange,EndingRange,PricePerUnit
TWO,OnDemand,USD,GB,0,Inf,0.25
FREE,OnDemand,USD,GB,0,Inf,0
`
	components := []pending{{quote: quote{sku: "TWO", unit: "GB"}}, {quote: quote{sku: "FREE", unit: "GB"}}}
	catalog, err := readCatalog(&io.LimitedReader{R: strings.NewReader(input), N: 4096}, "global", components, false, false)
	if err != nil {
		t.Fatal(err)
	}
	matches := catalog.matches
	if len(matches[0].tiers) != 1 || matches[0].tiers[0].Price != 0.25 ||
		len(matches[1].tiers) != 1 || matches[1].tiers[0].Price != 0 {
		t.Fatalf("unexpected global SKU results: %+v", matches)
	}
}

func TestRulesCanOverrideOneChargeCategory(t *testing.T) {
	item := Item{}
	rule := Rule{Monthly: []Meter{}}
	requests := (Resource{Type: "AWS::Lambda::Function", Properties: map[string]any{"CapacityProviderConfig": true}}).model(&item, rule)
	if len(requests) != 0 || len(item.Monthly.Missing) != 0 || len(item.Usage.Missing) == 0 {
		t.Fatalf("expected a zero monthly override and the default usage reason: %+v", item)
	}
	for _, invalid := range []string{
		`{"AWS::Example::Cluster":{"monthly":[{"serviceCode":"../other","sku":"S","unit":"Hrs","quantity":1}]}}`,
		`{"AWS::Example::Cluster":{"monthly":[{"serviceCode":"Other","sku":"S","unit":"Hrs"}]}}`,
		`{"AWS::Example::Cluster":{"monthly":[{"serviceCode":"Other","usageType":"U","unit":"Hrs","quantity":1,"priceRegion":"global"}]}}`,
	} {
		if _, err := ReadRules(strings.NewReader(invalid)); err == nil {
			t.Fatalf("accepted invalid rules %s", invalid)
		}
	}
}
