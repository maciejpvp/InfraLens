// Package awscdk translates synthesized CloudFormation JSON into a graph.
package awscdk

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"infralens/internal/fileio"
	"infralens/internal/graph"
)

type resource struct {
	Type       string         `json:"Type"`
	DependsOn  dependsOn      `json:"DependsOn"`
	Properties map[string]any `json:"Properties"`
}

type template struct {
	Resources  map[string]resource        `json:"Resources"`
	Parameters map[string]json.RawMessage `json:"Parameters"`
	Outputs    map[string]json.RawMessage `json:"Outputs"`
}

type dependsOn []string

func (deps *dependsOn) UnmarshalJSON(data []byte) error {
	var one string
	if len(data) > 0 && data[0] == '"' && json.Unmarshal(data, &one) == nil {
		*deps = []string{one}
		return nil
	}
	return json.Unmarshal(data, (*[]string)(deps))
}

var (
	stackAlias   = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)
	logicalID    = regexp.MustCompile(`^[A-Za-z0-9]+$`)
	resourceType = regexp.MustCompile(`^(?:[A-Za-z0-9]+::[A-Za-z0-9]+::[A-Za-z0-9]+|Custom::[A-Za-z0-9_@-]+)$`)
)

// ReadInputs builds a graph from one or more JSON templates emitted by cdk synth.
func ReadInputs(inputs []string, open func(string) (io.Reader, error)) (graph.Graph, error) {
	sources := make([]source, 0, len(inputs))
	for _, input := range inputs {
		stack, path := splitInput(input)
		sources = append(sources, source{stack: stack, path: path})
	}
	return readSources(sources, open)
}

type source struct {
	stack    string
	path     string
	diffName string
}

func readSources(sources []source, open func(string) (io.Reader, error)) (graph.Graph, error) {
	if len(sources) == 0 {
		return graph.Graph{}, errors.New("at least one CDK template is required")
	}
	g := graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{}, Edges: []graph.Edge{}}
	seen := make(map[string]bool, len(sources))
	for _, input := range sources {
		stack, path := input.stack, input.path
		if stack == "" || seen[stack] {
			return graph.Graph{}, errors.New("CDK input stack names must be non-empty and unique")
		}
		seen[stack] = true
		reader, err := open(path)
		if err != nil {
			return graph.Graph{}, err
		}
		doc, err := readTemplate(reader)
		if err != nil {
			return graph.Graph{}, err
		}
		doc.addTo(&g, stack)
	}
	g.Normalize()
	return g, g.Validate()
}

func splitInput(input string) (stack, path string) {
	stack, path, named := strings.Cut(input, "=")
	if named && stackAlias.MatchString(stack) && !fileio.Exists(input) {
		return stack, path
	}
	base := filepath.Base(input)
	return strings.TrimSuffix(strings.TrimSuffix(base, ".json"), ".template"), input
}

func readTemplate(reader io.Reader) (template, error) {
	var doc template
	decoder := json.NewDecoder(reader)
	decoder.UseNumber()
	if decoder.Decode(&doc) != nil || (doc.Resources == nil && doc.Parameters == nil && doc.Outputs == nil) {
		return template{}, errors.New("expected a CloudFormation JSON template")
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return template{}, errors.New("expected one CloudFormation JSON template")
	}
	for id, res := range doc.Resources {
		if !logicalID.MatchString(id) || !resourceType.MatchString(res.Type) {
			return template{}, errors.New("invalid CloudFormation resource identity")
		}
		for _, target := range res.DependsOn {
			if !logicalID.MatchString(target) {
				return template{}, errors.New("invalid CloudFormation DependsOn target")
			}
		}
	}
	return doc, nil
}

func resourceNode(stack, id, kind string) graph.Node {
	sum := sha256.Sum256([]byte("aws-cdk\x00" + stack + "\x00" + id))
	return graph.Node{
		ID: hex.EncodeToString(sum[:]), Name: id, Stack: stack, Type: kind, Provider: "aws", Service: service(kind),
	}
}

func (doc template) addTo(g *graph.Graph, stack string) {
	b := stackGraph{graph: g, ids: make(map[string]string, len(doc.Resources)), edges: map[edgeKey]int{}}
	for id, res := range doc.Resources {
		node := resourceNode(stack, id, res.Type)
		b.ids[id] = node.ID
		g.Nodes = append(g.Nodes, node)
	}
	for id, res := range doc.Resources {
		omitted := map[string]bool{}
		link := func(target, source, property string) {
			if b.ids[target] != "" {
				b.link(id, target, graph.DependsOn, id, source, property)
			} else {
				omitted[target] = true
			}
		}
		for _, target := range res.DependsOn {
			link(target, "DependsOn", "DependsOn")
		}
		walkReferences(res.Properties, func(target, source string) {
			if _, parameter := doc.Parameters[target]; !parameter && !strings.HasPrefix(target, "AWS::") {
				link(target, source, "Properties")
			}
		})
		g.OmittedRelations += len(omitted)
		doc.linkFlows(&b, id, res)
	}
	doc.linkAppSync(&b)
}

func service(resourceType string) string {
	_, rest, _ := strings.Cut(resourceType, "::")
	name, _, found := strings.Cut(rest, "::")
	if !found {
		if resourceType == bucketNotification {
			return "s3"
		}
		return ""
	}
	switch name {
	case "ApiGateway", "ApiGatewayV2":
		return "api-gateway"
	case "Events", "EventSchemas", "Pipes", "Scheduler":
		return "eventbridge"
	case "StepFunctions":
		return "step-functions"
	case "OpenSearchService":
		return "opensearch"
	default:
		return strings.ToLower(name)
	}
}

type edgeKey struct {
	from, to string
	kind     graph.Kind
}

type stackGraph struct {
	graph *graph.Graph
	ids   map[string]string
	edges map[edgeKey]int
}

func (b *stackGraph) link(from, to string, kind graph.Kind, resource, source, property string) {
	b.linkEvidence(from, to, kind, graph.Evidence{Source: source, Resource: b.ids[resource], Property: property})
}

func (b *stackGraph) linkEvidence(from, to string, kind graph.Kind, evidence graph.Evidence) {
	key := edgeKey{b.ids[from], b.ids[to], kind}
	if key.from == "" || key.to == "" || key.from == key.to {
		return
	}
	if index, ok := b.edges[key]; ok {
		edge := &b.graph.Edges[index]
		if !slices.Contains(edge.Evidence, evidence) {
			edge.Evidence = append(edge.Evidence, evidence)
		}
		return
	}
	b.edges[key] = len(b.graph.Edges)
	b.graph.Edges = append(b.graph.Edges, graph.Edge{
		From: key.from, To: key.to, Kind: kind, Evidence: []graph.Evidence{evidence},
	})
}
