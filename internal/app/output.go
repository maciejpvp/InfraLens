package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"laytrace/internal/cost"
	"laytrace/internal/fileio"
	"laytrace/internal/graph"
	"laytrace/internal/render"
)

type outputFormat uint8

const (
	outputJSON outputFormat = iota
	outputCostJSON
)

func inspectOutput(path string) (os.FileInfo, error) {
	info, err := fileio.StatRegular(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if errors.Is(err, fileio.ErrNotRegular) {
		return nil, errors.New("output must be a regular file")
	}
	if err != nil {
		return nil, errors.New("cannot inspect output file")
	}
	return info, nil
}

func inspectReportOutputs(output string, sidecars Sidecars) ([]os.FileInfo, error) {
	var infos []os.FileInfo
	paths := map[string]bool{}
	for index, path := range []string{output, sidecars.Graph, sidecars.Cost} {
		if index > 0 && path == "" {
			continue
		}
		absolute, err := filepath.Abs(path)
		if err != nil {
			return nil, errors.New("cannot resolve report output path")
		}
		if parent, err := filepath.EvalSymlinks(filepath.Dir(absolute)); err == nil {
			absolute = filepath.Join(parent, filepath.Base(absolute))
		}
		info, err := inspectOutput(path)
		if err != nil {
			return nil, err
		}
		if paths[absolute] {
			return nil, errors.New("report outputs must be different files")
		}
		for _, other := range infos {
			if fileio.SameFile(info, other) {
				return nil, errors.New("report outputs must be different files")
			}
		}
		if index > 0 && filepath.Ext(path) != ".json" {
			return nil, errors.New("graph and cost outputs must have a .json extension")
		}
		paths[absolute] = true
		infos = append(infos, info)
	}
	return infos, nil
}

func writeReport(output string, sidecars Sidecars, g graph.Graph, costs *cost.Report) (Report, error) {
	if sidecars.Cost != "" && costs == nil {
		return Report{}, errors.New("no cost data available to write")
	}
	if err := checkSidecars(sidecars); err != nil {
		return Report{}, err
	}
	if err := fileio.WriteAtomic(output, func(w io.Writer) error {
		return render.HTML(w, g, costs)
	}); err != nil {
		return Report{}, err
	}
	report := Report{Path: output, OmittedRelations: g.OmittedRelations}
	if sidecars.Graph != "" {
		if _, err := inspectReportOutputs(output, sidecars); err != nil {
			return report, err
		}
		if err := checkSidecar(sidecars.Graph, outputJSON); err != nil {
			return report, err
		}
		if err := writeGraph(sidecars.Graph, g); err != nil {
			return report, fmt.Errorf("cannot save graph: %w", err)
		}
		report.GraphPath = sidecars.Graph
	}
	if sidecars.Cost != "" {
		if _, err := inspectReportOutputs(output, sidecars); err != nil {
			return report, err
		}
		if err := checkSidecar(sidecars.Cost, outputCostJSON); err != nil {
			return report, err
		}
		err := fileio.WriteAtomic(sidecars.Cost, func(w io.Writer) error {
			return json.NewEncoder(w).Encode(costs)
		})
		if err != nil {
			return report, fmt.Errorf("cannot save cost data: %w", err)
		}
		report.CostPath = sidecars.Cost
	}
	return report, nil
}

func checkSidecars(sidecars Sidecars) error {
	if err := checkSidecar(sidecars.Graph, outputJSON); err != nil {
		return err
	}
	return checkSidecar(sidecars.Cost, outputCostJSON)
}

func checkSidecar(path string, format outputFormat) error {
	if path == "" {
		return nil
	}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("cannot inspect existing JSON output as a regular file")
	}
	file, opened, err := fileio.OpenRegular(path)
	if err != nil {
		return errors.New("cannot open existing JSON output")
	}
	defer file.Close()
	if !fileio.SameFile(info, opened) {
		return errors.New("existing JSON output changed during inspection")
	}

	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var valid bool
	kind := "graph"
	if format == outputJSON {
		var report struct {
			graph.Graph
			OmittedRelations *int `json:"omittedRelations"`
		}
		if decoder.Decode(&report) == nil && report.OmittedRelations != nil {
			report.Graph.OmittedRelations = *report.OmittedRelations
			valid = report.Graph.Validate() == nil
		}
	} else {
		kind = "cost"
		var report cost.Report
		if decoder.Decode(&report) == nil && report.After != nil && report.Rates != nil {
			_, err := time.Parse(time.DateOnly, report.Date)
			valid = err == nil
		}
	}
	var extra json.RawMessage
	if !valid || decoder.Decode(&extra) != io.EOF {
		return fmt.Errorf("existing JSON output is not an Laytrace %s report; choose a new output path", kind)
	}
	return nil
}

func writeGraph(path string, g graph.Graph) error {
	if err := g.Validate(); err != nil {
		return err
	}
	return fileio.WriteAtomic(path, func(w io.Writer) error {
		encoder := json.NewEncoder(w)
		encoder.SetIndent("", "  ")
		return encoder.Encode(g)
	})
}
