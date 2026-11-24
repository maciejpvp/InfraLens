package cost

import (
	"encoding/json"
	"math"
	"slices"
	"strconv"
	"strings"
)

const (
	monthHours = 730
	million    = 1_000_000
)

func (r Resource) property(names ...string) (any, bool) {
	for _, name := range names {
		if value, ok := r.Properties[name]; ok {
			return value, true
		}
	}
	return nil, false
}

func (r Resource) stringOr(defaultValue string, names ...string) string {
	value, exists := r.property(names...)
	if !exists {
		return defaultValue
	}
	result, _ := value.(string)
	return result
}

func (r Resource) numberOr(defaultValue float64, names ...string) float64 {
	value, exists := r.property(names...)
	if !exists {
		return defaultValue
	}
	var number float64
	var err error
	switch value := value.(type) {
	case json.Number:
		number, err = value.Float64()
	case float64:
		number = value
	case string:
		number, err = strconv.ParseFloat(value, 64)
	default:
		return -1
	}
	if err != nil || number < 0 || math.IsNaN(number) || math.IsInf(number, 0) || number > 1e12 {
		return -1
	}
	return number
}

func (r Resource) object(names ...string) Resource {
	value, _ := r.property(names...)
	properties, _ := value.(map[string]any)
	return Resource{Properties: properties}
}

func (r Resource) explicit(names ...string) bool {
	_, exists := r.property(names...)
	return exists
}

func (r Resource) boolean(names ...string) (bool, bool) {
	value, exists := r.property(names...)
	if !exists {
		return false, true
	}
	result, known := value.(bool)
	return result, known
}

type modelBuilder struct {
	resource Resource
	item     *Item
	pending  []pending
}

func (b *modelBuilder) add(metric *Metric, selection quote, quantity float64, input string) {
	if quantity < 0 {
		metric.missing("The required resource configuration is unresolved.")
	} else if quantity > 0 {
		b.pending = append(b.pending, pending{metric, selection, quantity, input})
	}
}

func (b *modelBuilder) monthly(service, usage, unit, operation string, quantity float64) {
	b.add(&b.item.Monthly, quote{service: service, usage: usage, unit: unit, operation: operation}, quantity, "")
}

func (b *modelBuilder) usage(service, usage, unit, operation, input string) {
	b.add(&b.item.Usage, quote{service: service, usage: usage, unit: unit, operation: operation}, million, input)
}

func model(resource Resource, item *Item, rule Rule) []pending {
	b := modelBuilder{resource: resource, item: item}
	if resource.Conditional {
		item.Monthly.missing("CloudFormation resource condition is unresolved.")
		item.Usage.missing("CloudFormation resource condition is unresolved.")
		return nil
	}
	// Each configured metric replaces its default charges, including an explicit empty list.
	b.defaults()
	if rule.Monthly != nil {
		b.replaceMetric(&item.Monthly, rule.Monthly, "")
	}
	if rule.PerMillion != nil {
		b.replaceMetric(&item.Usage, rule.PerMillion, "operations")
	}
	return b.pending
}

func (b *modelBuilder) replaceMetric(metric *Metric, meters []Meter, input string) {
	b.pending = slices.DeleteFunc(b.pending, func(query pending) bool { return query.metric == metric })
	*metric = Metric{}
	b.custom(metric, meters, input)
}

