// Package app runs InfraLens report workflows.
package app

// Report describes a successfully written report.
type Report struct {
	Path             string
	OmittedRelations int
}

// Graph writes a JSON graph for the supplied Pulumi inputs.
func Graph(inputs []string, output string) (Report, error) {
	return reportFromInputs(inputs, output, outputJSON)
}

// Render writes an HTML report for the supplied Pulumi inputs.
func Render(inputs []string, output string) (Report, error) {
	return reportFromInputs(inputs, output, outputHTML)
}

func reportFromInputs(inputs []string, output string, format outputFormat) (Report, error) {
	info, err := inspectOutput(output)
	if err != nil {
		return Report{}, err
	}
	g, err := readInputs(inputs, info)
	if err != nil {
		return Report{}, err
	}
	return writeOutput(output, g, format)
}
