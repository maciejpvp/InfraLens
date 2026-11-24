// Package cost estimates AWS on-demand charges from IaC resource snapshots.
package cost

import (
	"cmp"
	"context"
	"fmt"
	"maps"
	"os"
	"regexp"
	"slices"
	"sync"
	"time"
)

type Resource struct {
	ID, Name, Type, Service, Region, Stack string
	Properties                             map[string]any
	Conditional                            bool
}

type Inventory struct {
	Before, After []Resource
	Compare       bool
	BeforeIssues  []string
}

type Tier struct {
	UpTo  *float64 `json:"upTo"`
	Price float64  `json:"price"`
}

type Charge struct {
	Rate     string  `json:"rate"`
	Quantity float64 `json:"quantity"`
	Input    string  `json:"input,omitempty"`
}

type Metric struct {
	Charges []Charge `json:"charges,omitempty"`
	Missing []string `json:"missing,omitempty"`
}

type Item struct {
	ID          string             `json:"id"`
	Name        string             `json:"name"`
	Service     string             `json:"service"`
	Monthly     Metric             `json:"monthly"`
	Usage       Metric             `json:"usage"`
	Assumptions map[string]float64 `json:"assumptions,omitempty"`
}

type PriceRange struct {
	Family string  `json:"family,omitempty"`
	Unit   string  `json:"unit"`
	Min    float64 `json:"min"`
	Max    float64 `json:"max"`
}

type Catalog struct {
	Code   string       `json:"code,omitempty"`
	Region string       `json:"region"`
	Rates  []PriceRange `json:"rates,omitempty"`
	Issue  string       `json:"issue,omitempty"`
}

type Report struct {
	Date         string               `json:"date"`
	Regions      []string             `json:"regions"`
	Fallback     string               `json:"fallback,omitempty"`
	Before       *[]Item              `json:"before,omitempty"`
	BeforeIssues []string             `json:"beforeIssues,omitempty"`
	After        []Item               `json:"after"`
	Rates        map[string][]Tier    `json:"rates"`
	Catalogs     map[string][]Catalog `json:"catalogs,omitempty"`
	Usage        *UsageDescription    `json:"usageAssumptions,omitempty"`
	Workflows    *WorkflowReport      `json:"workflows,omitempty"`
}

var regionPattern = regexp.MustCompile(`^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]+$`)

func ValidRegion(region string) bool { return regionPattern.MatchString(region) }

func fallbackRegion(explicit string) string {
	for _, value := range []string{explicit, os.Getenv("AWS_REGION"), os.Getenv("AWS_DEFAULT_REGION")} {
		if ValidRegion(value) {
			return value
		}
	}
	return "us-east-1"
}

type quote struct {
	service, usage, unit, operation string
	sku, region                     string
	attributes                      map[string]string
}

type pending struct {
	metric   *Metric
	quote    quote
	quantity float64
	input    string
}

type catalogKey struct{ service, region string }

func Build(ctx context.Context, inventory Inventory, region string, rules Rules, workflows *WorkflowReport) *Report {
	var offers offerIndex
	needsIndex := func(resources []Resource) bool {
		return slices.ContainsFunc(resources, func(resource Resource) bool {
			return !isSupportingResource(resource)
		})
	}
	if needsIndex(inventory.After) || (inventory.Compare && needsIndex(inventory.Before)) {
		indexContext, cancel := context.WithTimeout(ctx, 8*time.Second)
		offers, _ = publicOffers(indexContext)
		cancel()
	}
	return build(ctx, inventory, region, rules, offers, workflows, publicCatalog)
}

