package fixture

import (
	"errors"
	"testing"

	"github.com/pulumi/pulumi/sdk/v3/go/common/resource"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

const Value = "fixture-output"

type Mocks struct{}

func (*Mocks) Call(args pulumi.MockCallArgs) (resource.PropertyMap, error) {
	return args.Args, nil
}

func (*Mocks) NewResource(args pulumi.MockResourceArgs) (string, resource.PropertyMap, error) {
	if args.TypeToken == "test:index:Consumer" {
		value := args.Inputs["value"]
		if !value.IsString() || value.StringValue() != Value {
			return "", nil, errors.New("consumer did not receive the base stack output")
		}
	}
	return args.Name, args.Inputs, nil
}

func WithStackConfig(*testing.T, map[string]string) pulumi.RunOption {
	return func(*pulumi.RunInfo) {}
}
