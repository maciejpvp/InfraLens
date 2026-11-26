package app

import (
	"context"
	"fmt"
	"os"
)

// Report includes any files written before a later sidecar failed.
type Report struct {
	Path             string
	GraphPath        string
	CostPath         string
	OmittedRelations int
}

// Sidecars are optional machine-readable outputs built from the HTML report data.
type Sidecars struct {
	Graph string
	Cost  string
}

type ReportOptions struct {
	Provider string
	Output   string
	Sidecars Sidecars
	Costs    CostOptions
}

func (a *App) Graph(providerName string, inputs []string, output string) (Report, error) {
	provider, err := a.provider(providerName)
	if err != nil {
		return Report{}, err
	}
	if provider.Adapter == nil {
		return Report{}, fmt.Errorf("provider %q does not support file inputs", providerName)
	}
	info, err := inspectOutput(output)
	if err != nil {
		return Report{}, err
	}
	g, err := readInputs(inputs, []os.FileInfo{info}, provider.Adapter, nil)
	if err != nil {
		return Report{}, err
	}
	if err := writeGraph(output, g); err != nil {
		return Report{}, err
	}
	return Report{Path: output, OmittedRelations: g.OmittedRelations}, nil
}

func (a *App) Render(ctx context.Context, inputs []string, options ReportOptions) (Report, error) {
	pricing, err := loadCosts(options)
	if err != nil {
		return Report{}, err
	}
	provider, err := a.provider(options.Provider)
	if err != nil {
		return Report{}, err
	}
	if provider.Adapter == nil {
		return Report{}, fmt.Errorf("provider %q does not support file inputs", options.Provider)
	}
	destinations, err := inspectReportOutputs(options.Output, options.Sidecars)
	if err != nil {
		return Report{}, err
	}
	inventory := options.Costs.inventory()
	g, err := readInputs(inputs, destinations, provider.Adapter, inventory)
	if err != nil {
		return Report{}, err
	}
	costs, err := a.estimateCosts(ctx, g, inventory, pricing)
	if err != nil {
		return Report{}, err
	}
	return writeReport(options.Output, options.Sidecars, g, costs)
}
