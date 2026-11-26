package cli

import (
	"flag"

	"infralens/internal/app"
)

const costUsage = " [--costs [--cost-region REGION] [--cost-rules FILE] [--cost-assumptions FILE]]"

func costFlags(flags *flag.FlagSet) *app.CostOptions {
	options := &app.CostOptions{}
	flags.BoolVar(&options.Enabled, "costs", false, "embed AWS cost estimates")
	flags.StringVar(&options.Region, "cost-region", "", "fallback AWS pricing region")
	flags.StringVar(&options.RulesPath, "cost-rules", "", "JSON billing rules for additional AWS resource types")
	flags.StringVar(&options.AssumptionsPath, "cost-assumptions", "", "JSON workload assumptions for cost estimates")
	return options
}
