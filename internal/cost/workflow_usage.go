package cost

import "strings"

var workflowUsageUnits = map[string]string{
	"requests": "requests", "lambdaInvocations": "invocations", "lambdaMs": "ms",
	"dynamoReadUnits": "RCU", "dynamoWriteUnits": "WCU", "dynamoStoredBytes": "bytes",
	"s3Get": "GET", "s3Put": "PUT", "s3UploadBytes": "bytes uploaded",
	"s3InternetBytes": "bytes delivered", "s3RetrievalBytes": "bytes retrieved", "s3StoredBytes": "bytes",
	"unpriced": "",
}

func s3ClassUsage(usage string) bool {
	switch usage {
	case "s3Get", "s3Put", "s3RetrievalBytes", "s3StoredBytes":
		return true
	}
	return false
}

func semanticWorkflowQuotes(step *WorkflowStep, meter *WorkflowMeter, modeled []pending) []pending {
	if meter.usage == "unpriced" {
		meter.Pricing.missing("Automatic pricing is unavailable for this workload dimension.")
		return nil
	}
	r := *step.resource // Semantic usage requires a resource and workflowQuotes checks unresolved bindings.
	switch meter.usage {
	case "requests":
		return modeledWorkflowQuotes(meter, modeled, "operations")
	case "lambdaInvocations", "lambdaMs":
		if r.Type == "AWS::Lambda::Function" || r.Type == "aws:lambda/function:Function" {
			input := "lambdaMs"
			if meter.usage == "lambdaInvocations" {
				input = "operations"
			}
			return modeledWorkflowQuotes(meter, modeled, input)
		}
	}

	const gib = 1 << 30
	multiplier := float64(1)
	var selection quote
	switch r.Type {
	case "AWS::DynamoDB::Table", "aws:dynamodb/table:Table":
		switch meter.usage {
		case "dynamoReadUnits", "dynamoWriteUnits":
			if r.stringOr("PROVISIONED", "BillingMode", "billingMode") == "PROVISIONED" {
				meter.Note = "Provisioned throughput is included in monthly capacity. Usage is shown per run."
				return nil
			}
			input := "reads"
			if meter.usage == "dynamoWriteUnits" {
				input = "writes"
			}
			return modeledWorkflowQuotes(meter, modeled, input)
		case "dynamoStoredBytes":
			usage := "TimedStorage-ByteHrs"
			switch r.stringOr("STANDARD", "TableClass", "tableClass") {
			case "STANDARD":
			case "STANDARD_INFREQUENT_ACCESS":
				usage = "IA-" + usage
			default:
				meter.Pricing.missing("DynamoDB table class is unresolved.")
				return nil
			}
			selection = quote{service: "AmazonDynamoDB", usage: usage, unit: "GB-Mo"}
			multiplier = 1.0 / gib
		}
	case "AWS::S3::Bucket", "aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2":
		selection, multiplier = s3WorkflowQuote(meter)
	}
	if selection.service != "" {
		return []pending{{metric: &meter.Pricing, quote: selection, quantity: multiplier}}
	}
	if meter.Note == "" {
		meter.Pricing.missing("Usage kind " + meter.usage + " is unavailable for this resource or storage class.")
	}
	return nil
}

func s3WorkflowQuote(meter *WorkflowMeter) (quote, float64) {
	const bytesToGB = 1.0 / (1 << 30)
	selection := quote{service: "AmazonS3"}
	class := strings.ToUpper(meter.class)
	if s3ClassUsage(meter.usage) && class != "" && class != "STANDARD" && class != "STANDARD_IA" {
		return quote{}, 0
	}
	switch meter.usage {
	case "s3Get", "s3Put":
		selection.unit = "Requests"
		selection.usage = "Requests-"
		if class == "STANDARD_IA" {
			selection.usage += "SIA-"
		}
		if meter.usage == "s3Put" {
			selection.usage += "Tier1"
		} else {
			selection.usage += "Tier2"
		}
		return selection, 1
	case "s3UploadBytes":
		meter.Note = "Upload payload volume. Storage and transfer are modeled as separate usage."
		return quote{}, 0
	case "s3InternetBytes":
		// AmazonS3's identically named meter covers zero-priced outbound traffic to AWS.
		selection.service, selection.usage, selection.unit = "AWSDataTransfer", "DataTransfer-Out-Bytes", "GB"
		selection.attributes = map[string]string{"Transfer Type": "AWS Outbound", "From Location Type": "AWS Region", "To Location Type": "Other"}
	case "s3RetrievalBytes":
		if class != "STANDARD_IA" {
			meter.Note = "S3 Standard has no separate data retrieval fee."
			return quote{}, 0
		}
		selection.usage, selection.unit = "Retrieval-SIA", "GB"
	case "s3StoredBytes":
		selection.usage, selection.unit = "TimedStorage-ByteHrs", "GB-Mo"
		volumeType := "Standard"
		if class == "STANDARD_IA" {
			selection.usage, volumeType = "TimedStorage-SIA-ByteHrs", "Standard - Infrequent Access"
		}
		selection.attributes = map[string]string{"Volume Type": volumeType}
	default:
		return quote{}, 0
	}
	return selection, bytesToGB
}
