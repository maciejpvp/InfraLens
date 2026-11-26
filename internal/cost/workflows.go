package cost

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
)

const maxWorkflowInput = 1e12

type WorkflowStepSpec struct {
	ID       string              `json:"id"`
	Label    string              `json:"label"`
	Resource *ResourceRef        `json:"resource,omitempty"`
	Evidence []string            `json:"evidence,omitempty"`
	Meters   []WorkflowMeterSpec `json:"meters,omitempty"`
}

type ResourceRef struct {
	ID    string `json:"id,omitempty"`
	Name  string `json:"name,omitempty"`
	Type  string `json:"type,omitempty"`
	Stack string `json:"stack,omitempty"`
}

type WorkflowFactor struct {
	Label string   `json:"label"`
	Unit  string   `json:"unit,omitempty"`
	Value *float64 `json:"value"`
}

type WorkflowMeterSpec struct {
	Label    string          `json:"label"`
	Usage    string          `json:"usage,omitempty"`
	Class    string          `json:"storageClass,omitempty"`
	Rate     *WorkflowRate   `json:"rate,omitempty"`
	Quantity json.RawMessage `json:"quantity"`
	Evidence []string        `json:"evidence,omitempty"`
}

type WorkflowRate struct {
	Builtin string `json:"builtin,omitempty"`
	Meter
}

type WorkflowLink struct {
	From     string   `json:"from"`
	To       string   `json:"to"`
	Evidence []string `json:"evidence,omitempty"`
}

type WorkflowStateSpec struct {
	FrequencyEvidence string             `json:"frequencyEvidence,omitempty"`
	RunsPerUser       *float64           `json:"runsPerUser"`
	Steps             []WorkflowStepSpec `json:"steps"`
	Links             []WorkflowLink     `json:"links,omitempty"`
	Issues            []string           `json:"issues,omitempty"`
	Findings          []string           `json:"findings,omitempty"`
}

type WorkflowSpec struct {
	ID     string          `json:"id"`
	Label  string          `json:"label"`
	Before json.RawMessage `json:"before,omitempty"`
	After  json.RawMessage `json:"after,omitempty"`
}

type SharedMonthlySpec struct {
	Before []WorkflowStepSpec `json:"before,omitempty"`
	After  []WorkflowStepSpec `json:"after,omitempty"`
}

type WorkflowReport struct {
	ActiveUsers *float64       `json:"activeUsers"`
	Scenario    string         `json:"scenario,omitempty"`
	Baseline    string         `json:"baseline,omitempty"`
	Target      string         `json:"target,omitempty"`
	Items       []Workflow     `json:"items"`
	Shared      WorkflowShared `json:"sharedMonthly"`
}

type WorkflowShared struct {
	Before []WorkflowStep `json:"before,omitempty"`
	After  []WorkflowStep `json:"after,omitempty"`
}

type Workflow struct {
	ID     string         `json:"id"`
	Label  string         `json:"label"`
	Before *WorkflowState `json:"before"`
	After  *WorkflowState `json:"after"`
}

type WorkflowState struct {
	FrequencyEvidence string         `json:"frequencyEvidence,omitempty"`
	RunsPerUser       *float64       `json:"runsPerUser"`
	Steps             []WorkflowStep `json:"steps"`
	Links             []WorkflowLink `json:"links,omitempty"`
	Issues            []string       `json:"issues,omitempty"`
	Findings          []string       `json:"findings,omitempty"`
}

type WorkflowStep struct {
	ID         string          `json:"id"`
	Label      string          `json:"label"`
	ResourceID string          `json:"resourceId,omitempty"`
	Evidence   []string        `json:"evidence,omitempty"`
	Issue      string          `json:"issue,omitempty"`
	Meters     []WorkflowMeter `json:"meters"`
	resource   *Resource
}

type WorkflowMeter struct {
	Label     string           `json:"label"`
	Unit      string           `json:"unit,omitempty"`
	Factors   []WorkflowFactor `json:"factors"`
	Evidence  []string         `json:"evidence,omitempty"`
	Pricing   Metric           `json:"pricing"`
	Note      string           `json:"note,omitempty"`
	rate      *WorkflowRate
	usage     string
	class     string
	usesModel bool
}

