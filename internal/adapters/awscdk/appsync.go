package awscdk

import "laytrace/internal/graph"

const (
	appsyncAPI      = "AWS::AppSync::GraphQLApi"
	appsyncSource   = "AWS::AppSync::DataSource"
	appsyncFunction = "AWS::AppSync::FunctionConfiguration"
	appsyncResolver = "AWS::AppSync::Resolver"
)

func (doc template) linkAppSync(b *stackGraph) {
	owners := map[string]string{}
	sources := map[[2]string]string{}
	targets := map[string]struct{ id, property string }{}
	for id, res := range doc.Resources {
		switch res.Type {
		case appsyncSource, appsyncFunction, appsyncResolver, "AWS::AppSync::GraphQLSchema", "AWS::AppSync::ApiKey":
		default:
			continue
		}
		api := doc.resolve(res.Properties["ApiId"], appsyncAPI, "", "ApiId")
		if api == "" {
			continue
		}
		owners[id] = api
		b.link(id, api, graph.DependsOn, id, graph.AppSyncAPISource, "Properties.ApiId")
		if res.Type == appsyncSource {
			if name, ok := res.Properties["Name"].(string); ok && name != "" {
				key := [2]string{api, name}
				if _, duplicate := sources[key]; duplicate {
					sources[key] = ""
				} else {
					sources[key] = id
				}
			}
			target, property := doc.appSyncTarget(res.Properties)
			if target != "" {
				targets[id] = struct{ id, property string }{target, property}
			}
		}
	}
	dataSource := func(api string, props map[string]any) string {
		value := props["DataSourceName"]
		if name, ok := value.(string); ok {
			return sources[[2]string{api, name}]
		}
		if id := doc.resolve(value, appsyncSource, "Name"); owners[id] == api {
			return id
		}
		return ""
	}
	described := map[[2]string]bool{}
	for id, api := range owners {
		res := doc.Resources[id]
		if res.Type != appsyncResolver {
			continue
		}
		typeName, _ := res.Properties["TypeName"].(string)
		fieldName, _ := res.Properties["FieldName"].(string)
		label := graph.AppSyncField(typeName, fieldName)
		if label == "" {
			continue
		}
		link := func(source, property string) {
			if target := targets[source].id; target != "" {
				described[[2]string{api, target}] = true
				b.linkEvidence(api, target, graph.ConnectsTo, graph.Evidence{
					Source: "AppSync resolver", Resource: b.ids[id], Property: property, Label: label,
				})
			}
		}
		switch res.Properties["Kind"] {
		case nil, "", "UNIT":
			link(dataSource(api, res.Properties), "Properties.DataSourceName")
		case "PIPELINE":
			pipeline, _ := res.Properties["PipelineConfig"].(map[string]any)
			functions, _ := pipeline["Functions"].([]any)
			for _, ref := range functions {
				fn := doc.resolve(ref, appsyncFunction, "FunctionId")
				if owners[fn] == api {
					link(dataSource(api, doc.Resources[fn].Properties), "Properties.PipelineConfig.Functions")
				}
			}
		}
	}
	for source, target := range targets {
		api := owners[source]
		label := ""
		if !described[[2]string{api, target.id}] {
			label = "AppSync data source"
		}
		b.linkEvidence(api, target.id, graph.ConnectsTo, graph.Evidence{
			Source: "AppSync data source", Resource: b.ids[source], Property: target.property, Label: label,
		})
	}
}

func (doc template) appSyncTarget(props map[string]any) (target, property string) {
	switch props["Type"] {
	case "AWS_LAMBDA":
		cfg, _ := props["LambdaConfig"].(map[string]any)
		return doc.resolve(cfg["LambdaFunctionArn"], lambdaFunction, "Arn"), "Properties.LambdaConfig.LambdaFunctionArn"
	case "AMAZON_DYNAMODB":
		cfg, _ := props["DynamoDBConfig"].(map[string]any)
		return doc.resolve(cfg["TableName"], dynamoTable, ""), "Properties.DynamoDBConfig.TableName"
	}
	return "", ""
}
