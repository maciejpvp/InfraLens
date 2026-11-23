package awscdk

import (
	"slices"

	"infralens/internal/graph"
)

const (
	lambdaFunction     = "AWS::Lambda::Function"
	sqsQueue           = "AWS::SQS::Queue"
	dynamoTable        = "AWS::DynamoDB::Table"
	s3Bucket           = "AWS::S3::Bucket"
	bucketNotification = "Custom::S3BucketNotifications"
	appsyncAPI         = "AWS::AppSync::GraphQLApi"
)

func (doc template) linkFlows(b *stackGraph, id string, res resource) {
	props := res.Properties
	switch res.Type {
	case lambdaFunction:
		env, _ := props["Environment"].(map[string]any)
		variables, _ := env["Variables"].(map[string]any)
		for name, value := range variables {
			table := doc.resolve(value, dynamoTable, "", "Arn")
			b.link(id, table, graph.ConnectsTo, id, "Lambda environment", "Properties.Environment.Variables."+name)
		}
	case "AWS::Lambda::EventSourceMapping":
		if enabled, ok := props["Enabled"].(bool); ok && !enabled {
			return
		}
		source := doc.resolve(props["EventSourceArn"], sqsQueue, "Arn")
		if source == "" {
			source = doc.resolve(props["EventSourceArn"], dynamoTable, "StreamArn")
		}
		function := doc.resolve(props["FunctionName"], lambdaFunction, "", "Arn")
		b.link(source, function, graph.Triggers, id, "EventSourceMapping", "Properties.EventSourceArn")
	case s3Bucket, bucketNotification:
		bucket, list, field := id, "LambdaConfigurations", "Function"
		if res.Type == bucketNotification {
			bucket = doc.resolve(props["BucketName"], s3Bucket, "")
			list, field = "LambdaFunctionConfigurations", "LambdaFunctionArn"
		}
		cfg, _ := props["NotificationConfiguration"].(map[string]any)
		targets, _ := cfg[list].([]any)
		for _, value := range targets {
			target, _ := value.(map[string]any)
			function := doc.resolve(target[field], lambdaFunction, "Arn")
			b.link(bucket, function, graph.Triggers, id, "S3 notification", "Properties.NotificationConfiguration."+list+"."+field)
		}
	case "AWS::AppSync::DataSource":
		api := doc.resolve(props["ApiId"], appsyncAPI, "", "ApiId")
		switch props["Type"] {
		case "AWS_LAMBDA":
			cfg, _ := props["LambdaConfig"].(map[string]any)
			function := doc.resolve(cfg["LambdaFunctionArn"], lambdaFunction, "Arn")
			b.link(api, function, graph.ConnectsTo, id, "AppSync data source", "Properties.LambdaConfig.LambdaFunctionArn")
		case "AMAZON_DYNAMODB":
			cfg, _ := props["DynamoDBConfig"].(map[string]any)
			table := doc.resolve(cfg["TableName"], dynamoTable, "")
			b.link(api, table, graph.ConnectsTo, id, "AppSync data source", "Properties.DynamoDBConfig.TableName")
		}
	}
}

// An empty attribute denotes a Ref, which resolves differently from GetAtt.
// shortcut: resolve direct intrinsics only, extend when supported integrations need composed expressions.
func (doc template) resolve(value any, expectedType string, attributes ...string) string {
	expr, _ := value.(map[string]any)
	if len(expr) != 1 {
		return ""
	}
	target, attribute := getAtt(expr["Fn::GetAtt"])
	if target == "" {
		target, _ = expr["Ref"].(string)
	}
	if doc.Resources[target].Type == expectedType && slices.Contains(attributes, attribute) {
		return target
	}
	return ""
}
