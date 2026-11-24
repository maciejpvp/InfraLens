package awscdk

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"infralens/internal/cost"
)

func TestCollectDeployedCosts(t *testing.T) {
	stacks := []source{
		{stack: "created", stackName: "New", region: "us-east-1", account: "123456789012"},
		{stack: "changed", stackName: "Existing", region: "eu-west-1", account: "123456789012"},
		{stack: "locked", stackName: "Locked", region: "us-east-1", account: "123456789012"},
		{stack: "other", stackName: "Other", region: "us-east-1", account: "000000000000"},
	}
	var inventory cost.Inventory
	identityChecks := 0
	collectDeployedCosts(t.Context(), stacks, &inventory, func(_ context.Context, args ...string) ([]byte, []byte, error) {
		if args[0] == "sts" {
			identityChecks++
			return []byte(`{"Account":"123456789012"}`), nil, nil
		}
		switch args[3] {
		case "New":
			return nil, []byte("An error occurred (ValidationError): Stack with id New does not exist"), errors.New("not found")
		case "Existing":
			want := []string{"cloudformation", "get-template", "--stack-name", "Existing", "--template-stage", "Original", "--region", "eu-west-1"}
			if !reflect.DeepEqual(want, args) {
				t.Errorf("get-template arguments %v, want %v", args, want)
			}
			return []byte(`{"TemplateBody":"{\"Resources\":{\"Worker\":{\"Type\":\"AWS::Lambda::Function\",\"Properties\":{\"MemorySize\":256}}}}"}`), nil, nil
		case "Locked":
			return nil, []byte("An error occurred (AccessDenied)"), errors.New("denied")
		default:
			t.Errorf("unexpected stack lookup %v", args)
			return nil, nil, errors.New("unexpected lookup")
		}
	})
	if identityChecks != 1 || !inventory.Compare || len(inventory.BeforeIssues) != 2 || len(inventory.Before) != 1 {
		t.Fatalf("unexpected deployed comparison: %+v", inventory)
	}
	worker := inventory.Before[0]
	if worker.ID != resourceNode("changed", "Worker", "AWS::Lambda::Function").ID || worker.Region != "eu-west-1" || worker.Properties["MemorySize"] == nil {
		t.Fatalf("unexpected deployed resource: %+v", worker)
	}
}