func (b *modelBuilder) defaults() {
	resource, item := b.resource, b.item
	switch resource.Type {
	case "AWS::Lambda::Function", "aws:lambda/function:Function":
		b.lambda()
	case "AWS::Lambda::Alias", "AWS::Lambda::Version", "aws:lambda/alias:Alias",
		"aws:lambda/provisionedConcurrencyConfig:ProvisionedConcurrencyConfig":
		b.lambdaProvisioned()
	case "AWS::ApiGateway::RestApi", "aws:apigateway/restApi:RestApi":
		b.usage("AmazonApiGateway", "ApiGatewayRequest", "Requests", "ApiGatewayRequest", "operations")
	case "AWS::ApiGatewayV2::Api", "aws:apigatewayv2/api:Api":
		if resource.stringOr("", "ProtocolType", "protocolType") == "HTTP" {
			b.usage("AmazonApiGateway", "ApiGatewayHttpRequest", "Requests", "ApiGatewayHttpApi", "operations")
		} else {
			item.Usage.missing("Only HTTP API Gateway v2 requests are modeled.")
		}
	case "AWS::ApiGateway::Stage", "aws:apigateway/stage:Stage":
		b.apiCache()
	case "AWS::AppSync::GraphQLApi", "aws:appsync/graphQLApi:GraphQLApi":
		b.usage("AWSAppSync", "GraphQLInvocation", "Requests", "", "operations")
	case "AWS::AppSync::Api", "aws:appsync/api:Api":
		b.usage("AWSAppSync", "EventAPI-Operation", "Operation", "", "operations")
		item.Usage.missing("AppSync connection time is unavailable.")
	case "AWS::AppSync::ApiCache", "aws:appsync/apiCache:ApiCache":
		b.appSyncCache()
	case "AWS::DynamoDB::Table", "aws:dynamodb/table:Table":
		b.dynamoDB()
	case "AWS::S3::Bucket", "aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2":
		b.usage("AmazonS3", "Requests-Tier2", "Requests", "", "operations")
	case "AWS::Logs::LogGroup", "aws:cloudwatch/logGroup:LogGroup":
		item.Usage.missing("CloudWatch log ingestion and retained bytes are unavailable.")
	case "AWS::Cognito::UserPool", "aws:cognito/userPool:UserPool":
		item.Usage.missing("Cognito authentication and token usage are unavailable.")
	case "AWS::SQS::Queue", "aws:sqs/queue:Queue":
		fifo, known := resource.boolean("FifoQueue", "fifoQueue")
		switch {
		case !known:
			item.Usage.missing("Queue type is unresolved.")
		case fifo:
			b.usage("AWSQueueService", "Requests-FIFO-RBP", "Requests", "", "operations")
		default:
			b.usage("AWSQueueService", "Requests-RBP", "Requests", "", "operations")
		}
	case "AWS::SNS::Topic", "aws:sns/topic:Topic":
		fifo, known := resource.boolean("FifoTopic", "fifoTopic")
		switch {
		case !known:
			item.Usage.missing("Topic type is unresolved.")
		case fifo:
			b.usage("AmazonSNS", "F-Request-Tier1", "Requests", "", "operations")
			item.Usage.missing("FIFO payload transfer, delivery and retention charges are unavailable.")
		default:
			b.usage("AmazonSNS", "Requests-Tier1", "Requests", "", "operations")
		}
	case "AWS::SNS::Subscription", "aws:sns/topicSubscription:TopicSubscription":
		switch resource.stringOr("", "Protocol", "protocol") {
		case "sqs", "lambda":
		case "http", "https":
			b.usage("AmazonSNS", "DeliveryAttempts-HTTP", "Notifications", "", "operations")
		case "email", "email-json":
			b.usage("AmazonSNS", "DeliveryAttempts-SMTP", "Notifications", "", "operations")
		default:
			item.Usage.missing("SNS delivery protocol is unsupported or unresolved.")
		}
	case "AWS::Events::EventBus", "aws:cloudwatch/eventBus:EventBus",
		"aws:cloudwatch/eventRule:EventRule", "AWS::Events::Rule":
		b.eventBridge()
	case "AWS::Scheduler::Schedule", "aws:scheduler/schedule:Schedule":
		b.usage("AWSEvents", "ScheduledInvocation", "Invocations", "Invocation", "operations")
	case "AWS::EC2::Instance", "aws:ec2/instance:Instance":
		b.ec2()
	case "AWS::EC2::Volume", "aws:ebs/volume:Volume", "aws:ec2/volume:Volume":
		b.ebs(resource)
	case "AWS::EC2::NatGateway", "aws:ec2/natGateway:NatGateway":
		b.nat()
	case "AWS::EC2::EIP", "aws:ec2/eip:Eip":
		b.monthly("AmazonVPC", "PublicIPv4:InUseAddress", "Hrs", "", monthHours)
	case "AWS::RDS::DBInstance", "aws:rds/instance:Instance":
		b.rds()
	case "AWS::ElasticLoadBalancingV2::LoadBalancer", "aws:lb/loadBalancer:LoadBalancer", "aws:alb/loadBalancer:LoadBalancer":
		b.loadBalancer()
	default:
		if !isSupportingResource(resource) {
			reason := "The billable units for " + resource.Type + " are unknown."
			item.Monthly.missing(reason)
			item.Usage.missing(reason)
		}
	}
}

