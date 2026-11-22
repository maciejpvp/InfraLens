package pulumi

import (
	"bytes"
	"encoding/json"
	"maps"
	"slices"
	"strconv"
	"strings"

	"infralens/internal/graph"
)

const unknownValue = "04da6b54-80e4-46f7-96ec-b56ff0331ba9"

func awsService(typePath string) string {
	typePath, _, _ = strings.Cut(typePath, ":")
	module, resource, _ := strings.Cut(typePath, "/")
	switch module {
	case "apigateway", "apigatewayv2":
		return "api-gateway"
	case "sfn":
		return "step-functions"
	case "cloudwatch":
		if resource == "eventRule" || resource == "eventTarget" {
			return "eventbridge"
		}
	}
	return module
}

func unavailable(raw json.RawMessage) bool {
	return len(raw) == 0 || string(raw) == "null" || bytes.Contains(raw, []byte(`"`+unknownValue+`"`))
}

func scalar(raw json.RawMessage) string {
	var value string
	_ = json.Unmarshal(raw, &value)
	return value
}

const (
	bucketType       = "aws:s3/bucket:Bucket"
	bucketV2Type     = "aws:s3/bucketV2:BucketV2"
	notificationType = "aws:s3/bucketNotification:BucketNotification"
	eventRuleType    = "aws:cloudwatch/eventRule:EventRule"
	lambdaType       = "aws:lambda/function:Function"
	queueType        = "aws:sqs/queue:Queue"
	topicType        = "aws:sns/topic:Topic"
	machineType      = "aws:sfn/stateMachine:StateMachine"
	apiType          = "aws:apigatewayv2/api:Api"
	integrationType  = "aws:apigatewayv2/integration:Integration"
	routeType        = "aws:apigatewayv2/route:Route"
	tableType        = "aws:dynamodb/table:Table"
	taskType         = "aws:ecs/taskDefinition:TaskDefinition"
)

type awsResolver struct {
	relations    map[edgeKey]map[graph.Evidence]struct{}
	identifiers  map[[2]string]string
	byURN        map[string]resource
	routes       map[[2]string][]resource
	eventBuckets map[string]bool
}

func (b *graphBuilder) linkAWSRelations() {
	var exported, before, after []resource
	exportedURNs := map[string]bool{}
	for _, entry := range b.resources {
		switch entry.state {
		case "before":
			before = append(before, entry.res)
		case "after":
			after = append(after, entry.res)
		default:
			exported = append(exported, entry.res)
			exportedURNs[entry.res.URN] = true
		}
	}
	if !b.preview {
		for edge, evidence := range resolveAWS(exported) {
			b.linkAWSEdge(edge, "", evidence)
		}
		return
	}

	oldEdges := resolveAWS(slices.Concat(exported, before))
	newEdges := resolveAWS(slices.Concat(exported, after))
	for edge, evidence := range oldEdges {
		state := "before"
		// Preserve explicit preview states, even when they agree.
		exportedOnly := exportedURNs[edge.from] && exportedURNs[edge.to]
		for proof := range evidence {
			exportedOnly = exportedOnly && exportedURNs[proof.Resource]
		}
		if exportedOnly && maps.Equal(evidence, newEdges[edge]) {
			state = ""
			delete(newEdges, edge)
		}
		b.linkAWSEdge(edge, state, evidence)
	}
	for edge, evidence := range newEdges {
		b.linkAWSEdge(edge, "after", evidence)
	}
}

func (b *graphBuilder) linkAWSEdge(edge edgeKey, state string, evidence map[graph.Evidence]struct{}) {
	for proof := range evidence {
		proof.Resource = id(proof.Resource)
		b.link(edge.from, edge.to, edge.kind, state, proof)
	}
}

func resolveAWS(resources []resource) map[edgeKey]map[graph.Evidence]struct{} {
	a := awsResolver{
		relations: map[edgeKey]map[graph.Evidence]struct{}{}, identifiers: map[[2]string]string{},
		byURN: map[string]resource{}, routes: map[[2]string][]resource{}, eventBuckets: map[string]bool{},
	}
	for _, r := range resources {
		a.index(r)
	}
	for _, r := range resources {
		a.indexFlowConfiguration(r)
	}
	for _, r := range resources {
		a.resourceRelations(r)
	}
	return a.relations
}

