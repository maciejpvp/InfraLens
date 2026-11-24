package cost

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"maps"
	"slices"
	"strings"
)

// UsageFile contains workload units per incoming request, with optional state overrides.
type UsageFile struct {
	Version       int                `json:"version"`
	Scenario      string             `json:"scenario,omitempty"`
	Baseline      string             `json:"baseline,omitempty"`
	Target        string             `json:"target,omitempty"`
	Resources     []UsageEntry       `json:"resources,omitempty"`
	ActiveUsers   *float64           `json:"activeUsers,omitempty"`
	Workflows     []WorkflowSpec     `json:"workflows,omitempty"`
	SharedMonthly *SharedMonthlySpec `json:"sharedMonthly,omitempty"`
}

type usageInputs map[string]*float64

type UsageEntry struct {
	ID       string      `json:"id,omitempty"`
	Name     string      `json:"name,omitempty"`
	Type     string      `json:"type,omitempty"`
	Stack    string      `json:"stack,omitempty"`
	Common   usageInputs `json:"common,omitempty"`
	Before   usageInputs `json:"before,omitempty"`
	After    usageInputs `json:"after,omitempty"`
	Evidence []string    `json:"evidence,omitempty"`
}

type UsageDescription struct {
	Scenario string   `json:"scenario,omitempty"`
	Baseline string   `json:"baseline,omitempty"`
	Target   string   `json:"target,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

var usageLimits = map[string]float64{"operations": 1_000_000, "lambdaMs": 900_000, "reads": 1_000_000, "writes": 1_000_000}

func ReadUsage(file io.Reader) (*UsageFile, error) {
	input := &io.LimitedReader{R: file, N: (1 << 20) + 1}
	decoder := json.NewDecoder(input)
	decoder.DisallowUnknownFields()
	var config UsageFile
	if err := decoder.Decode(&config); err != nil {
		return nil, fmt.Errorf("invalid cost assumptions: %w", err)
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF || input.N == 0 {
		return nil, errors.New("expected one cost assumptions object of at most 1 MiB")
	}
	switch config.Version {
	case 1:
		if config.Resources == nil || config.Workflows != nil || config.SharedMonthly != nil || config.ActiveUsers != nil {
			return nil, errors.New("cost assumptions version 1 requires a resources array")
		}
	case 2:
		if config.Workflows == nil || config.Resources != nil || !workflowNumber(config.ActiveUsers) {
			return nil, errors.New("cost assumptions version 2 requires a workflows array and a valid user count")
		}
		return &config, nil
	default:
		return nil, errors.New("cost assumptions version must be 1 or 2")
	}
	for i := range config.Resources {
		if err := config.Resources[i].validate(); err != nil {
			return nil, fmt.Errorf("cost assumptions entry %d: %w", i+1, err)
		}
	}
	return &config, nil
}

func (e *UsageEntry) validate() error {
	switch {
	case e.ID != "" && (strings.TrimSpace(e.ID) == "" || e.Name != "" || e.Type != "" || e.Stack != ""):
		return errors.New("use an id or a name and type with an optional stack")
	case e.ID == "" && (strings.TrimSpace(e.Name) == "" || strings.TrimSpace(e.Type) == ""):
		return errors.New("expected a resource id or a name and type")
	case len(e.Common)+len(e.Before)+len(e.After) == 0:
		return errors.New("expected common, before or after usage values")
	}
	for _, values := range []usageInputs{e.Common, e.Before, e.After} {
		for key, value := range values {
			maximum, ok := usageLimits[key]
			if !ok {
				return fmt.Errorf("unknown usage input %q", key)
			}
			if value == nil || *value < 0 || *value > maximum {
				return fmt.Errorf("%s must be between 0 and %g", key, maximum)
			}
		}
	}
	return nil
}

type usageName struct{ stack, kind, name string }

type usageSnapshot struct {
	items   []Item
	byID    map[string]int
	byName  map[usageName][]int
	applied map[string]bool
}

func indexUsage(resources []Resource, items []Item) usageSnapshot {
	index := usageSnapshot{items: items, byID: map[string]int{}, byName: map[usageName][]int{}, applied: map[string]bool{}}
	for i := range items {
		index.byID[items[i].ID] = i
	}
	for _, resource := range resources {
		i, ok := index.byID[resource.ID]
		if !ok {
			continue
		}
		key := usageName{kind: resource.Type, name: resource.Name}
		index.byName[key] = append(index.byName[key], i)
		if resource.Stack != "" {
			key.stack = resource.Stack
			index.byName[key] = append(index.byName[key], i)
		}
	}
	return index
}

func (s usageSnapshot) find(entry UsageEntry) []int {
	if entry.ID != "" {
		if i, ok := s.byID[entry.ID]; ok {
			return []int{i}
		}
		return nil
	}
	return s.byName[usageName{entry.Stack, entry.Type, entry.Name}]
}

// Apply sets the imported defaults on the matching resource in each report state.
func (u *UsageFile) Apply(inventory Inventory, report *Report) error {
	usage := &UsageDescription{Scenario: u.Scenario, Baseline: u.Baseline, Target: u.Target}
	report.Usage = usage
	after := indexUsage(inventory.After, report.After)
	var before usageSnapshot
	if report.Before != nil {
		before = indexUsage(inventory.Before, *report.Before)
	}
	for i, entry := range u.Resources {
		matched := false
		for _, side := range []struct {
			name   string
			index  usageSnapshot
			values usageInputs
		}{{"Before", before, entry.Before}, {"After", after, entry.After}} {
			if len(entry.Common)+len(side.values) == 0 {
				continue
			}
			items := side.index.find(entry)
			if len(items) > 1 {
				return fmt.Errorf("cost assumptions entry %d matches multiple %s resources, specify a stack or resource id", i+1, side.name)
			}
			if len(items) == 0 {
				if len(side.values) > 0 {
					usage.Warnings = append(usage.Warnings, fmt.Sprintf("Entry %d matches no %s resource.", i+1, side.name))
				}
				continue
			}
			matched = true
			item := &side.index.items[items[0]]
			if side.index.applied[item.ID] {
				return fmt.Errorf("multiple cost assumptions entries match the same %s resource at entry %d", side.name, i+1)
			}
			side.index.applied[item.ID] = true
			item.Assumptions = make(map[string]float64, len(entry.Common)+len(side.values))
			for _, values := range []usageInputs{entry.Common, side.values} {
				for key, value := range values {
					item.Assumptions[key] = *value
				}
			}
			used := make(map[string]bool)
			for _, charge := range item.Usage.Charges {
				used[charge.Input] = true
				if charge.Input == "lambdaMs" {
					used["operations"] = true
				}
			}
			for _, key := range slices.Sorted(maps.Keys(item.Assumptions)) {
				if !used[key] {
					usage.Warnings = append(usage.Warnings, fmt.Sprintf("Entry %d, %s: %s has no priced charge.", i+1, side.name, key))
				}
			}
		}
		if !matched && len(entry.Before)+len(entry.After) == 0 {
			usage.Warnings = append(usage.Warnings, fmt.Sprintf("Entry %d matches no resource.", i+1))
		}
	}
	return nil
}
