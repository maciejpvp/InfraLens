package pulumi

import (
	"bytes"
	"encoding/json"
	"reflect"
	"slices"
	"testing"

	"laytrace/internal/graph"
)

func TestAWSRelationRegressions(t *testing.T) {
	newResource := func(project, kind, name, identifier string, inputs, outputs map[string]any) resource {
		rawFields := func(values map[string]any) map[string]json.RawMessage {
			data, err := json.Marshal(values)
			if err != nil {
				t.Fatal(err)
			}
			var result map[string]json.RawMessage
			if err := json.Unmarshal(data, &result); err != nil {
				t.Fatal(err)
			}
			return result
		}
		return resource{
			URN: "urn:pulumi:dev::" + project + "::" + kind + "::" + name, Type: kind, ID: identifier,
			Inputs: rawFields(inputs), Outputs: rawFields(outputs),
		}
	}
	source := func(document any) Source {
		data, err := json.Marshal(document)
		if err != nil {
			t.Fatal(err)
		}
		return Source{Reader: bytes.NewReader(data)}
	}
	export := func(resources ...resource) Source {
		return source(map[string]any{"version": 3, "deployment": map[string]any{"resources": resources}})
	}
	same := func(r resource) step { return step{Op: "same", URN: r.URN, Old: &r, New: &r} }
	preview := func(steps ...step) Source { return source(map[string]any{"steps": steps}) }
	flows := func(t *testing.T, sources ...Source) []graph.Edge {
		t.Helper()
		g, err := ReadSources(sources...)
		if err != nil {
			t.Fatal(err)
		}
		return slices.DeleteFunc(g.Edges, func(e graph.Edge) bool { return e.Kind != graph.Triggers && e.Kind != graph.ConnectsTo })
	}

	t.Run("API Gateway invocation ARN", func(t *testing.T) {
		const arn = "arn:aws:lambda:us-east-1:111122223333:function:test"
		const invokeARN = "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/" + arn + "/invocations"
		api := newResource("app", "aws:apigatewayv2/api:Api", "api", "api-id", nil, nil)
		fn := newResource("app", "aws:lambda/function:Function", "function", "", nil, map[string]any{"arn": arn, "invokeArn": invokeARN})
		route := newResource("app", "aws:apigatewayv2/route:Route", "get", "", map[string]any{
			"apiId": "api-id", "target": "integrations/integration-id", "routeKey": "GET /test",
		}, nil)
		for _, uri := range []string{invokeARN, arn} {
			integration := newResource("app", "aws:apigatewayv2/integration:Integration", "integration", "integration-id", map[string]any{
				"apiId": "api-id", "integrationType": "AWS_PROXY", "integrationUri": uri,
			}, nil)
			edges := flows(t, export(api, fn, integration, route))
			if len(edges) != 1 || edges[0].From != id(api.URN) || edges[0].To != id(fn.URN) ||
				!slices.ContainsFunc(edges[0].Evidence, func(e graph.Evidence) bool { return e.Label == "GET /test" }) {
				t.Fatalf("missing API route for %q: %+v", uri, edges)
			}
		}
	})

	t.Run("AppSync resolves fields and scopes data sources to their API", func(t *testing.T) {
		api := newResource("app", "aws:appsync/graphQLApi:GraphQLApi", "api", "main-api", nil, nil)
		other := newResource("app", appsyncAPIType, "other", "other-api", nil, nil)
		read := newResource("app", lambdaType, "read", "read-arn", nil, nil)
		write := newResource("app", lambdaType, "write", "write-arn", nil, nil)
		table := newResource("app", tableType, "table", "items", nil, nil)
		ds := func(name, apiID, dataSource, arn string) resource {
			return newResource("app", appsyncSourceType, name, apiID+"-"+dataSource, map[string]any{
				"apiId": apiID, "name": dataSource, "type": "AWS_LAMBDA", "lambdaConfig": map[string]any{"functionArn": arn},
			}, nil)
		}
		mainDS, otherDS := ds("main", api.ID, "shared", read.ID), ds("secondary", other.ID, "shared", write.ID)
		tableDS := newResource("app", appsyncSourceType, "tableSource", "", map[string]any{
			"apiId": api.ID, "name": "table", "type": "AMAZON_DYNAMODB",
			"dynamodbConfig": map[string]any{"tableName": table.ID},
		}, nil)
		first := newResource("app", appsyncFunctionType, "first", api.ID+"-first-id",
			map[string]any{"apiId": api.ID, "dataSource": "shared"}, nil)
		second := newResource("app", appsyncFunctionType, "second", "",
			map[string]any{"apiId": api.ID, "dataSource": "table"}, map[string]any{"functionId": "second-id"})
		query := newResource("app", appsyncResolverType, "query", "", map[string]any{
			"apiId": api.ID, "type": "Query", "field": "getItem", "dataSource": "shared",
		}, nil)
		mutation := newResource("app", appsyncResolverType, "mutation", "", map[string]any{
			"apiId": api.ID, "type": "Mutation", "field": "setItem", "kind": "PIPELINE",
			"pipelineConfig": map[string]any{"functions": []string{"first-id", "second-id"}},
		}, nil)
		labels := func(edges []graph.Edge) map[[3]string][]string {
			result := map[[3]string][]string{}
			for _, e := range edges {
				key := [3]string{e.From, e.To, e.State}
				for _, proof := range e.Evidence {
					if proof.Label != "" {
						result[key] = append(result[key], proof.Label)
					}
				}
				slices.Sort(result[key])
			}
			return result
		}
		want := map[[3]string][]string{
			{id(api.URN), id(read.URN), ""}:    {"Mutation.setItem", "Query.getItem"},
			{id(api.URN), id(table.URN), ""}:   {"Mutation.setItem"},
			{id(other.URN), id(write.URN), ""}: {"AppSync data source"},
		}
		got := labels(flows(t, export(api, other, read, write, table, mainDS, otherDS, tableDS, first, second, query, mutation)))
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("flow labels = %v, want %v", got, want)
		}

		afterDS := ds("main", unknownValue, "shared", unknownValue)
		afterDS.PropertyDependencies = map[string][]string{"apiId": {api.URN}, "lambdaConfig": {write.URN}}
		afterQuery := newResource("app", appsyncResolverType, "query", "", map[string]any{
			"apiId": unknownValue, "type": "Query", "field": "getItem", "dataSource": unknownValue,
		}, nil)
		afterQuery.PropertyDependencies = map[string][]string{"apiId": {api.URN}, "dataSource": {mainDS.URN}}
		afterMutation := newResource("app", appsyncResolverType, "mutation", "", map[string]any{
			"apiId": api.ID, "type": "Mutation", "field": "setItem", "kind": "PIPELINE",
			"pipelineConfig": map[string]any{"functions": []string{unknownValue}},
		}, nil)
		afterMutation.PropertyDependencies = map[string][]string{"pipelineConfig": {first.URN}}
		snapshot := func() Source {
			return preview(same(api), same(read), same(write), same(first),
				step{Op: "update", URN: mainDS.URN, Old: &mainDS, New: &afterDS},
				step{Op: "update", URN: query.URN, Old: &query, New: &afterQuery},
				step{Op: "update", URN: mutation.URN, Old: &mutation, New: &afterMutation})
		}
		want = map[[3]string][]string{
			{id(api.URN), id(read.URN), "before"}: {"Mutation.setItem", "Query.getItem"},
			{id(api.URN), id(write.URN), "after"}: {"Mutation.setItem", "Query.getItem"},
		}
		if got = labels(flows(t, snapshot())); !reflect.DeepEqual(got, want) {
			t.Fatalf("preview flow labels = %v, want %v", got, want)
		}
		g, err := ReadSources(snapshot())
		if err != nil {
			t.Fatal(err)
		}
		if !slices.ContainsFunc(g.Edges, func(e graph.Edge) bool {
			return e.From == id(query.URN) && e.To == id(api.URN) && e.Kind == graph.DependsOn && e.State == "after" &&
				slices.Contains(e.Evidence, graph.Evidence{Source: graph.AppSyncAPISource, Resource: id(query.URN), Property: "propertyDependencies.apiId"})
		}) {
			t.Fatal("missing AppSync association from preview property dependency")
		}
	})

	t.Run("S3 EventBridge across exports and previews", func(t *testing.T) {
		bucket := newResource("storage", "aws:s3/bucket:Bucket", "bucket", "bucket-id", nil, nil)
		notification := newResource("storage", "aws:s3/bucketNotification:BucketNotification", "notification", "", map[string]any{
			"bucket": "bucket-id", "eventbridge": true,
		}, nil)
		disabled := notification
		disabled.Inputs = map[string]json.RawMessage{"bucket": json.RawMessage(`"bucket-id"`), "eventbridge": json.RawMessage(`false`)}
		rule := newResource("events", "aws:cloudwatch/eventRule:EventRule", "rule", "", map[string]any{
			"eventPattern": `{"source":["aws.s3"],"detail":{"bucket":{"name":["bucket-id"]}}}`,
		}, nil)
		check := func(t *testing.T, want []string, sources ...Source) {
			t.Helper()
			states := []string{}
			for _, edge := range flows(t, sources...) {
				if edge.From != id(bucket.URN) || edge.To != id(rule.URN) || edge.Kind != graph.Triggers {
					t.Fatalf("unexpected EventBridge edge: %+v", edge)
				}
				states = append(states, edge.State)
			}
			if !reflect.DeepEqual(states, want) {
				t.Fatalf("EventBridge states = %v, want %v", states, want)
			}
		}
		check(t, []string{""}, export(bucket, notification), export(rule))
		check(t, []string{"after", "before"}, export(bucket, notification), preview(same(rule)))
		check(t, []string{"after", "before"}, preview(same(bucket), same(notification)), export(rule))
		check(t, []string{"before"}, export(rule), preview(same(bucket), step{
			Op: "update", URN: notification.URN, Old: &notification, New: &disabled,
		}))
	})

	t.Run("exported SQS mapping resolves each preview state", func(t *testing.T) {
		queue := newResource("base", queueType, "queue", "queue-arn", nil, nil)
		fn := newResource("app", lambdaType, "worker", "worker-arn", nil, nil)
		mapping := newResource("base", "aws:lambda/eventSourceMapping:EventSourceMapping", "mapping", "", map[string]any{
			"eventSourceArn": queue.ID, "functionName": fn.ID,
		}, nil)
		unrelated := newResource("other", "test:index:Resource", "unrelated", "", nil, nil)
		check := func(t *testing.T, want []string, sources ...Source) {
			t.Helper()
			var states []string
			for _, edge := range flows(t, sources...) {
				if edge.From != id(queue.URN) || edge.To != id(fn.URN) || edge.Kind != graph.Triggers {
					t.Fatalf("unexpected mapping edge: %+v", edge)
				}
				states = append(states, edge.State)
			}
			if !slices.Equal(states, want) {
				t.Fatalf("mapping states = %v, want %v", states, want)
			}
		}
		check(t, []string{"after", "before"}, export(queue, mapping), preview(same(fn)))
		check(t, []string{"after"}, export(queue, mapping), preview(step{Op: "create", URN: fn.URN, New: &fn}))
		check(t, []string{""}, export(queue, mapping, fn), preview(same(unrelated)))
	})

	t.Run("ECS keeps each container's references", func(t *testing.T) {
		first := newResource("app", "aws:s3/bucket:Bucket", "first", "a", nil, nil)
		second := newResource("app", "aws:s3/bucket:Bucket", "second", "b", nil, nil)
		for _, buckets := range [][]string{{"a", "b", "a"}, {"b", "a", "a"}} {
			containers := make([]map[string]any, 0, len(buckets))
			for _, bucket := range buckets {
				containers = append(containers, map[string]any{"environment": []map[string]string{{"name": "BUCKET_NAME", "value": bucket}}})
			}
			data, err := json.Marshal(containers)
			if err != nil {
				t.Fatal(err)
			}
			task := newResource("app", "aws:ecs/taskDefinition:TaskDefinition", "task", "", map[string]any{"containerDefinitions": string(data)}, nil)
			edges := flows(t, export(first, second, task))
			seen := map[string]bool{}
			for _, edge := range edges {
				if edge.From != id(task.URN) || len(edge.Evidence) != 1 || edge.Evidence[0].Label != "environment.BUCKET_NAME" {
					t.Fatalf("unexpected ECS edge: %+v", edge)
				}
				seen[edge.To] = true
			}
			if len(edges) != 2 || !seen[id(first.URN)] || !seen[id(second.URN)] {
				t.Fatalf("missing ECS references for %v: %+v", buckets, edges)
			}
		}
	})
}