func (a *awsResolver) indexFlowConfiguration(r resource) {
	switch r.Type {
	case routeType:
		api, target := a.resolve(r, "apiId", apiType), a.routeTarget(r)
		if api == "" || target == "" {
			return
		}
		key := [2]string{api, target}
		a.routes[key] = append(a.routes[key], r)
	case notificationType:
		if string(r.Inputs["eventbridge"]) != "true" {
			return
		}
		if bucket := a.bucket(scalar(r.Inputs["bucket"])); bucket != "" {
			a.eventBuckets[bucket] = true
		}
	}
}

func (a *awsResolver) index(r resource) {
	a.byURN[r.URN] = r
	a.addIdentifier(r, r.ID)
	for _, field := range []string{"arn", "name", "bucket", "url", "streamArn"} {
		a.addIdentifier(r, scalar(r.Outputs[field]))
	}
	if r.Type == lambdaType {
		a.addIdentifier(r, scalar(r.Outputs["invokeArn"]))
	}
	for _, field := range []string{"name", "bucket"} {
		a.addIdentifier(r, scalar(r.Inputs[field]))
	}
}

func (a *awsResolver) addIdentifier(r resource, value string) {
	if value == "" || value == "[secret]" || strings.Contains(value, unknownValue) {
		return
	}
	key := [2]string{r.Type, value}
	if previous, ok := a.identifiers[key]; ok && previous != r.URN {
		a.identifiers[key] = "" // Multiple resources share this identifier.
		return
	}
	a.identifiers[key] = r.URN
}

func (a *awsResolver) find(value string, types ...string) string {
	if value == "" {
		return ""
	}
	result := ""
	for _, kind := range types {
		urn, ok := a.identifiers[[2]string{kind, value}]
		if !ok {
			continue
		}
		if urn == "" || (result != "" && result != urn) {
			return ""
		}
		result = urn
	}
	return result
}

func (a *awsResolver) bucket(value string) string {
	return a.find(value, bucketType, bucketV2Type)
}

func (a *awsResolver) dependency(r resource, property string, types ...string) string {
	result := ""
	for _, urn := range r.PropertyDependencies[property] {
		target, ok := a.byURN[urn]
		if !ok {
			return ""
		}
		if !slices.Contains(types, target.Type) {
			continue
		}
		if result != "" && result != urn {
			return ""
		}
		result = urn
	}
	return result
}

func (a *awsResolver) resolve(r resource, field string, types ...string) string {
	if unavailable(r.Inputs[field]) {
		return a.dependency(r, field, types...)
	}
	return a.find(scalar(r.Inputs[field]), types...)
}

func (a *awsResolver) flow(from, to string, kind graph.Kind, evidence graph.Evidence) {
	if from == "" || to == "" || from == to {
		return
	}
	evidence.Source = "aws_rule"
	edge := edgeKey{from: from, to: to, kind: kind}
	if a.relations[edge] == nil {
		a.relations[edge] = map[graph.Evidence]struct{}{}
	}
	a.relations[edge][evidence] = struct{}{}
}

func (a *awsResolver) resourceRelations(r resource) {
	switch r.Type {
	case notificationType:
		a.bucketNotification(r)
	case integrationType:
		a.apiIntegration(r)
	case eventRuleType:
		a.eventRule(r)
	case "aws:cloudwatch/eventTarget:EventTarget":
		a.eventTarget(r)
	case machineType:
		a.stateMachine(r)
	case "aws:lambda/eventSourceMapping:EventSourceMapping":
		a.eventSourceMapping(r)
	case "aws:ecs/service:Service":
		a.flow(r.URN, a.find(scalar(r.Inputs["taskDefinition"]), taskType), graph.ConnectsTo, graph.Evidence{
			Resource: r.URN, Property: "inputs.taskDefinition", Label: "taskDefinition", Details: "ECS task definition reference",
		})
	case lambdaType:
		a.lambdaEnvironment(r)
	case taskType:
		a.taskEnvironment(r)
	}
}

type notificationDestination struct {
	field, key, kind string
}

func (a *awsResolver) bucketNotification(r resource) {
	from := a.resolve(r, "bucket", bucketType, bucketV2Type)
	if from == "" {
		return
	}
	for _, rule := range []notificationDestination{
		{"queues", "queueArn", queueType},
		{"lambdaFunctions", "lambdaFunctionArn", lambdaType},
		{"topics", "topicArn", topicType},
	} {
		a.notificationDestinations(r, from, rule)
	}
}

func (a *awsResolver) notificationDestinations(r resource, from string, rule notificationDestination) {
	raw := r.Inputs[rule.field]
	var destinations []map[string]json.RawMessage
	if json.Unmarshal(raw, &destinations) != nil {
		if unavailable(raw) {
			a.unknownNotificationDestination(r, from, rule)
		}
		return
	}
	for _, destination := range destinations {
		a.notificationDestination(r, from, rule, destination, len(destinations) == 1)
	}
}

