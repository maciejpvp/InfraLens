package main

import (
	"infralens-simulation-fixture/fixture"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

type infraMocks = fixture.Mocks

var withStackConfig = fixture.WithStackConfig

func deploy(ctx *pulumi.Context) error {
	ctx.Export("value", pulumi.String(fixture.Value))
	return nil
}
