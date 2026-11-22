// Package app runs InfraLens report workflows.
package app

// Report describes a successfully written report.
type Report struct {
	Path             string
	OmittedRelations int
}

// Graph writes a JSON graph built by read.
func Graph(inputs []string, output string, read ReadInputsFunc) (Report, error) {
	return reportFromInputs(inputs, output, read, outputJSON)
}

// Render writes an HTML report from the graph built by read.
func Render(inputs []string, output string, read ReadInputsFunc) (Report, error) {
	return reportFromInputs(inputs, output, read, outputHTML)
}

func reportFromInputs(inputs []string, output string, read ReadInputsFunc, format outputFormat) (Report, error) {
	info, err := inspectOutput(output)
	if err != nil {
		return Report{}, err
	}
	g, err := readInputs(inputs, info, read)
	if err != nil {
		return Report{}, err
	}
	return writeOutput(output, g, format)
}