func (a *awsResolver) unknownNotificationDestination(r resource, from string, rule notificationDestination) {
	a.flow(from, a.dependency(r, rule.field, rule.kind), graph.ConnectsTo, graph.Evidence{
		Resource: r.URN, Property: "propertyDependencies.bucket + propertyDependencies." + rule.field,
		Label: "S3 events · unknown", Details: "events: unknown",
	})
}

func (a *awsResolver) notificationDestination(r resource, from string, rule notificationDestination, destination map[string]json.RawMessage, single bool) {
	events := destination["events"]
	if string(events) == "[]" {
		return
	}
	target := destination[rule.key]
	targetUnknown := unavailable(target)
	to := a.find(scalar(target), rule.kind)
	// A whole-list dependency cannot identify individual unknown destinations.
	if targetUnknown && single {
		to = a.dependency(r, rule.field, rule.kind)
	}
	kind := graph.Triggers
	property := "inputs.bucket + inputs." + rule.field + "[]." + rule.key
	if unavailable(r.Inputs["bucket"]) || targetUnknown {
		kind = graph.ConnectsTo
		property = "inputs." + rule.field + " + propertyDependencies.bucket + propertyDependencies." + rule.field
	}
	if unavailable(events) {
		kind = graph.ConnectsTo
	}
	a.flow(from, to, kind, graph.Evidence{
		Resource: r.URN, Property: property, Label: eventLabel(events, "S3 events · unknown"),
		Details: detailFields(destination, "events", "filterPrefix", "filterSuffix"),
	})
}

func (a *awsResolver) apiIntegration(r resource) {
	if scalar(r.Inputs["integrationType"]) != "AWS_PROXY" {
		return
	}
	from := a.resolve(r, "apiId", apiType)
	to := a.resolve(r, "integrationUri", lambdaType)
	if from == "" || to == "" {
		return
	}
	property := "inputs.apiId + inputs.integrationUri"
	if unavailable(r.Inputs["apiId"]) {
		property += " + propertyDependencies.apiId"
	}
	if unavailable(r.Inputs["integrationUri"]) {
		property += " + propertyDependencies.integrationUri"
	}

	label := "Lambda integration"
	for _, route := range a.routes[[2]string{from, r.URN}] {
		routeLabel := detailValue(route.Inputs["routeKey"])
		if routeLabel == "unknown" {
			routeLabel = "route · unknown"
		}
		a.flow(from, to, graph.ConnectsTo, graph.Evidence{
			Resource: route.URN, Property: "inputs.routeKey + inputs.target + inputs.apiId + integration.integrationUri",
			Label: routeLabel, Details: detailFields(route.Inputs, "routeKey", "authorizationType"),
		})
		label = ""
	}
	a.flow(from, to, graph.ConnectsTo, graph.Evidence{Resource: r.URN, Property: property, Label: label})
}

func (a *awsResolver) routeTarget(route resource) string {
	if unavailable(route.Inputs["target"]) {
		return a.dependency(route, "target", integrationType)
	}
	value, ok := strings.CutPrefix(scalar(route.Inputs["target"]), "integrations/")
	if !ok {
		return ""
	}
	return a.find(value, integrationType)
}

func (a *awsResolver) eventTarget(r resource) {
	from := a.find(scalar(r.Inputs["rule"]), eventRuleType)
	to := a.find(scalar(r.Inputs["arn"]), machineType, lambdaType, queueType, topicType)
	label, details := "EventBridge", ""
	if rule, ok := a.byURN[from]; ok {
		label, details = eventBridgeDescription(rule)
	}
	a.flow(from, to, graph.Triggers, graph.Evidence{
		Resource: r.URN, Property: "inputs.rule + inputs.arn", Label: label, Details: details,
	})
	var dead struct{ Arn string }
	_ = json.Unmarshal(r.Inputs["deadLetterConfig"], &dead)
	a.flow(from, a.find(dead.Arn, queueType), graph.Triggers, graph.Evidence{
		Resource: r.URN, Property: "inputs.deadLetterConfig.arn", Label: "DLQ", Details: "EventBridge failure route",
	})
}

