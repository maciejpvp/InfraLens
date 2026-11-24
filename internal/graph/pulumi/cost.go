package pulumi

import (
	"encoding/json"
	"maps"
	"strings"

	"infralens/internal/cost"
	"infralens/internal/graph"
)

func (b *graphBuilder) collectCosts(inventory *cost.Inventory) {
	changes := make(map[string]graph.Change, len(b.graph.Nodes))
	for _, node := range b.graph.Nodes {
		changes[node.ID] = node.Change
	}
	before, after := map[string]resource{}, map[string]resource{}
	for _, entry := range b.resources {
		change := changes[id(entry.res.URN)]
		if entry.state != "after" && change != graph.Create {
			before[entry.res.URN] = entry.res
		}
		if entry.state != "before" && change != graph.Delete {
			after[entry.res.URN] = entry.res
		}
	}
	if b.preview {
		for urn, old := range before {
			if changes[id(urn)] != graph.Unchanged {
				continue
			}
			if current, ok := after[urn]; ok {
				if len(old.Inputs) > 0 {
					inputs := maps.Clone(old.Inputs)
					maps.Copy(inputs, current.Inputs)
					current.Inputs = inputs
				}
				if current.Provider == "" {
					current.Provider = old.Provider
				}
				after[urn] = current
			} else {
				after[urn] = old
			}
		}
		for urn, current := range after {
			if _, ok := before[urn]; !ok && changes[id(urn)] == graph.Unchanged {
				before[urn] = current
			}
		}
		inventory.Compare = true
		inventory.Before = costResources(before)
	}
	inventory.After = costResources(after)
}

func costResources(resources map[string]resource) []cost.Resource {
	var priced []cost.Resource
	functions := map[string]cost.Resource{}
	for _, res := range resources {
		provider, path, _ := strings.Cut(res.Type, ":")
		if provider != "aws" && provider != "aws-native" {
			continue
		}
		parts := strings.Split(res.URN, "::")
		properties := make(map[string]any)
		for _, fields := range []map[string]json.RawMessage{res.Outputs, res.Inputs} {
			for key, raw := range fields {
				if string(raw) == "null" {
					continue
				}
				var value any
				if json.Unmarshal(raw, &value) == nil {
					if value == unknownValue {
						value = nil
					}
					properties[key] = value
				}
			}
		}
		region, _ := properties["region"].(string)
		if !cost.ValidRegion(region) {
			if separator := strings.LastIndex(res.Provider, "::"); separator >= 0 {
				provider := resources[res.Provider[:separator]]
				region = scalar(provider.Inputs["region"])
				if !cost.ValidRegion(region) {
					region = scalar(provider.Outputs["region"])
				}
			}
		}
		if !cost.ValidRegion(region) {
			arn, _ := properties["arn"].(string)
			fields := strings.SplitN(arn, ":", 6)
			if len(fields) == 6 && fields[0] == "arn" {
				region = fields[3]
			}
		}
		service := awsService(path)
		switch service {
		case "scheduler":
			service = "eventbridge"
		case "cloudwatch":
			if res.Type == "aws:cloudwatch/eventBus:EventBus" {
				service = "eventbridge"
			}
		case "ebs":
			service = "ec2"
		}
		entry := cost.Resource{
			ID: id(res.URN), Name: parts[len(parts)-1], Type: res.Type, Service: service,
			Region: region, Stack: parts[1] + "/" + strings.TrimPrefix(parts[0], "urn:pulumi:"), Properties: properties,
		}
		priced = append(priced, entry)
		if res.Type == lambdaType {
			for _, name := range []string{res.ID, scalar(res.Outputs["name"]), scalar(res.Inputs["name"]), scalar(res.Outputs["arn"])} {
				if name != "" {
					functions[region+"\x00"+name] = entry
				}
			}
		}
	}
	for i := range priced {
		entry := &priced[i]
		if entry.Type == "aws:lambda/provisionedConcurrencyConfig:ProvisionedConcurrencyConfig" || entry.Type == "aws:lambda/alias:Alias" {
			name, _ := entry.Properties["functionName"].(string)
			if function, ok := functions[entry.Region+"\x00"+name]; ok {
				cost.LinkLambda(entry, function)
			}
		}
	}
	return priced
}
