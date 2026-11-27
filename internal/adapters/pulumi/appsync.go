package pulumi

import (
	"encoding/json"
	"strings"

	"laytrace/internal/graph"
)

const (
	appsyncAPIType      = "aws:appsync/graphQLApi:GraphQLApi"
	appsyncSourceType   = "aws:appsync/dataSource:DataSource"
	appsyncFunctionType = "aws:appsync/function:Function"
	appsyncResolverType = "aws:appsync/resolver:Resolver"
)

type appSyncTarget struct {
	urn, property string
}

func (a *awsResolver) linkAppSync(resources []resource) {
	owners := map[string]string{}
	sources, functions := map[[2]string]string{}, map[[2]string]string{}
	targets := map[string]appSyncTarget{}
	index := func(entries map[[2]string]string, api, value, urn string) {
		if value == "" || value == "[secret]" || strings.Contains(value, unknownValue) {
			return
		}
		key := [2]string{api, value}
		if previous, exists := entries[key]; exists && previous != urn {
			entries[key] = ""
		} else {
			entries[key] = urn
		}
	}
	for _, r := range resources {
		switch r.Type {
		case appsyncSourceType, appsyncFunctionType, appsyncResolverType, "aws:appsync/apiKey:ApiKey":
		default:
			continue
		}
		api := a.resolve(r, "apiId", appsyncAPIType)
		if api == "" {
			continue
		}
		owners[r.URN] = api
		property := "inputs.apiId"
		if unavailable(r.Inputs["apiId"]) {
			property = "propertyDependencies.apiId"
		}
		a.relate(r.URN, api, graph.DependsOn, graph.Evidence{
			Source: graph.AppSyncAPISource, Resource: r.URN, Property: property,
		})
		switch r.Type {
		case appsyncSourceType:
			index(sources, api, scalar(r.Inputs["name"]), r.URN)
			index(sources, api, scalar(r.Outputs["name"]), r.URN)
			if target := a.appSyncTarget(r); target.urn != "" {
				targets[r.URN] = target
			}
		case appsyncFunctionType:
			index(functions, api, scalar(r.Outputs["functionId"]), r.URN)
			if apiID := a.byURN[api].ID; apiID != "" {
				if functionID, ok := strings.CutPrefix(r.ID, apiID+"-"); ok {
					index(functions, api, functionID, r.URN)
				}
			}
		}
	}
	dataSource := func(api string, r resource) string {
		raw := r.Inputs["dataSource"]
		if unavailable(raw) {
			if urn := a.dependency(r, "dataSource", appsyncSourceType); owners[urn] == api {
				return urn
			}
			return ""
		}
		return sources[[2]string{api, scalar(raw)}]
	}

	described := map[[2]string]bool{}
	for urn, api := range owners {
		r := a.byURN[urn]
		if r.Type != appsyncResolverType {
			continue
		}
		label := graph.AppSyncField(scalar(r.Inputs["type"]), scalar(r.Inputs["field"]))
		if label == "" {
			continue
		}
		link := func(source, property string) {
			if target := targets[source].urn; target != "" {
				described[[2]string{api, target}] = true
				a.flow(api, target, graph.ConnectsTo, graph.Evidence{Resource: urn, Property: property, Label: label})
			}
		}
		switch scalar(r.Inputs["kind"]) {
		case "", "UNIT":
			property := "inputs.dataSource"
			if unavailable(r.Inputs["dataSource"]) {
				property = "propertyDependencies.dataSource"
			}
			link(dataSource(api, r), property)
		case "PIPELINE":
			var pipeline struct{ Functions []json.RawMessage }
			raw := r.Inputs["pipelineConfig"]
			if json.Unmarshal(raw, &pipeline) == nil {
				for _, value := range pipeline.Functions {
					fn := functions[[2]string{api, scalar(value)}]
					link(dataSource(api, a.byURN[fn]), "inputs.pipelineConfig.functions")
				}
			}
			// Whole-property dependencies cannot identify an individual step in a partially known list.
			if unavailable(raw) && (len(pipeline.Functions) == 0 ||
				(len(pipeline.Functions) == 1 && unavailable(pipeline.Functions[0]))) {
				if fn := a.dependency(r, "pipelineConfig", appsyncFunctionType); owners[fn] == api {
					link(dataSource(api, a.byURN[fn]), "propertyDependencies.pipelineConfig")
				}
			}
		}
	}
	for urn, target := range targets {
		api := owners[urn]
		label := ""
		if !described[[2]string{api, target.urn}] {
			label = "AppSync data source"
		}
		a.flow(api, target.urn, graph.ConnectsTo, graph.Evidence{Resource: urn, Property: target.property, Label: label})
	}
}

func (a *awsResolver) appSyncTarget(r resource) appSyncTarget {
	var config, field, kind string
	switch scalar(r.Inputs["type"]) {
	case "AWS_LAMBDA":
		config, field, kind = "lambdaConfig", "functionArn", lambdaType
	case "AMAZON_DYNAMODB":
		config, field, kind = "dynamodbConfig", "tableName", tableType
	default:
		return appSyncTarget{}
	}
	raw := r.Inputs[config]
	var values map[string]json.RawMessage
	_ = json.Unmarshal(raw, &values)
	value := values[field]
	if unavailable(value) && (unavailable(raw) || len(value) != 0) {
		return appSyncTarget{a.dependency(r, config, kind), "propertyDependencies." + config}
	}
	return appSyncTarget{a.find(scalar(value), kind), "inputs." + config + "." + field}
}