func (b *modelBuilder) lambda() {
	r := b.resource
	arch := lambdaArch(r)
	if r.stringOr("Zip", "PackageType", "packageType") == "" ||
		r.explicit("CapacityProviderConfig", "capacityProviderConfig", "DurableConfig", "durableConfig") || arch == "" {
		b.item.Usage.missing("Lambda execution configuration is unsupported or unresolved.")
		return
	}
	b.usage("AWSLambda", "Request"+archSuffix(arch), "Requests", "", "operations")
	memory := r.numberOr(128, "MemorySize", "memorySize")
	if memory < 128 {
		b.item.Usage.missing("Lambda memory configuration is unresolved.")
	} else {
		b.add(&b.item.Usage, quote{service: "AWSLambda", usage: "Lambda-GB-Second" + archSuffix(arch), unit: "Lambda-GB-Second"},
			memory/1024*million/1000, "lambdaMs")
	}
	storage := r.object("EphemeralStorage", "ephemeralStorage").numberOr(512, "Size", "size")
	if storage < 512 || (r.explicit("EphemeralStorage", "ephemeralStorage") && r.object("EphemeralStorage", "ephemeralStorage").Properties == nil) {
		b.item.Usage.missing("Lambda ephemeral storage is unresolved.")
	} else {
		b.add(&b.item.Usage, quote{service: "AWSLambda", usage: "Lambda-Storage-GB-Second" + archSuffix(arch), unit: "GB-Seconds"},
			(storage-512)/1024*million/1000, "lambdaMs")
	}
	if r.explicit("SnapStart", "snapStart") && r.object("SnapStart", "snapStart").stringOr("", "ApplyOn", "applyOn") != "None" {
		b.item.Monthly.missing("Lambda SnapStart charges are unavailable.")
		b.item.Usage.missing("Lambda SnapStart charges are unavailable.")
	}
}

func lambdaArch(r Resource) string {
	value, exists := r.property("Architectures", "architectures")
	if !exists {
		return "x86_64"
	}
	architectures, ok := value.([]any)
	if ok && len(architectures) == 1 {
		arch, _ := architectures[0].(string)
		if arch == "x86_64" || arch == "arm64" {
			return arch
		}
	}
	return ""
}

func archSuffix(arch string) string {
	if arch == "arm64" {
		return "-ARM"
	}
	return ""
}

func (b *modelBuilder) lambdaProvisioned() {
	r := b.resource
	config := r.object("ProvisionedConcurrencyConfig", "provisionedConcurrencyConfig")
	if r.Type == "aws:lambda/provisionedConcurrencyConfig:ProvisionedConcurrencyConfig" {
		config = r
	} else if !r.explicit("ProvisionedConcurrencyConfig", "provisionedConcurrencyConfig") {
		return
	}
	b.item.Usage.missing("Invocation routing to Lambda provisioned concurrency is unavailable.")
	count := config.numberOr(-1, "ProvisionedConcurrentExecutions", "provisionedConcurrentExecutions")
	memory := r.numberOr(-1, "pricingFunctionMemory")
	arch := r.stringOr("", "pricingFunctionArch")
	if count < 0 || memory <= 0 || arch == "" {
		b.item.Monthly.missing("Lambda provisioned concurrency or function configuration is unresolved.")
		return
	}
	b.monthly("AWSLambda", "Lambda-Provisioned-Concurrency"+archSuffix(arch), "Lambda-GB-Second", "", monthHours*3600*count*memory/1024)
}

// LinkLambda copies only billing inputs from the function resolved by the adapter.
func LinkLambda(configuration *Resource, function Resource) {
	properties := make(map[string]any, len(configuration.Properties)+2)
	for key, value := range configuration.Properties {
		properties[key] = value
	}
	properties["pricingFunctionArch"] = lambdaArch(function)
	properties["pricingFunctionMemory"] = function.numberOr(128, "MemorySize", "memorySize")
	configuration.Properties = properties
}

