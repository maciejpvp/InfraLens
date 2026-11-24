package awscdk

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"slices"
	"strings"
	"time"

	"infralens/internal/cost"
)

func (doc template) costResources(stack, region string) []cost.Resource {
	var resources []cost.Resource
	for id, res := range doc.Resources {
		node := resourceNode(stack, id, res.Type)
		entry := cost.Resource{
			ID: node.ID, Name: node.Name, Type: node.Type, Service: node.Service, Stack: node.Stack,
			Region: region, Properties: res.Properties, Conditional: res.Condition != "",
		}
		if res.Type == "AWS::Lambda::Alias" || res.Type == "AWS::Lambda::Version" {
			if target, ok := doc.Resources[lambdaFunctionID(res.Properties["FunctionName"])]; ok &&
				target.Type == "AWS::Lambda::Function" && target.Condition == "" {
				cost.LinkLambda(&entry, cost.Resource{Properties: target.Properties})
			}
		}
		resources = append(resources, entry)
	}
	return resources
}

func lambdaFunctionID(property any) string {
	reference, _ := property.(map[string]any)
	if id, ok := reference["Ref"].(string); ok {
		return id
	}
	if attribute, ok := reference["Fn::GetAtt"].([]any); ok && len(attribute) == 2 {
		id, _ := attribute[0].(string)
		return id
	}
	return ""
}

type runAWS func(ctx context.Context, args ...string) ([]byte, []byte, error)

func awsCommand(ctx context.Context, args ...string) ([]byte, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "aws", append(args, "--output", "json", "--no-cli-pager", "--no-cli-auto-prompt")...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.Output()
	return stdout, stderr.Bytes(), err
}

func collectDeployedCosts(ctx context.Context, sources []source, inventory *cost.Inventory, run runAWS) {
	inventory.Compare = true
	slices.SortFunc(sources, func(a, b source) int { return strings.Compare(a.stack, b.stack) })
	var caller struct{ Account string }
	accountChecked := false
	for _, src := range sources {
		region := deployedRegion(src.region)
		if src.account != "" && src.account != "unknown-account" {
			if !accountChecked {
				body, _, err := run(ctx, regionArgs(region, "sts", "get-caller-identity")...)
				if err == nil && json.Unmarshal(body, &caller) != nil {
					caller.Account = ""
				}
				accountChecked = true
			}
			if caller.Account != src.account {
				inventory.BeforeIssues = append(inventory.BeforeIssues, fmt.Sprintf("Before unavailable for %s: AWS credentials could not be verified for the stack account.", src.stack))
				continue
			}
		}
		body, diagnostics, err := run(ctx, regionArgs(region,
			"cloudformation", "get-template", "--stack-name", src.stackName, "--template-stage", "Original")...)
		if err != nil {
			if templateMissing(diagnostics, src.stackName) {
				continue
			}
			inventory.BeforeIssues = append(inventory.BeforeIssues, fmt.Sprintf("Before unavailable for %s: unable to read the deployed CloudFormation template.", src.stack))
			continue
		}
		doc, err := deployedTemplate(body)
		if err != nil {
			inventory.BeforeIssues = append(inventory.BeforeIssues, fmt.Sprintf("Before unavailable for %s: expected a deployed CloudFormation JSON template.", src.stack))
			continue
		}
		inventory.Before = append(inventory.Before, doc.costResources(src.stack, region)...)
	}
}

func deployedRegion(region string) string {
	for _, region := range []string{region, os.Getenv("AWS_REGION"), os.Getenv("AWS_DEFAULT_REGION")} {
		if cost.ValidRegion(region) {
			return region
		}
	}
	return ""
}

func regionArgs(region string, args ...string) []string {
	if region != "" {
		return append(args, "--region", region)
	}
	return args
}

func templateMissing(diagnostics []byte, stackName string) bool {
	message := string(diagnostics)
	return strings.Contains(message, "(ValidationError)") &&
		strings.Contains(message, "Stack with id "+stackName+" does not exist")
}

func deployedTemplate(data []byte) (template, error) {
	var response struct {
		TemplateBody json.RawMessage
	}
	if err := json.Unmarshal(data, &response); err != nil {
		return template{}, err
	}
	var body string
	if json.Unmarshal(response.TemplateBody, &body) == nil {
		return readTemplate(strings.NewReader(body))
	}
	return readTemplate(bytes.NewReader(response.TemplateBody))
}