func strictWorkflowJSON(raw json.RawMessage, value any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value)
}

func workflowNumber(value *float64) bool {
	return value == nil || (*value >= 0 && *value <= maxWorkflowInput)
}

func (ref ResourceRef) resolve(resources []Resource) (*Resource, error) {
	validID := strings.TrimSpace(ref.ID) != "" && ref.Name == "" && ref.Type == "" && ref.Stack == ""
	validName := ref.ID == "" && strings.TrimSpace(ref.Name) != "" && strings.TrimSpace(ref.Type) != ""
	if !validID && !validName {
		return nil, errors.New("expected resource id or name and type with an optional stack")
	}
	var match *Resource
	for i := range resources {
		r := &resources[i]
		if (validID && r.ID == ref.ID) || (validName && r.Name == ref.Name && r.Type == ref.Type && (ref.Stack == "" || r.Stack == ref.Stack)) {
			if match != nil {
				return nil, errors.New("resource selector matches multiple resources; specify the stack or id")
			}
			match = r
		}
	}
	return match, nil
}

func workflowFactors(raw json.RawMessage) ([]WorkflowFactor, error) {
	if len(raw) == 0 {
		return nil, errors.New("expected a quantity or null")
	}
	if bytes.HasPrefix(raw, []byte("[")) {
		var factors []WorkflowFactor
		if err := strictWorkflowJSON(raw, &factors); err != nil || len(factors) == 0 || len(factors) > 12 {
			return nil, errors.New("expected 1 to 12 quantity factors")
		}
		for _, factor := range factors {
			if strings.TrimSpace(factor.Label) == "" || !workflowNumber(factor.Value) {
				return nil, errors.New("expected named factors with nonnegative quantities or null")
			}
		}
		return factors, nil
	}
	var value *float64
	if err := json.Unmarshal(raw, &value); err != nil || !workflowNumber(value) {
		return nil, errors.New("expected a nonnegative quantity or null")
	}
	return []WorkflowFactor{{Label: "Quantity", Value: value}}, nil
}

func resolveWorkflowSteps(specs []WorkflowStepSpec, resources []Resource, shared bool) ([]WorkflowStep, error) {
	steps := make([]WorkflowStep, 0, len(specs))
	seen := map[string]bool{}
	for _, spec := range specs {
		if strings.TrimSpace(spec.ID) == "" || strings.TrimSpace(spec.Label) == "" || seen[spec.ID] {
			return nil, errors.New("steps require a distinct id and a label")
		}
		seen[spec.ID] = true
		step := WorkflowStep{ID: spec.ID, Label: spec.Label, Evidence: spec.Evidence, Meters: []WorkflowMeter{}}
		if spec.Resource != nil {
			match, err := spec.Resource.resolve(resources)
			if err != nil {
				return nil, fmt.Errorf("step %s: %w", spec.ID, err)
			}
			step.resource = match
			if match == nil {
				step.Issue = "Resource not found in this snapshot."
			} else {
				step.ResourceID = match.ID
				if match.Conditional {
					step.Issue = "Resource condition is unresolved in this snapshot."
				}
			}
		}
		for _, meter := range spec.Meters {
			factors, err := workflowFactors(meter.Quantity)
			if err != nil || strings.TrimSpace(meter.Label) == "" {
				return nil, fmt.Errorf("step %s: expected a meter label and a valid quantity", spec.ID)
			}
			unit, err := meter.validate(shared, spec.Resource != nil)
			if err != nil {
				return nil, fmt.Errorf("step %s: %w", spec.ID, err)
			}
			if len(factors) == 1 && factors[0].Unit == "" {
				factors[0].Unit = unit
			}
			step.Meters = append(step.Meters, WorkflowMeter{Label: meter.Label, Unit: unit, Factors: factors, Evidence: meter.Evidence, rate: meter.Rate, usage: meter.Usage, class: meter.Class})
		}
		if shared && (spec.Resource == nil || len(step.Meters) == 0) {
			return nil, fmt.Errorf("shared monthly step %s requires a resource and at least one meter", spec.ID)
		}
		steps = append(steps, step)
	}
	return steps, nil
}

