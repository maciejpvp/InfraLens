package app

import (
	"context"
	"errors"
	"fmt"
	"io"

	"laytrace/internal/cost"
	"laytrace/internal/fileio"
	"laytrace/internal/graph"
)

type CostOptions struct {
	Enabled         bool
	Region          string
	RulesPath       string
	AssumptionsPath string
}

func (o CostOptions) inventory() *cost.Inventory {
	if o.Enabled {
		return &cost.Inventory{}
	}
	return nil
}

func loadCosts(options ReportOptions) (cost.Estimator, error) {
	o := options.Costs
	if options.Sidecars.Cost != "" && !o.Enabled {
		return cost.Estimator{}, errors.New("--cost-output requires --costs")
	}
	if o.Region != "" && (!o.Enabled || !cost.ValidRegion(o.Region)) {
		return cost.Estimator{}, errors.New("--cost-region requires --costs and a valid AWS region")
	}
	outputs := []string{options.Output, options.Sidecars.Graph, options.Sidecars.Cost}
	pricing := cost.Estimator{Region: o.Region}
	if o.RulesPath != "" {
		if !o.Enabled {
			return cost.Estimator{}, errors.New("--cost-rules requires --costs")
		}
		file, err := openCostInput(o.RulesPath, "cost rules", outputs...)
		if err != nil {
			return cost.Estimator{}, err
		}
		defer file.Close()
		pricing.Rules, err = cost.ReadRules(file)
		if err != nil {
			return cost.Estimator{}, err
		}
	}
	if o.AssumptionsPath != "" {
		if !o.Enabled {
			return cost.Estimator{}, errors.New("--cost-assumptions requires --costs")
		}
		file, err := openCostInput(o.AssumptionsPath, "cost assumptions", outputs...)
		if err != nil {
			return cost.Estimator{}, err
		}
		defer file.Close()
		pricing.Usage, err = cost.ReadUsage(file)
		if err != nil {
			return cost.Estimator{}, err
		}
	}
	return pricing, nil
}

func openCostInput(path, label string, outputs ...string) (io.ReadCloser, error) {
	file, info, err := fileio.OpenRegular(path)
	if err != nil {
		return nil, fmt.Errorf("cannot open %s file", label)
	}
	for _, output := range outputs {
		outputInfo, _ := fileio.StatRegular(output)
		if fileio.SameFile(info, outputInfo) {
			file.Close()
			return nil, fmt.Errorf("%s and output must be different files", label)
		}
	}
	return file, nil
}

func (a *App) estimateCosts(ctx context.Context, g graph.Graph, inventory *cost.Inventory, pricing cost.Estimator) (*cost.Report, error) {
	if inventory == nil {
		return nil, nil
	}
	if err := g.Validate(); err != nil {
		return nil, err
	}
	report, err := pricing.Estimate(ctx, *inventory, func() {
		a.notify("Estimating costs from public AWS prices.")
	})
	if err != nil {
		return nil, err
	}
	if report.Usage != nil {
		for _, warning := range report.Usage.Warnings {
			a.notify("Cost assumptions: " + warning)
		}
	}
	return report, nil
}
