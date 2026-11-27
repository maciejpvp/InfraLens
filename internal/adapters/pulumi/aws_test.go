package pulumi

import (
	"encoding/json"
	"strings"
	"testing"

	"laytrace/internal/graph"
)

func TestAWSServiceAliases(t *testing.T) {
	for resourceType, want := range map[string]string{
		"apigateway/restApi:RestApi":     "api-gateway",
		"apigatewayv2/route:Route":       "api-gateway",
		"sfn/stateMachine:StateMachine":  "step-functions",
		"cloudwatch/eventRule:EventRule": "eventbridge",
		"cloudwatch/eventTarget:Target":  "eventbridge",
		"cloudwatch/logGroup:LogGroup":   "cloudwatch",
	} {
		if got := awsService(resourceType); got != want {
			t.Errorf("%s: got %q, want %q", resourceType, got, want)
		}
	}
}

func TestAWSRelations(t *testing.T) {
	document := `{"version":3,"deployment":{"resources":[
      {"urn":"urn:pulumi:dev::app::aws:s3/bucket:Bucket::media","type":"aws:s3/bucket:Bucket","id":"private-bucket","outputs":{"bucket":"private-bucket","password":"CANARY_SECRET"}},
      {"urn":"urn:pulumi:dev::app::aws:sqs/queue:Queue::jobs","type":"aws:sqs/queue:Queue","outputs":{"arn":"private-queue-arn","url":"private-queue-url"}},
      {"urn":"urn:pulumi:dev::app::aws:s3/bucketNotification:BucketNotification::events","type":"aws:s3/bucketNotification:BucketNotification","inputs":{"bucket":"private-bucket","eventbridge":true,"queues":[{"queueArn":"private-queue-arn","events":["s3:ObjectCreated:*"]}]}},
      {"urn":"urn:pulumi:dev::app::aws:cloudwatch/eventRule:EventRule::created","type":"aws:cloudwatch/eventRule:EventRule","outputs":{"name":"private-rule"},"inputs":{"eventPattern":"{\"source\":[\"aws.s3\"],\"detail\":{\"bucket\":{\"name\":[\"private-bucket\"]}}}"}},
      {"urn":"urn:pulumi:dev::app::aws:lambda/function:Function::prepare","type":"aws:lambda/function:Function","outputs":{"arn":"private-function"},"inputs":{"environment":{"variables":{"MEDIA_BUCKET":"private-bucket","PASSWORD":"CANARY_SECRET"}}}},
      {"urn":"urn:pulumi:dev::app::aws:sfn/stateMachine:StateMachine::workflow","type":"aws:sfn/stateMachine:StateMachine","outputs":{"arn":"private-workflow"},"inputs":{"definition":"{\"States\":{\"Prepare\":{\"Type\":\"Task\",\"Resource\":\"arn:aws:states:::lambda:invoke\",\"Parameters\":{\"FunctionName\":\"private-function\"}}}}"}},
      {"urn":"urn:pulumi:dev::app::aws:cloudwatch/eventTarget:EventTarget::start","type":"aws:cloudwatch/eventTarget:EventTarget","inputs":{"rule":"private-rule","arn":"private-workflow"}},
      {"urn":"urn:pulumi:dev::app::aws:ecs/taskDefinition:TaskDefinition::worker","type":"aws:ecs/taskDefinition:TaskDefinition","inputs":{"containerDefinitions":"[{\"environment\":[{\"name\":\"QUEUE_URL\",\"value\":\"private-queue-url\"}]}]"}}
    ]}}`
	g, err := Read(strings.NewReader(document))
	if err != nil {
		t.Fatal(err)
	}
	count := map[graph.Kind]int{}
	for _, edge := range g.Edges {
		count[edge.Kind]++
		if len(edge.Evidence) == 0 || edge.Evidence[0].Source != "aws_rule" {
			t.Fatal("missing rule evidence")
		}
	}
	if count[graph.Triggers] != 4 || count[graph.ConnectsTo] != 2 {
		t.Fatalf("incorrect flow: %+v", count)
	}
	data, _ := json.Marshal(g)
	for _, secret := range []string{"CANARY_SECRET", "private-bucket", "private-queue", "private-function", "private-rule", "private-workflow"} {
		if strings.Contains(string(data), secret) {
			t.Fatalf("leaked %s", secret)
		}
	}
	withoutDelivery := strings.Replace(document, `"eventbridge":true`, `"eventbridge":false`, 1)
	other, err := Read(strings.NewReader(withoutDelivery))
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Edges) != len(g.Edges)-1 {
		t.Fatal("event pattern alone was treated as delivery")
	}
}

func TestDependenciesAndAmbiguousIDsDoNotBecomeTraffic(t *testing.T) {
	document := `{"version":3,"deployment":{"resources":[
    {"urn":"urn:pulumi:dev::app::aws:s3/bucket:Bucket::a","type":"aws:s3/bucket:Bucket","id":"shared"},
    {"urn":"urn:pulumi:dev::app::aws:s3/bucket:Bucket::b","type":"aws:s3/bucket:Bucket","id":"shared"},
    {"urn":"urn:pulumi:dev::app::aws:lambda/function:Function::worker","type":"aws:lambda/function:Function","inputs":{"environment":{"variables":{"MEDIA_BUCKET":"shared"}}},"dependencies":["urn:pulumi:dev::app::aws:s3/bucket:Bucket::a"]}
    ]}}`
	g, err := Read(strings.NewReader(document))
	if err != nil {
		t.Fatal(err)
	}
	if len(g.Edges) != 1 || g.Edges[0].Kind != graph.DependsOn {
		t.Fatal("invented traffic from ambiguous configuration/dependencies")
	}
}
