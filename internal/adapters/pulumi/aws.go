package pulumi

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"

	"infralens/internal/graph"
)

const unknownValue = "04da6b54-80e4-46f7-96ec-b56ff0331ba9"

func unavailable(raw json.RawMessage) bool {
	return len(raw) == 0 || string(raw) == "null" || bytes.Contains(raw, []byte(`"`+unknownValue+`"`))
}

func scalar(raw json.RawMessage) string {
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}

// awsRelations uses exact, unambiguous identifiers from typed AWS properties.
// Inputs and identifiers stay inside the adapter; evidence includes allowlisted descriptions.
func awsRelations(resources []resourceState, link func(string, string, graph.Kind, string, graph.Evidence)) {
	for _, state := range []string{"", "before", "after"} {
		index := map[string]string{}
		typesByURN := map[string]string{}
		byURN := map[string]resource{}
		ambiguous := map[string]bool{}
		add := func(kind, value, urn string) {
			if value == "" || value == "[secret]" || strings.Contains(value, unknownValue) {
				return
			}
			key := kind + "\x00" + value
			if previous, ok := index[key]; ok && previous != urn {
				ambiguous[key] = true
			}
			index[key] = urn
		}
		for _, entry := range resources {
			if entry.state != state && !(state != "" && entry.state == "") {
				continue
			}
			r := entry.res
			typesByURN[r.URN] = r.Type
			byURN[r.URN] = r
			for _, value := range []string{r.ID, scalar(r.Outputs["arn"]), scalar(r.Outputs["name"]), scalar(r.Outputs["bucket"]), scalar(r.Outputs["url"]), scalar(r.Outputs["streamArn"]), scalar(r.Inputs["name"]), scalar(r.Inputs["bucket"])} {
				add(r.Type, value, r.URN)
			}
		}
		find := func(value string, types ...string) string {
			if value == "" {
				return ""
			}
			result := ""
			for _, kind := range types {
				key := kind + "\x00" + value
				if ambiguous[key] {
					return ""
				}
				if urn := index[key]; urn != "" {
					if result != "" && result != urn {
						return ""
					}
					result = urn
				}
			}
			return result
		}
		bucket := func(value string) string { return find(value, "aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2") }
		dependency := func(r resource, property string, types ...string) string {
			result := ""
			for _, urn := range r.PropertyDependencies[property] {
				kind, ok := typesByURN[urn]
				if !ok {
					return ""
				}
				for _, targetType := range types {
					if kind == targetType {
						if result != "" && result != urn {
							return ""
						}
						result = urn
					}
				}
			}
			return result
		}
		resolve := func(r resource, field string, types ...string) string {
			if unavailable(r.Inputs[field]) {
				return dependency(r, field, types...)
			}
			return find(scalar(r.Inputs[field]), types...)
		}
		owner, label, details := "", "", ""
		flow := func(from, to, property string, kind graph.Kind) {
			if from != "" && to != "" && from != to {
				link(from, to, kind, state, graph.Evidence{Source: "aws_rule", Property: property, Resource: id(owner), Label: label, Details: details})
			}
		}
		for _, entry := range resources {
			if entry.state != state {
				continue
			}
			r := entry.res
			owner = r.URN
			label, details = "", ""
			switch r.Type {
			case "aws:s3/bucketNotification:BucketNotification":
				from := resolve(r, "bucket", "aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2")
				for _, rule := range []struct{ field, key, kind string }{{"queues", "queueArn", "aws:sqs/queue:Queue"}, {"lambdaFunctions", "lambdaFunctionArn", "aws:lambda/function:Function"}, {"topics", "topicArn", "aws:sns/topic:Topic"}} {
					var destinations []map[string]json.RawMessage
					if json.Unmarshal(r.Inputs[rule.field], &destinations) != nil {
						if unavailable(r.Inputs[rule.field]) {
							label = "S3 events · unknown"
							details = "events: unknown"
							flow(from, dependency(r, rule.field, rule.kind), "propertyDependencies.bucket + propertyDependencies."+rule.field, graph.ConnectsTo)
						}
						continue
					}
					for _, destination := range destinations {
						to := find(scalar(destination[rule.key]), rule.kind)
						kind := graph.Triggers
						property := "inputs.bucket + inputs." + rule.field + "[]." + rule.key
						if unavailable(r.Inputs["bucket"]) || unavailable(destination[rule.key]) {
							kind = graph.ConnectsTo
							property = "inputs." + rule.field + " + propertyDependencies.bucket + propertyDependencies." + rule.field
							// A whole-list dependency cannot identify individual unknown destinations.
							if unavailable(destination[rule.key]) && len(destinations) == 1 {
								to = dependency(r, rule.field, rule.kind)
							}
						}
						label = eventLabel(destination["events"], "S3 events · unknown")
						details = detailFields(destination, "events", "filterPrefix", "filterSuffix")
						if len(destination["events"]) == 0 || unavailable(destination["events"]) {
							kind = graph.ConnectsTo
						}
						if string(destination["events"]) == "[]" {
							continue
						}
						flow(from, to, property, kind)
					}
				}
			case "aws:apigatewayv2/integration:Integration":
				if scalar(r.Inputs["integrationType"]) != "AWS_PROXY" {
					continue
				}
				from := resolve(r, "apiId", "aws:apigatewayv2/api:Api")
				to := resolve(r, "integrationUri", "aws:lambda/function:Function")
				property := "inputs.apiId + inputs.integrationUri"
				if unavailable(r.Inputs["apiId"]) {
					property += " + propertyDependencies.apiId"
				}
				if unavailable(r.Inputs["integrationUri"]) {
					property += " + propertyDependencies.integrationUri"
				}
				matched := false
				for _, route := range resources {
					if route.state != state || route.res.Type != "aws:apigatewayv2/route:Route" {
						continue
					}
					q := route.res
					target := ""
					if unavailable(q.Inputs["target"]) {
						target = dependency(q, "target", r.Type)
					} else if value, ok := strings.CutPrefix(scalar(q.Inputs["target"]), "integrations/"); ok {
						target = find(value, r.Type)
					}
					if from == "" || resolve(q, "apiId", "aws:apigatewayv2/api:Api") != from || target != r.URN {
						continue
					}
					owner = q.URN
					label = detailValue(q.Inputs["routeKey"])
					if label == "unknown" {
						label = "route · unknown"
					}
					details = detailFields(q.Inputs, "routeKey", "authorizationType")
					flow(from, to, "inputs.routeKey + inputs.target + inputs.apiId + integration.integrationUri", graph.ConnectsTo)
					matched = true
				}
				if !matched {
					label = "Lambda integration"
					flow(from, to, property, graph.ConnectsTo)
				} else {
					owner, label, details = r.URN, "", ""
					flow(from, to, property, graph.ConnectsTo)
				}
			case "aws:cloudwatch/eventTarget:EventTarget":
				from := find(scalar(r.Inputs["rule"]), "aws:cloudwatch/eventRule:EventRule")
				to := find(scalar(r.Inputs["arn"]), "aws:sfn/stateMachine:StateMachine", "aws:lambda/function:Function", "aws:sqs/queue:Queue", "aws:sns/topic:Topic")
				label = "EventBridge"
				if rule, ok := byURN[from]; ok {
					label, details = eventBridgeDescription(rule)
				}
				flow(from, to, "inputs.rule + inputs.arn", graph.Triggers)
				var dead struct {
					Arn string `json:"arn"`
				}
				_ = json.Unmarshal(r.Inputs["deadLetterConfig"], &dead)
				label = "DLQ"
				details = "EventBridge failure route"
				flow(from, find(dead.Arn, "aws:sqs/queue:Queue"), "inputs.deadLetterConfig.arn", graph.Triggers)
			case "aws:cloudwatch/eventRule:EventRule":
				label, details = eventBridgeDescription(r)
				var pattern struct {
					Source []string `json:"source"`
					Detail struct {
						Bucket struct {
							Name []string `json:"name"`
						} `json:"bucket"`
						Machines []string `json:"stateMachineArn"`
					} `json:"detail"`
				}
				if json.Unmarshal([]byte(scalar(r.Inputs["eventPattern"])), &pattern) != nil {
					continue
				}
				for _, source := range pattern.Source {
					if source == "aws.s3" {
						for _, name := range pattern.Detail.Bucket.Name {
							from := bucket(name)
							// An S3 event pattern alone does not enable delivery to EventBridge.
							for _, notification := range resources {
								n := notification.res
								if notification.state == state && n.Type == "aws:s3/bucketNotification:BucketNotification" && bucket(scalar(n.Inputs["bucket"])) == from && string(n.Inputs["eventbridge"]) == "true" {
									flow(from, r.URN, "inputs.eventPattern.detail.bucket.name + bucketNotification.eventbridge", graph.Triggers)
								}
							}
						}
					}
					if source == "aws.states" {
						for _, arn := range pattern.Detail.Machines {
							flow(find(arn, "aws:sfn/stateMachine:StateMachine"), r.URN, "inputs.eventPattern.detail.stateMachineArn", graph.Triggers)
						}
					}
				}
			case "aws:sfn/stateMachine:StateMachine":
				var definition any
				if json.Unmarshal([]byte(scalar(r.Inputs["definition"])), &definition) != nil {
					continue
				}
				var walk func(any, string)
				walk = func(value any, path string) {
					object, ok := value.(map[string]any)
					if !ok {
						return
					}
					states, ok := object["States"].(map[string]any)
					if !ok {
						return
					}
					for name, value := range states {
						task, ok := value.(map[string]any)
						if !ok {
							continue
						}
						taskPath := name
						if path != "" {
							taskPath = path + "/" + name
						}
						if task["Type"] == "Task" {
							data, _ := json.Marshal(taskPath)
							label = "Task " + detailValue(data)
							details = ""
							arn, _ := task["Resource"].(string)
							to := find(arn, "aws:lambda/function:Function")
							property := "inputs.definition.States[].Resource"
							if arn == "arn:aws:states:::lambda:invoke" {
								if params, ok := task["Parameters"].(map[string]any); ok {
									target, _ := params["FunctionName"].(string)
									to = find(target, "aws:lambda/function:Function")
									property = "inputs.definition.States[].Parameters.FunctionName"
									if mode, ok := params["InvocationType"]; ok {
										raw, _ := json.Marshal(mode)
										details = "InvocationType: " + detailValue(raw)
									}
								}
							}
							flow(r.URN, to, property, graph.Triggers)
						}
						if processor, ok := task["Iterator"]; ok {
							walk(processor, taskPath)
						}
						if processor, ok := task["ItemProcessor"]; ok {
							walk(processor, taskPath)
						}
						if branches, ok := task["Branches"].([]any); ok {
							for i, branch := range branches {
								walk(branch, taskPath+"/branch"+strconv.Itoa(i))
							}
						}
					}
				}
				walk(definition, "")
			case "aws:lambda/eventSourceMapping:EventSourceMapping":
				from := resolve(r, "eventSourceArn", "aws:sqs/queue:Queue", "aws:dynamodb/table:Table")
				to := resolve(r, "functionName", "aws:lambda/function:Function")
				label, details = mappingDescription(r, typesByURN[from] == "aws:dynamodb/table:Table")
				kind := graph.Triggers
				if unavailable(r.Inputs["eventSourceArn"]) || unavailable(r.Inputs["functionName"]) {
					kind = graph.ConnectsTo
				}
				flow(from, to, "inputs.eventSourceArn + inputs.functionName + propertyDependencies", kind)
			case "aws:ecs/service:Service":
				label, details = "taskDefinition", "ECS task definition reference"
				flow(r.URN, find(scalar(r.Inputs["taskDefinition"]), "aws:ecs/taskDefinition:TaskDefinition"), "inputs.taskDefinition", graph.ConnectsTo)
			}
			// Configuration references show a connection, never an inferred read/write direction.
			label, details = "", ""
			environment := map[string]string{}
			if r.Type == "aws:lambda/function:Function" {
				// This proves an environment reference, not a request to the instance.
				label = "environment → EC2"
				flow(r.URN, dependency(r, "environment", "aws:ec2/instance:Instance"), "propertyDependencies.environment", graph.ConnectsTo)
				label = "environment → DynamoDB"
				flow(r.URN, dependency(r, "environment", "aws:dynamodb/table:Table"), "propertyDependencies.environment", graph.ConnectsTo)
				var env struct {
					Variables map[string]string `json:"variables"`
				}
				_ = json.Unmarshal(r.Inputs["environment"], &env)
				environment = env.Variables
			}
			if r.Type == "aws:ecs/taskDefinition:TaskDefinition" {
				var containers []struct {
					Environment []struct{ Name, Value string }
				}
				_ = json.Unmarshal([]byte(scalar(r.Inputs["containerDefinitions"])), &containers)
				for _, c := range containers {
					for _, env := range c.Environment {
						environment[env.Name] = env.Value
					}
				}
			}
			for _, key := range []string{"MEDIA_BUCKET", "BUCKET_NAME", "S3_BUCKET", "QUEUE_URL", "QUEUE_ARN", "TABLE_NAME", "TABLE_ARN", "DYNAMODB_TABLE", "DYNAMODB_TABLE_NAME", "DYNAMODB_TABLE_ARN"} {
				value := environment[key]
				to := bucket(value)
				if key == "QUEUE_URL" || key == "QUEUE_ARN" {
					to = find(value, "aws:sqs/queue:Queue")
				}
				if strings.Contains(key, "TABLE") {
					to = find(value, "aws:dynamodb/table:Table")
				}
				label, details = "environment."+key, "Environment configuration reference"
				flow(r.URN, to, "environment."+key, graph.ConnectsTo)
			}
		}
	}
}
