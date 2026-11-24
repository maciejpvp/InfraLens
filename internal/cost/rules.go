package cost

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// Rules supplies pricing assumptions keyed by the resource type used by the IaC provider.
type Rules map[string]Rule

type Rule struct {
	Monthly    []Meter `json:"monthly"`
	PerMillion []Meter `json:"perMillion"`
}

type Meter struct {
	ServiceCode  string            `json:"serviceCode"`
	SKU          string            `json:"sku"`
	UsageType    string            `json:"usageType"`
	Unit         string            `json:"unit"`
	Operation    string            `json:"operation"`
	Attributes   map[string]string `json:"attributes"`
	PriceRegion  string            `json:"priceRegion"`
	Quantity     *float64          `json:"quantity"`
	QuantityFrom string            `json:"quantityFrom"`
}

var serviceCodePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*$`)

func ReadRules(r io.Reader) (Rules, error) {
	const maxSize = 1 << 20
	input := &io.LimitedReader{R: r, N: maxSize + 1}
	decoder := json.NewDecoder(input)
	decoder.DisallowUnknownFields()
	var rules Rules
	if err := decoder.Decode(&rules); err != nil {
		return nil, fmt.Errorf("invalid cost rules: %w", err)
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF || input.N == 0 || rules == nil {
		return nil, errors.New("expected one cost rules object of at most 1 MiB")
	}
	for kind, rule := range rules {
		if strings.TrimSpace(kind) == "" || (rule.Monthly == nil && rule.PerMillion == nil) {
			return nil, fmt.Errorf("cost rule for %q must specify monthly or perMillion", kind)
		}
		for _, meters := range [][]Meter{rule.Monthly, rule.PerMillion} {
			for i, meter := range meters {
				if err := meter.validate(); err != nil {
					return nil, fmt.Errorf("cost rule for %q, meter %d: %w", kind, i+1, err)
				}
			}
		}
	}
	return rules, nil
}

func (m Meter) validate() error {
	switch {
	case !serviceCodePattern.MatchString(m.ServiceCode):
		return errors.New("expected an AWS Price List serviceCode")
	case strings.TrimSpace(m.Unit) == "" || (strings.TrimSpace(m.SKU) == "" && strings.TrimSpace(m.UsageType) == ""):
		return errors.New("expected unit and either sku or usageType")
	case m.PriceRegion == "global" && strings.TrimSpace(m.SKU) == "":
		return errors.New("global prices require an exact sku")
	case m.PriceRegion != "" && m.PriceRegion != "global" && !ValidRegion(m.PriceRegion):
		return errors.New("expected an AWS priceRegion or global")
	case m.Quantity == nil || *m.Quantity < 0 || *m.Quantity > 1e12:
		return errors.New("expected a nonnegative quantity up to one trillion")
	case strings.HasPrefix(m.QuantityFrom, ".") || strings.HasSuffix(m.QuantityFrom, ".") || strings.Contains(m.QuantityFrom, ".."):
		return errors.New("expected a dot-separated quantityFrom property path")
	}
	return nil
}

var propertyReference = regexp.MustCompile(`\$\{([A-Za-z0-9_.-]+)\}`)

func (r Resource) propertyOwner(path string) (Resource, string) {
	for {
		part, rest, nested := strings.Cut(path, ".")
		if !nested {
			return r, part
		}
		r, path = r.object(part), rest
	}
}

func (r Resource) resolveText(value string) (string, bool) {
	resolved := true
	result := propertyReference.ReplaceAllStringFunc(value, func(ref string) string {
		owner, property := r.propertyOwner(ref[2 : len(ref)-1])
		text := owner.stringOr("", property)
		resolved = resolved && text != ""
		return text
	})
	return result, resolved
}

func (b *modelBuilder) custom(metric *Metric, meters []Meter, input string) {
	for _, meter := range meters {
		quantity := *meter.Quantity
		if meter.QuantityFrom != "" {
			owner, property := b.resource.propertyOwner(meter.QuantityFrom)
			value := owner.numberOr(-1, property)
			if value < 0 {
				metric.missing("A cost rule quantity property is unresolved.")
				continue
			}
			quantity *= value
		}
		usage, resolved := b.resource.resolveText(meter.UsageType)
		attributes := make(map[string]string, len(meter.Attributes))
		for name, value := range meter.Attributes {
			text, ok := b.resource.resolveText(value)
			attributes[name] = text
			resolved = resolved && ok
		}
		if !resolved {
			metric.missing("A cost rule pricing property is unresolved.")
			continue
		}
		b.add(metric, quote{
			service: meter.ServiceCode, sku: meter.SKU, usage: usage, unit: meter.Unit,
			operation: meter.Operation, attributes: attributes, region: meter.PriceRegion,
		}, quantity, input)
	}
}