func (b *modelBuilder) apiCache() {
	enabled, known := b.resource.boolean("CacheClusterEnabled", "cacheClusterEnabled")
	if !known {
		b.item.Monthly.missing("API Gateway cache configuration is unresolved.")
	} else if enabled {
		size := b.resource.stringOr("", "CacheClusterSize", "cacheClusterSize")
		b.monthly("AmazonApiGateway", "ApiGatewayCacheUsage:"+size+"GB", "Hrs", "RunInstances", monthHours)
	}
}

func (b *modelBuilder) appSyncCache() {
	sizes := map[string]string{
		"SMALL": "1.55", "MEDIUM": "3.22", "LARGE": "12.3", "XLARGE": "25.05",
		"LARGE_2X": "50.47", "LARGE_4X": "101.38", "LARGE_8X": "203.26", "LARGE_12X": "317.77",
	}
	size := sizes[b.resource.stringOr("", "Type", "type")]
	if size == "" {
		b.item.Monthly.missing("AppSync cache size is unsupported or unresolved.")
		return
	}
	b.monthly("AWSAppSync", "AppSyncCacheUsage:"+size+"GB", "Hrs", "RunInstances", monthHours)
}

func (b *modelBuilder) dynamoDB() {
	r := b.resource
	prefix := ""
	switch r.stringOr("STANDARD", "TableClass", "tableClass") {
	case "STANDARD":
	case "STANDARD_INFREQUENT_ACCESS":
		prefix = "IA-"
	default:
		b.item.Monthly.missing("DynamoDB table class is unresolved.")
		b.item.Usage.missing("DynamoDB table class is unresolved.")
		return
	}
	switch r.stringOr("PROVISIONED", "BillingMode", "billingMode") {
	case "PAY_PER_REQUEST":
		b.usage("AmazonDynamoDB", prefix+"ReadRequestUnits", "ReadRequestUnits", "PayPerRequestThroughput", "reads")
		b.usage("AmazonDynamoDB", prefix+"WriteRequestUnits", "WriteRequestUnits", "PayPerRequestThroughput", "writes")
	case "PROVISIONED":
		throughput := r.object("ProvisionedThroughput")
		if !r.explicit("ProvisionedThroughput") {
			throughput = r
		}
		b.capacity(prefix, throughput)
		value, _ := r.property("GlobalSecondaryIndexes", "globalSecondaryIndexes")
		if indexes, ok := value.([]any); ok {
			for _, index := range indexes {
				properties, _ := index.(map[string]any)
				entry := Resource{Properties: properties}
				if entry.explicit("ProvisionedThroughput") {
					entry = entry.object("ProvisionedThroughput")
				}
				b.capacity(prefix, entry)
			}
		} else if value != nil {
			b.item.Monthly.missing("DynamoDB index throughput is unresolved.")
		}
	default:
		b.item.Monthly.missing("DynamoDB billing mode is unresolved.")
		b.item.Usage.missing("DynamoDB billing mode is unresolved.")
	}
	if r.explicit("Replicas", "replicas", "globalTables") {
		b.item.Monthly.missing("DynamoDB replica charges are unavailable.")
		b.item.Usage.missing("DynamoDB replicated requests are unavailable.")
	}
}

func (b *modelBuilder) capacity(prefix string, r Resource) {
	for _, unit := range []struct{ name, pulumi string }{{"ReadCapacityUnit-Hrs", "readCapacity"}, {"WriteCapacityUnit-Hrs", "writeCapacity"}} {
		b.monthly("AmazonDynamoDB", prefix+unit.name, unit.name, "CommittedThroughput",
			monthHours*r.numberOr(-1, strings.TrimSuffix(unit.name, "-Hrs")+"s", unit.pulumi))
	}
}