func build(ctx context.Context, inventory Inventory, region string, rules Rules, offers offerIndex, workflows *WorkflowReport, load catalogLoader) *Report {
	report := &Report{
		Date: time.Now().UTC().Format("2006-01-02"), Rates: map[string][]Tier{},
		BeforeIssues: inventory.BeforeIssues, Catalogs: map[string][]Catalog{}, Workflows: workflows,
	}
	requests := map[catalogKey]*catalogRequest{}
	requestFor := func(key catalogKey, service string) *catalogRequest {
		request := requests[key]
		if request == nil {
			request = &catalogRequest{services: map[string]bool{}}
			requests[key] = request
		}
		request.services[service] = true
		return request
	}
	noOffer := map[catalogKey]bool{}
	regions := map[string]bool{}
	fallback := fallbackRegion(region)
	queue := func(components []pending, resourceRegion, service string) {
		for _, component := range components {
			priceRegion := component.quote.region
			if priceRegion == "" {
				priceRegion = resourceRegion
			}
			regions[priceRegion] = true
			key := catalogKey{component.quote.service, priceRegion}
			label := service
			if label == "" {
				label = offerName(component.quote.service)
			}
			request := requestFor(key, label)
			request.components = append(request.components, component)
		}
	}
	prepare := func(resources []Resource, states [][]WorkflowStep) []Item {
		resources = slices.Clone(resources)
		slices.SortFunc(resources, func(a, b Resource) int {
			return cmp.Compare(a.ID, b.ID)
		})
		items := make([]Item, len(resources))
		modeled := map[string][]pending{}
		for i, r := range resources {
			r.Service = serviceName(r.Service)
			items[i] = Item{ID: r.ID, Name: r.Name, Service: r.Service}
			if !ValidRegion(r.Region) {
				r.Region = fallback
				report.Fallback = fallback
			}
			regions[r.Region] = true
			components := model(r, &items[i], rules[r.Type])
			var codes []string
			if !isSupportingResource(r) {
				codes = offers.codes(r.Service)
				for _, code := range codes {
					requestFor(catalogKey{code, r.Region}, r.Service)
				}
				if len(codes) == 0 && len(components) == 0 {
					noOffer[catalogKey{r.Service, r.Region}] = true
				}
			}
			queue(components, r.Region, r.Service)
			if len(states) > 0 {
				modeled[r.ID] = components
			}
		}
		for _, steps := range states {
			for i := range steps {
				step := &steps[i]
				region, service := fallback, ""
				if step.resource != nil {
					service = serviceName(step.resource.Service)
					if ValidRegion(step.resource.Region) {
						region = step.resource.Region
					}
				}
				for j := range step.Meters {
					queue(workflowQuotes(step, &step.Meters[j], modeled[step.ResourceID]), region, service)
				}
			}
		}
		return items
	}
	var beforeSteps, afterSteps [][]WorkflowStep
	if workflows != nil {
		beforeSteps, afterSteps = append(beforeSteps, workflows.Shared.Before), append(afterSteps, workflows.Shared.After)
		for _, workflow := range workflows.Items {
			if workflow.Before != nil {
				beforeSteps = append(beforeSteps, workflow.Before.Steps)
			}
			if workflow.After != nil {
				afterSteps = append(afterSteps, workflow.After.Steps)
			}
		}
	}
	report.After = prepare(inventory.After, afterSteps)
	if inventory.Compare {
		before := prepare(inventory.Before, beforeSteps)
		report.Before = &before
	}
	report.Regions = slices.Sorted(maps.Keys(regions))
	for key := range noOffer {
		issue := "No matching AWS Price List offer."
		if offers == nil {
			issue = "AWS Price List service index unavailable."
		}
		report.Catalogs[key.service] = append(report.Catalogs[key.service], Catalog{Region: key.region, Issue: issue})
	}

	var group sync.WaitGroup
	var lock sync.Mutex
	workers := make(chan struct{}, 4)
	for key, request := range requests {
		group.Go(func() {
			var result catalogResult
			var err error
			select {
			case workers <- struct{}{}:
				result, err = load(ctx, key, *request)
				<-workers
			case <-ctx.Done():
				err = ctx.Err()
			}
			lock.Lock()
			defer lock.Unlock()
			catalog := Catalog{Code: key.service, Region: key.region, Rates: result.rates}
			switch {
			case err != nil:
				catalog.Issue = "AWS price catalog unavailable."
			case result.region != "":
				catalog.Region = result.region
				if len(catalog.Rates) == 0 {
					catalog.Issue = "AWS returned no On-Demand USD rates for this scope."
				}
			}
			for service := range request.services {
				if !slices.ContainsFunc(report.Catalogs[service], func(existing Catalog) bool {
					return existing.Code == catalog.Code && existing.Region == catalog.Region
				}) {
					report.Catalogs[service] = append(report.Catalogs[service], catalog)
				}
			}
			for i, component := range request.components {
				switch {
				case err != nil:
					component.metric.missing(fmt.Sprintf("AWS price catalog unavailable (%s).", key.region))
				case len(result.matches[i].tiers) == 0:
					component.metric.missing(fmt.Sprintf("AWS rate unavailable (%s, %s).", key.service, key.region))
				default:
					match := result.matches[i]
					rate := key.service + "/" + key.region + "/" + match.sku + "/" + component.quote.unit
					report.Rates[rate] = match.tiers
					component.metric.Charges = append(component.metric.Charges, Charge{rate, component.quantity, component.input})
				}
			}
		})
	}
	group.Wait()
	for _, catalogs := range report.Catalogs {
		slices.SortFunc(catalogs, func(a, b Catalog) int {
			if byCode := cmp.Compare(a.Code, b.Code); byCode != 0 {
				return byCode
			}
			return cmp.Compare(a.Region, b.Region)
		})
	}
	sortMetrics := func(items []Item) {
		for i := range items {
			for _, metric := range []*Metric{&items[i].Monthly, &items[i].Usage} {
				slices.Sort(metric.Missing)
				slices.SortFunc(metric.Charges, func(a, b Charge) int {
					return cmp.Compare(a.Rate, b.Rate)
				})
			}
		}
	}
	sortMetrics(report.After)
	if report.Before != nil {
		sortMetrics(*report.Before)
	}
	if workflows != nil {
		workflows.reconcile(report)
	}
	return report
}

func (m *Metric) missing(reason string) {
	if !slices.Contains(m.Missing, reason) {
		m.Missing = append(m.Missing, reason)
	}
}

func serviceName(service string) string {
	switch service {
	case "elasticloadbalancing", "elasticloadbalancingv2", "lb", "alb", "elb":
		return "elb"
	case "":
		return "aws"
	default:
		return service
	}
}
