package main

import (
	"os"

	"infralens/internal/cli"
	"infralens/internal/graph/awscdk"
	"infralens/internal/graph/pulumi"
	"infralens/internal/graph/pulumi/simulate"
)

func main() {
	providers := map[string]cli.Provider{
		"pulumi": {
			ReadInputs:     pulumi.ReadInputs,
			Preview:        pulumi.Preview,
			ReadCostInputs: pulumi.ReadCostInputs,
			PreviewCosts:   pulumi.PreviewCosts,
			MockTopology:   simulate.RunInputs,
		},
		"terraform": {},
		"aws-cdk": {
			ReadInputs:     awscdk.ReadInputs,
			Preview:        awscdk.Preview,
			ReadCostInputs: awscdk.ReadCostInputs,
			PreviewCosts:   awscdk.PreviewCosts,
		},
	}
	os.Exit(cli.New(os.Stdout, os.Stderr, providers).Run(os.Args[1:]))
}