func (a *awsResolver) eventRule(r resource) {
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
		return
	}
	label, details := eventBridgeDescription(r)
	evidence := graph.Evidence{Resource: r.URN, Label: label, Details: details}
	if slices.Contains(pattern.Source, "aws.s3") {
		evidence.Property = "inputs.eventPattern.detail.bucket.name + bucketNotification.eventbridge"
		for _, name := range pattern.Detail.Bucket.Name {
			from := a.bucket(name)
			if a.eventBuckets[from] {
				a.flow(from, r.URN, graph.Triggers, evidence)
			}
		}
	}
	if slices.Contains(pattern.Source, "aws.states") {
		evidence.Property = "inputs.eventPattern.detail.stateMachineArn"
		for _, arn := range pattern.Detail.Machines {
			a.flow(a.find(arn, machineType), r.URN, graph.Triggers, evidence)
		}
	}
}

func (a *awsResolver) stateMachine(r resource) {
	var definition any
	if json.Unmarshal([]byte(scalar(r.Inputs["definition"])), &definition) == nil {
		a.walkStates(r.URN, definition, "")
	}
}

func (a *awsResolver) walkStates(owner string, definition any, path string) {
	object, _ := definition.(map[string]any)
	states, _ := object["States"].(map[string]any)
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
			a.lambdaTask(owner, taskPath, task)
		}
		a.walkStates(owner, task["Iterator"], taskPath)
		a.walkStates(owner, task["ItemProcessor"], taskPath)
		branches, _ := task["Branches"].([]any)
		for i, branch := range branches {
			a.walkStates(owner, branch, taskPath+"/branch"+strconv.Itoa(i))
		}
	}
}

func (a *awsResolver) lambdaTask(owner, path string, task map[string]any) {
	label, _ := json.Marshal(path)
	evidence := graph.Evidence{Resource: owner, Property: "inputs.definition.States[].Resource", Label: "Task " + detailValue(label)}
	arn, _ := task["Resource"].(string)
	if arn == "arn:aws:states:::lambda:invoke" {
		if params, ok := task["Parameters"].(map[string]any); ok {
			arn, _ = params["FunctionName"].(string)
			evidence.Property = "inputs.definition.States[].Parameters.FunctionName"
			if mode, ok := params["InvocationType"]; ok {
				raw, _ := json.Marshal(mode)
				evidence.Details = "InvocationType: " + detailValue(raw)
			}
		}
	}
	a.flow(owner, a.find(arn, lambdaType), graph.Triggers, evidence)
}

func (a *awsResolver) eventSourceMapping(r resource) {
	from := a.resolve(r, "eventSourceArn", queueType, tableType)
	to := a.resolve(r, "functionName", lambdaType)
	label, details := mappingDescription(r, a.byURN[from].Type == tableType)
	kind := graph.Triggers
	if unavailable(r.Inputs["eventSourceArn"]) || unavailable(r.Inputs["functionName"]) {
		kind = graph.ConnectsTo
	}
	a.flow(from, to, kind, graph.Evidence{
		Resource: r.URN, Property: "inputs.eventSourceArn + inputs.functionName + propertyDependencies", Label: label, Details: details,
	})
}

func (a *awsResolver) lambdaEnvironment(r resource) {
	for _, target := range []struct{ kind, label string }{
		{"aws:ec2/instance:Instance", "environment → EC2"},
		{tableType, "environment → DynamoDB"},
	} {
		a.flow(r.URN, a.dependency(r, "environment", target.kind), graph.ConnectsTo, graph.Evidence{
			Resource: r.URN, Property: "propertyDependencies.environment", Label: target.label,
		})
	}
	var env struct{ Variables map[string]string }
	_ = json.Unmarshal(r.Inputs["environment"], &env)
	for key, value := range env.Variables {
		a.environmentReference(r.URN, key, value)
	}
}

func (a *awsResolver) taskEnvironment(r resource) {
	var containers []struct {
		Environment []struct{ Name, Value string }
	}
	_ = json.Unmarshal([]byte(scalar(r.Inputs["containerDefinitions"])), &containers)
	for _, container := range containers {
		for _, env := range container.Environment {
			a.environmentReference(r.URN, env.Name, env.Value)
		}
	}
}

func (a *awsResolver) environmentReference(owner, key, value string) {
	var to string
	switch key {
	case "MEDIA_BUCKET", "BUCKET_NAME", "S3_BUCKET":
		to = a.bucket(value)
	case "QUEUE_URL", "QUEUE_ARN":
		to = a.find(value, queueType)
	case "TABLE_NAME", "TABLE_ARN", "DYNAMODB_TABLE", "DYNAMODB_TABLE_NAME", "DYNAMODB_TABLE_ARN":
		to = a.find(value, tableType)
	default:
		return
	}
	property := "environment." + key
	a.flow(owner, to, graph.ConnectsTo, graph.Evidence{
		Resource: owner, Property: property, Label: property, Details: "Environment configuration reference",
	})
}