func (m WorkflowMeterSpec) validate(shared, hasResource bool) (string, error) {
	if m.Rate != nil && m.Usage == "" && m.Class == "" {
		return "", m.Rate.validateWorkflow(shared, hasResource)
	}
	unit, known := workflowUsageUnits[m.Usage]
	if !known || m.Rate != nil {
		return "", errors.New("expected a supported usage kind or a legacy rate")
	}
	if (m.Usage != "unpriced" && !hasResource) || (m.Usage != "unpriced" && shared != strings.HasSuffix(m.Usage, "StoredBytes")) {
		return "", errors.New("usage kind requires a matching resource and a per-run or shared monthly scope")
	}
	if m.Class != "" && !s3ClassUsage(m.Usage) {
		return "", errors.New("storageClass applies only to S3 request, retrieval, and storage usage")
	}
	return unit, nil
}

func (r WorkflowRate) validateWorkflow(shared, hasResource bool) error {
	if r.Quantity != nil || r.QuantityFrom != "" {
		return errors.New("put workflow quantities on the meter, outside rate")
	}
	if r.Builtin != "" {
		if _, ok := usageLimits[r.Builtin]; !ok || shared || !hasResource ||
			r.ServiceCode != "" || r.SKU != "" || r.UsageType != "" || r.Unit != "" || r.Operation != "" || len(r.Attributes) > 0 || r.PriceRegion != "" {
			return errors.New("built-in usage meters require a resource and a supported input without a catalog selector")
		}
		return nil
	}
	one := float64(1)
	r.Quantity = &one
	return r.Meter.validate()
}

func resolveWorkflowState(raw json.RawMessage, resources []Resource) (*WorkflowState, error) {
	if len(raw) == 0 {
		return &WorkflowState{Steps: []WorkflowStep{}, Issues: []string{"Workflow state is unknown."}}, nil
	}
	if bytes.Equal(raw, []byte("null")) {
		return nil, nil
	}
	var spec WorkflowStateSpec
	if err := strictWorkflowJSON(raw, &spec); err != nil {
		return nil, err
	}
	if !workflowNumber(spec.RunsPerUser) || len(spec.Steps) == 0 {
		return nil, errors.New("expected a valid monthly frequency and at least one step")
	}
	steps, err := resolveWorkflowSteps(spec.Steps, resources, false)
	if err != nil {
		return nil, err
	}
	ids := map[string]bool{}
	for _, step := range steps {
		ids[step.ID] = true
	}
	links := map[[2]string]bool{}
	for _, link := range spec.Links {
		pair := [2]string{link.From, link.To}
		if !ids[link.From] || !ids[link.To] || link.From == link.To || links[pair] {
			return nil, errors.New("workflow links must be distinct and connect different existing steps")
		}
		links[pair] = true
	}
	return &WorkflowState{RunsPerUser: spec.RunsPerUser, FrequencyEvidence: spec.FrequencyEvidence, Steps: steps, Links: spec.Links, Issues: spec.Issues, Findings: spec.Findings}, nil
}

