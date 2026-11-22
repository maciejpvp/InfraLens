// Package cli owns user interaction and composes adapters with renderers.
package cli

import (
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

type commandLine struct {
	stdout, stderr io.Writer
}

const graphUsage = " --input [org/project/stack=]FILE [--input ...] --output FILE"
const simulateUsage = "infralens simulate --project org/project/stack=DIRECTORY [--project ...] --output FILE"

func Run(args []string, stdout, stderr io.Writer) int {
	c := commandLine{stdout: stdout, stderr: stderr}
	if err := c.run(args); err != nil {
		fmt.Fprintln(stderr, "infralens:", err)
		return 1
	}
	return 0
}

func (c commandLine) run(args []string) error {
	if len(args) == 0 {
		c.help()
		return nil
	}
	switch args[0] {
	case "help", "--help", "-h":
		c.help()
		return nil
	case "generate":
		return c.generate(args[1:])
	case "graph", "render":
		return c.graphOrRender(args[0], args[1:])
	case "simulate":
		return c.simulate(args[1:])
	default:
		return errors.New("unknown command; use --help")
	}
}

func (c commandLine) help() {
	fmt.Fprintln(c.stdout, "Usage: InfraLens generate [--output infralens.html] [--no-open]\n       infralens <graph|render>"+graphUsage+
		"\nReads Pulumi export v3 or non-streaming preview JSON.\n       "+simulateUsage)
}

func (c commandLine) graphOrRender(command string, args []string) error {
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	// Flag parsing errors can contain user-supplied values.
	flags.SetOutput(io.Discard)
	var inputs []string
	flags.Func("input", "Pulumi JSON file, optionally org/project/stack=FILE; repeat for multiple stacks", func(value string) error {
		if value == "" {
			return errors.New("empty input")
		}
		inputs = append(inputs, value)
		return nil
	})
	output := flags.String("output", "", "destination file")
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprintln(c.stdout, "Usage: infralens "+command+graphUsage)
		return nil
	}
	if err != nil {
		return errors.New("invalid flags; use --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("--output is required; positional arguments are unsupported")
	}
	if len(inputs) == 0 {
		return errors.New("graph/render require --input and do not accept --project")
	}
	outputInfo, err := inspectOutput(*output)
	if err != nil {
		return err
	}
	g, err := readInputs(inputs, outputInfo)
	if err != nil {
		return err
	}
	return c.writeOutput(*output, g, command == "graph")
}

func (c commandLine) simulate(args []string) error {
	flags := flag.NewFlagSet("simulate", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
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
	err := flags.Parse(args)
	if errors.Is(err, flag.ErrHelp) {
		fmt.Fprintln(c.stdout, "Usage: "+simulateUsage)
		return nil
	}
	if err != nil {
		return errors.New("invalid flags; use --help")
	}
	if *output == "" || flags.NArg() != 0 {
		return errors.New("--output is required; positional arguments are unsupported")
	}
	if len(projects) == 0 {
		return errors.New("simulate requires --project and does not accept --input")
	}
	if _, err := inspectOutput(*output); err != nil {
		return err
	}
	fmt.Fprintln(c.stderr, "Simulating trusted Go project code with test mocks; first build may take several minutes.")
	g, err := simulate.Run(context.Background(), projects, *output)
	if err != nil {
		return err
	}
	return c.writeOutput(*output, g, false)
}

func readInputs(inputs []string, outputInfo os.FileInfo) (graph.Graph, error) {
	sources := make([]pulumi.Source, 0, len(inputs))
	for _, input := range inputs {
		name, path := splitInput(input)
		info, err := os.Stat(path)
		if err != nil {
			return graph.Graph{}, errors.New("cannot open input file")
		}
		if !info.Mode().IsRegular() {
			return graph.Graph{}, errors.New("input must be a regular file")
		}
		in, err := os.Open(path)
		if err != nil {
			return graph.Graph{}, errors.New("cannot open input file")
		}
		defer in.Close()
		info, err = in.Stat()
		if err != nil || !info.Mode().IsRegular() {
			return graph.Graph{}, errors.New("input must be a regular file")
		}
		if outputInfo != nil && os.SameFile(info, outputInfo) {
			return graph.Graph{}, errors.New("input and output must be different files")
		}
		sources = append(sources, pulumi.Source{Reader: in, Stack: name})
	}
	return pulumi.ReadSources(sources...)
}

func splitInput(input string) (stack, path string) {
	stack, path, named := strings.Cut(input, "=")
	if !named {
		return "", input
	}
	if _, ok := pulumi.ParseStackIdentity(stack); !ok {
		return "", input
	}
	if _, err := os.Stat(input); err == nil {
		return "", input
	}
	return stack, path
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

func (c commandLine) writeOutput(path string, g graph.Graph, asJSON bool) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".infralens-*")
	if err != nil {
		return errors.New("cannot create output file")
	}
	defer os.Remove(tmp.Name())
	if asJSON {
		encoder := json.NewEncoder(tmp)
		encoder.SetIndent("", "  ")
		err = encoder.Encode(g)
	} else {
		err = render.HTML(tmp, g)
	}
	closeErr := tmp.Close()
	if err != nil || closeErr != nil {
		return errors.New("cannot write output file")
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return errors.New("cannot replace output file")
	}
	if g.OmittedRelations > 0 {
		fmt.Fprintln(c.stderr, "Omitted references to hidden or missing resources:", g.OmittedRelations)
	}
	return nil
}
