package main

import (
	"infralens-simulation-fixture/fixture"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type infraMocks = fixture.Mocks

var withStackConfig = fixture.WithStackConfig

func deploy(ctx *pulumi.Context) error {
	ref, err := pulumi.NewStackReference(ctx, "base-reference", &pulumi.StackReferenceArgs{
		Name: pulumi.String("org/base/dev"),
	})
	if err != nil {
		return err
	}
	var result pulumi.CustomResourceState
	return ctx.RegisterResource("test:index:Consumer", "confirmed", pulumi.Map{
		"value": ref.GetStringOutput(pulumi.String("value")),
	}, &result)
}