func (u *UsageFile) Workload(inventory Inventory) (*WorkflowReport, error) {
	if u == nil || u.Version != 2 {
		return nil, nil
	}
	report := &WorkflowReport{ActiveUsers: u.ActiveUsers, Scenario: u.Scenario, Baseline: u.Baseline, Target: u.Target, Items: []Workflow{}}
	seen := map[string]bool{}
	for _, spec := range u.Workflows {
		if strings.TrimSpace(spec.ID) == "" || strings.TrimSpace(spec.Label) == "" || seen[spec.ID] {
			return nil, errors.New("workflows require a distinct id and a label")
		}
		seen[spec.ID] = true
		after, err := resolveWorkflowState(spec.After, inventory.After)
		if err != nil {
			return nil, fmt.Errorf("workflow %s, After: %w", spec.ID, err)
		}
		var before *WorkflowState
		// Validate the other state even when the input represents only After.
		before, err = resolveWorkflowState(spec.Before, inventory.Before)
		if err != nil {
			return nil, fmt.Errorf("workflow %s, Before: %w", spec.ID, err)
		}
		if !inventory.Compare {
			before = nil
		}
		report.Items = append(report.Items, Workflow{ID: spec.ID, Label: spec.Label, Before: before, After: after})
	}
	if u.SharedMonthly != nil {
		var err error
		report.Shared.After, err = resolveWorkflowSteps(u.SharedMonthly.After, inventory.After, true)
		if err != nil {
			return nil, fmt.Errorf("shared monthly After: %w", err)
		}
		report.Shared.Before, err = resolveWorkflowSteps(u.SharedMonthly.Before, inventory.Before, true)
		if err != nil {
			return nil, fmt.Errorf("shared monthly Before: %w", err)
		}
		if !inventory.Compare {
			report.Shared.Before = nil
		}
	}
	return report, nil
}

func (meter *WorkflowMeter) quotes(step *WorkflowStep, modeled []pending) []pending {
	if step.Issue != "" {
		meter.Pricing.missing(step.Issue)
		return nil
	}
	if meter.usage != "" {
		return meter.semanticQuotes(step, modeled)
	}
	rate := meter.rate
	if rate.Builtin != "" {
		return meter.modeledQuotes(modeled, rate.Builtin)
	}
	return []pending{{metric: &meter.Pricing, quantity: 1, quote: quote{
		service: rate.ServiceCode, usage: rate.UsageType, unit: rate.Unit, operation: rate.Operation,
		sku: rate.SKU, region: rate.PriceRegion, attributes: rate.Attributes,
	}}}
}

func (meter *WorkflowMeter) modeledQuotes(modeled []pending, input string) []pending {
	meter.usesModel = true
	var requests []pending
	for _, component := range modeled {
		if component.input == input {
			requests = append(requests, pending{metric: &meter.Pricing, quote: component.quote, quantity: component.quantity / million})
		}
	}
	if len(requests) == 0 {
		meter.Pricing.missing("Usage dimension is unavailable for this resource.")
	}
	return requests
}

func reconcileShared(steps []WorkflowStep, items []Item) {
	byResource := map[string]map[string]bool{}
	for _, item := range items {
		rates := map[string]bool{}
		for _, charge := range item.Monthly.Charges {
			rates[charge.Rate] = true
		}
		byResource[item.ID] = rates
	}
	for i := range steps {
		step := &steps[i]
		rates := byResource[step.ResourceID]
		if rates == nil {
			continue
		}
		for j := range step.Meters {
			price := &step.Meters[j].Pricing
			price.Charges = slices.DeleteFunc(price.Charges, func(charge Charge) bool {
				if rates[charge.Rate] {
					step.Meters[j].Note = "Duplicate monthly charge; counted once."
					return true
				}
				rates[charge.Rate] = true
				return false
			})
		}
	}
}

// Exclude already-counted components in the total while keeping the reason visible.
func (w *WorkflowReport) reconcile(report *Report) {
	apply := func(shared []WorkflowStep, items []Item, before bool) {
		reconcileShared(shared, items)
		missing := make(map[string][]string, len(items))
		for _, item := range items {
			missing[item.ID] = item.Usage.Missing
		}
		for _, workflow := range w.Items {
			state := workflow.After
			if before {
				state = workflow.Before
			}
			if state == nil {
				continue
			}
			for i := range state.Steps {
				step := &state.Steps[i]
				for j := range step.Meters {
					meter := &step.Meters[j]
					if meter.usesModel {
						for _, reason := range missing[step.ResourceID] {
							meter.Pricing.missing(reason)
						}
					}
					slices.Sort(meter.Pricing.Missing)
					slices.SortFunc(meter.Pricing.Charges, func(a, b Charge) int {
						return strings.Compare(a.Rate, b.Rate)
					})
				}
			}
		}
	}
	apply(w.Shared.After, report.After, false)
	if report.Before != nil {
		apply(w.Shared.Before, *report.Before, true)
	}
}