func (b *modelBuilder) eventBridge() {
	r := b.resource
	switch r.Type {
	case "aws:cloudwatch/eventRule:EventRule", "AWS::Events::Rule":
		// Rules on custom buses are covered by the bus. A rule on the implicit default
		// bus does not tell us whether incoming events are AWS or custom.
		if r.explicit("ScheduleExpression", "scheduleExpression") {
			return
		}
		if r.stringOr("default", "EventBusName", "eventBusName") == "default" {
			b.item.Usage.missing("Default EventBridge bus event sources are unavailable.")
		}
	default:
		b.usage("AWSEvents", "Event-64K-Chunks", "64K-Chunks", "PutEvents", "operations")
	}
}

func isSupportingResource(r Resource) bool {
	if r.Service == "iam" {
		return true
	}
	switch r.Type {
	case "AWS::CDK::Metadata", "Custom::S3BucketNotifications", "aws:s3/bucketNotification:BucketNotification",
		"AWS::EC2::VPC", "AWS::EC2::Subnet", "AWS::EC2::InternetGateway", "AWS::EC2::VPCGatewayAttachment",
		"AWS::EC2::RouteTable", "AWS::EC2::Route", "AWS::EC2::SubnetRouteTableAssociation", "AWS::EC2::SecurityGroup",
		"AWS::EC2::SecurityGroupIngress", "AWS::EC2::SecurityGroupEgress", "AWS::EC2::NetworkAcl",
		"AWS::EC2::NetworkAclEntry", "AWS::EC2::SubnetNetworkAclAssociation", "AWS::EC2::EIPAssociation",
		"AWS::EC2::VolumeAttachment", "aws:ec2/vpc:Vpc", "aws:ec2/subnet:Subnet", "aws:ec2/internetGateway:InternetGateway",
		"aws:ec2/routeTable:RouteTable", "aws:ec2/route:Route", "aws:ec2/routeTableAssociation:RouteTableAssociation",
		"aws:ec2/securityGroup:SecurityGroup", "aws:ec2/securityGroupRule:SecurityGroupRule",
		"aws:ec2/eipAssociation:EipAssociation", "aws:ec2/volumeAttachment:VolumeAttachment",
		"AWS::Lambda::Permission", "aws:lambda/permission:Permission",
		"AWS::ApiGateway::Deployment", "AWS::ApiGateway::Method", "AWS::ApiGateway::Resource", "AWS::ApiGateway::Model",
		"AWS::ApiGatewayV2::Stage", "AWS::ApiGatewayV2::Deployment", "AWS::ApiGatewayV2::Integration",
		"AWS::ApiGatewayV2::Route", "aws:apigateway/deployment:Deployment", "aws:apigateway/resource:Resource",
		"aws:apigateway/method:Method", "aws:apigateway/integration:Integration", "aws:apigatewayv2/stage:Stage",
		"aws:apigatewayv2/deployment:Deployment", "aws:apigatewayv2/integration:Integration", "aws:apigatewayv2/route:Route",
		"AWS::AppSync::DataSource", "AWS::AppSync::GraphQLSchema", "AWS::AppSync::Resolver", "AWS::AppSync::FunctionConfiguration", "AWS::AppSync::ApiKey",
		"aws:appsync/dataSource:DataSource", "aws:appsync/resolver:Resolver", "aws:appsync/function:Function", "aws:appsync/apiKey:ApiKey",
		"AWS::S3::BucketPolicy", "aws:s3/bucketPolicy:BucketPolicy",
		"AWS::SQS::QueuePolicy", "aws:sqs/queuePolicy:QueuePolicy", "AWS::SNS::TopicPolicy", "aws:sns/topicPolicy:TopicPolicy",
		"AWS::ElasticLoadBalancingV2::Listener", "AWS::ElasticLoadBalancingV2::ListenerRule",
		"AWS::ElasticLoadBalancingV2::TargetGroup", "aws:lb/listener:Listener", "aws:lb/listenerRule:ListenerRule",
		"aws:lb/targetGroup:TargetGroup", "aws:lb/targetGroupAttachment:TargetGroupAttachment",
		"AWS::RDS::DBSubnetGroup", "AWS::RDS::DBParameterGroup", "AWS::RDS::OptionGroup",
		"aws:rds/subnetGroup:SubnetGroup", "aws:rds/parameterGroup:ParameterGroup", "aws:rds/optionGroup:OptionGroup":
		return true
	}
	return false
}
