package app

import (
	"context"

	"infralens/internal/adapters/pulumi/simulate"
)

// SimulationProject identifies a Pulumi stack and its Go project directory.
type SimulationProject = simulate.Project

// MockTopology writes an HTML report from Go projects executed with mocks.
// If supplied, onSimulation runs just before the projects are executed.
//
// Deprecated: this workflow will be superseded by unified IaC acquisition.
func MockTopology(ctx context.Context, projects []SimulationProject, output string, onSimulation func()) (Report, error) {
	if _, err := inspectOutput(output); err != nil {
		return Report{}, err
	}
	if onSimulation != nil {
		onSimulation()
	}
	g, err := simulate.Run(ctx, projects, output)
	if err != nil {
		return Report{}, err
	}
	return writeOutput(output, g, outputHTML)
}
