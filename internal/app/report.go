// Package app runs InfraLens report workflows.
package app

import "os"

// Report describes a successfully written report.
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

// Graph writes a JSON graph built by read.
func Graph(inputs []string, output string, read ReadInputsFunc) (Report, error) {
	info, err := inspectOutput(output)
	if err != nil {
		return Report{}, err
	}
	g, err := readInputs(inputs, []os.FileInfo{info}, read)
	if err != nil {
		return Report{}, err
	}
	return writeOutput(output, g, outputJSON)
}

// Render writes an HTML report from the graph built by read.
func Render(inputs []string, output string, sidecars Sidecars, read ReadInputsFunc) (Report, error) {
	destinations, err := inspectReportOutputs(output, sidecars)
	if err != nil {
		return Report{}, err
	}
	g, err := readInputs(inputs, destinations, read)
	if err != nil {
		return Report{}, err
	}
	return writeReport(output, sidecars, g)
}
