// Package cli owns user interaction and composes adapters with renderers.
package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"infralens/internal/adapters/pulumi"
	"infralens/internal/adapters/pulumi/simulate"
	"infralens/internal/graph"
	"infralens/internal/render"
)

func Run(args []string, stdout, stderr io.Writer) int {
	if err := run(args, stdout, stderr); err != nil {
		fmt.Fprintln(stderr, "infralens:", err)
		return 1
	}
	return 0
}

func run(args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		fmt.Fprintln(stdout, "Usage: InfraLens generate [--output infralens.html] [--no-open]\n       infralens <graph|render> --input [org/project/stack=]FILE [--input ...] --output FILE\nReads Pulumi export v3 or non-streaming preview JSON.\n       infralens simulate --project org/project/stack=DIRECTORY [--project ...] --output FILE")
		return nil
	}
	if args[0] == "generate" {
		return generate(args[1:], stdout, stderr)
	}
	if args[0] != "graph" && args[0] != "render" && args[0] != "simulate" {
		return errors.New("unknown command; use --help")
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	// Flag parsing errors can contain user-supplied values; report a fixed message.
	flags.SetOutput(io.Discard)
	var inputs []string
	flags.Func("input", "Pulumi JSON file, optionally org/project/stack=FILE; repeat for multiple stacks", func(value string) error {
		if value == "" {
			return errors.New("empty input")
		}
		inputs = append(inputs, value)
		return nil
	})
	var projects []simulate.Project
	flags.Func("project", "Go Pulumi project with deploy/infraMocks/withStackConfig test helpers: org/project/stack=DIRECTORY", func(value string) error {
		stack, directory, ok := strings.Cut(value, "=")
		if !ok || stack == "" || directory == "" {
			return errors.New("invalid project")
		}
		projects = append(projects, simulate.Project{Stack: stack, Directory: directory})
		return nil
	})
	output := flags.String("output", "", "destination file")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			if args[0] == "simulate" {
				fmt.Fprintln(stdout, "Usage: infralens simulate --project org/project/stack=DIRECTORY [--project ...] --output FILE")
			} else {
				fmt.Fprintln(stdout, "Usage: infralens", args[0], "--input [org/project/stack=]FILE [--input ...] --output FILE")
			}
			return nil
		}
		return errors.New("invalid flags; use --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("--output is required; positional arguments are unsupported")
	}
	if args[0] == "simulate" {
		if len(projects) == 0 || len(inputs) != 0 {
			return errors.New("simulate requires --project and does not accept --input")
		}
	} else if len(inputs) == 0 || len(projects) != 0 {
		return errors.New("graph/render require --input and do not accept --project")
	}
	outputInfo, err := inspectOutput(*output)
	if err != nil {
		return err
	}
	var g graph.Graph
	if args[0] == "simulate" {
		fmt.Fprintln(stderr, "Simulating trusted Go project code with test mocks; first build may take several minutes.")
		g, err = simulate.Run(context.Background(), projects, *output)
		if err != nil {
			return err
		}
	} else {
		var sources []pulumi.Source
		for _, input := range inputs {
			name, path := "", input
			if before, after, ok := strings.Cut(input, "="); ok {
				name, path = before, after
				if name == "" {
					return errors.New("missing input stack identity")
				}
			}
			in, err := os.Open(path)
			if err != nil {
				return errors.New("cannot open input file")
			}
			defer in.Close()
			info, err := in.Stat()
			if err != nil || !info.Mode().IsRegular() {
				return errors.New("input must be a regular file")
			}
			if outputInfo != nil && os.SameFile(info, outputInfo) {
				return errors.New("input and output must be different files")
			}
			sources = append(sources, pulumi.Source{Reader: in, Stack: name})
		}
		g, err = pulumi.ReadSources(sources...)
		if err != nil {
			return err
		}
	}
	return writeOutput(*output, g, args[0] == "graph", stderr)
}

func inspectOutput(path string) (os.FileInfo, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New("cannot inspect output file")
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("output must be a regular file")
	}
	return info, nil
}

func writeOutput(path string, g graph.Graph, asJSON bool, stderr io.Writer) error {
	var data bytes.Buffer
	var err error
	if asJSON {
		encoder := json.NewEncoder(&data)
		encoder.SetIndent("", "  ")
		err = encoder.Encode(g)
	} else {
		err = render.HTML(&data, g)
	}
	if err != nil {
		return errors.New("cannot encode output")
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".infralens-*")
	if err != nil {
		return errors.New("cannot create output file")
	}
	defer os.Remove(tmp.Name())
	_, writeErr := tmp.Write(data.Bytes())
	closeErr := tmp.Close()
	if writeErr != nil || closeErr != nil {
		return errors.New("cannot write output file")
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return errors.New("cannot replace output file")
	}
	if g.OmittedRelations > 0 {
		fmt.Fprintln(stderr, "Omitted references to hidden or missing resources:", g.OmittedRelations)
	}
	return nil
}
