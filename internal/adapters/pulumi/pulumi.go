// Package pulumi translates export v3 and non-streaming preview JSON into a graph.
package pulumi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"slices"
	"strings"

	"infralens/internal/graph"
)

// Only fields allowed to influence the public graph are decoded.
type resource struct {
	URN                  string                     `json:"urn"`
	Type                 string                     `json:"type"`
	Parent               string                     `json:"parent"`
	Dependencies         []string                   `json:"dependencies"`
	PropertyDependencies map[string][]string        `json:"propertyDependencies"`
	ID                   string                     `json:"id"`
	Inputs               map[string]json.RawMessage `json:"inputs"`
	Outputs              map[string]json.RawMessage `json:"outputs"`
}

type resourceState struct {
	res   resource
	state string
}

type step struct {
	Op  string    `json:"op"`
	URN string    `json:"urn"`
	Old *resource `json:"oldState"`
	New *resource `json:"newState"`
}

func id(urn string) string { sum := sha256.Sum256([]byte(urn)); return hex.EncodeToString(sum[:]) }

// Source optionally supplies the fully qualified stack name missing from exports.
type Source struct {
	Reader io.Reader
	Stack  string
}

func Read(r io.Reader) (graph.Graph, error) {
	return ReadSources(Source{Reader: r})
}

func ReadSources(sources ...Source) (graph.Graph, error) {
	b := graphBuilder{
		graph:   graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{}, Edges: []graph.Edge{}},
		nodeIDs: map[string]string{}, roots: map[string]string{}, edges: map[edgeKey]int{},
		multi: len(sources) > 1,
	}
	if len(sources) == 0 {
		return b.graph, errors.New("at least one input is required")
	}
	for _, source := range sources {
		if err := b.readSource(source); err != nil {
			return b.graph, err
		}
	}
	for _, entry := range b.resources {
		b.linkResource(entry)
	}
	b.linkAWSRelations()
	b.graph.Normalize()
	return b.graph, b.graph.Validate()
}

// ParseStackIdentity returns the project/stack portion shared with resource URNs.
func ParseStackIdentity(identity string) (string, bool) {
	parts := strings.Split(identity, "/")
	if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return "", false
	}
	return parts[1] + "/" + parts[2], true
}

type edgeKey struct {
	from, to string
	kind     graph.Kind
	state    string
}

type graphBuilder struct {
	graph     graph.Graph
	nodeIDs   map[string]string
	roots     map[string]string
	edges     map[edgeKey]int
	resources []resourceState
	multi     bool
	preview   bool
}

type document struct {
	Version    int `json:"version"`
	Deployment *struct {
		Resources []resource `json:"resources"`
	} `json:"deployment"`
	Steps json.RawMessage `json:"steps"`
}

func decodeDocument(reader io.Reader) (document, error) {
	var doc document
	decoder := json.NewDecoder(reader)
	if decoder.Decode(&doc) != nil {
		return doc, errors.New("invalid Pulumi JSON")
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return doc, errors.New("expected one JSON document; streaming JSON is unsupported")
	}
	return doc, nil
}

func (b *graphBuilder) readSource(source Source) error {
	if source.Reader == nil {
		return errors.New("missing input reader")
	}
	var stack string
	if source.Stack != "" {
		var ok bool
		stack, ok = ParseStackIdentity(source.Stack)
		if !ok || b.roots[source.Stack] != "" {
			return errors.New("input stack names must be unique org/project/stack identities")
		}
	}
	doc, err := decodeDocument(source.Reader)
	if err != nil {
		return err
	}
	var root string
	switch {
	case doc.Deployment != nil && doc.Steps == nil:
		if doc.Version != 3 {
			return errors.New("unsupported Pulumi export version; expected version 3")
		}
		for _, res := range doc.Deployment.Resources {
			if err := b.addNode(res, "", stack, &root); err != nil {
				return err
			}
			b.resources = append(b.resources, resourceState{res, ""})
		}
	case doc.Deployment == nil && doc.Steps != nil:
		if err := b.readPreview(doc.Steps, stack, &root); err != nil {
			return err
		}
	default:
		return errors.New("expected Pulumi export or preview steps")
	}
	if source.Stack == "" {
		return nil
	}
	if root == "" {
		return errors.New("named input must contain its stack root; include unchanged resources in preview")
	}
	b.roots[source.Stack] = root
	return nil
}

func (b *graphBuilder) addNode(res resource, change graph.Change, expectedStack string, root *string) error {
	parts := strings.Split(res.URN, "::")
	if len(parts) != 4 || !strings.HasPrefix(parts[0], "urn:pulumi:") || parts[1] == "" || parts[2] == "" || parts[3] == "" || res.Type == "" {
		return errors.New("invalid Pulumi resource identity")
	}
	if _, seen := b.nodeIDs[res.URN]; seen {
		return errors.New("duplicate Pulumi resource")
	}
	stack := parts[1] + "/" + strings.TrimPrefix(parts[0], "urn:pulumi:")
	if expectedStack != "" && expectedStack != stack {
		return errors.New("input stack identity does not match resource URN")
	}
	b.nodeIDs[res.URN] = ""
	if res.Type == "pulumi:pulumi:Stack" {
		if *root != "" {
			return errors.New("multiple stack roots in one input")
		}
		*root = res.URN
		if !b.multi {
			return nil
		}
	}
	if strings.HasPrefix(res.Type, "pulumi:providers:") {
		return nil
	}
	nodeID := id(res.URN)
	b.nodeIDs[res.URN] = nodeID
	provider, _, _ := strings.Cut(res.Type, ":")
	b.graph.Nodes = append(b.graph.Nodes, graph.Node{
		ID: nodeID, Name: parts[3], Type: res.Type, Provider: provider, Change: change, Stack: stack,
	})
	return nil
}

func (b *graphBuilder) readPreview(raw json.RawMessage, stack string, root *string) error {
	var steps []step
	if json.Unmarshal(raw, &steps) != nil || steps == nil {
		return errors.New("invalid Pulumi preview steps")
	}
	b.preview = true
	for _, s := range steps {
		change, err := normalizePreviewStep(s)
		if err != nil {
			return err
		}
		res := s.New
		if res == nil {
			res = s.Old
		}
		if err := b.addNode(*res, change, stack, root); err != nil {
			return err
		}
		if s.Old != nil {
			b.resources = append(b.resources, resourceState{*s.Old, "before"})
		}
		if s.New != nil {
			b.resources = append(b.resources, resourceState{*s.New, "after"})
		}
	}
	return nil
}

func normalizePreviewStep(s step) (graph.Change, error) {
	var change graph.Change
	// shortcut: logical preview operations only, extend with fixtures for other Pulumi operations.
	switch s.Op {
	case "same":
		change = graph.Unchanged
	case "create":
		change = graph.Create
	case "update":
		change = graph.Update
	case "delete":
		change = graph.Delete
	case "replace":
		change = graph.Replace
	default:
		return "", errors.New("unsupported Pulumi preview operation")
	}
	if s.URN == "" || (s.Old != nil && s.Old.URN != s.URN) || (s.New != nil && s.New.URN != s.URN) {
		return "", errors.New("inconsistent preview resource identity")
	}
	if (change == graph.Create && s.New == nil) || (change == graph.Delete && s.Old == nil) ||
		((change == graph.Update || change == graph.Replace) && (s.Old == nil || s.New == nil)) ||
		(s.Old == nil && s.New == nil) {
		return "", errors.New("missing preview resource state")
	}
	if change != graph.Unchanged || s.Old == nil || s.New == nil {
		return change, nil
	}
	// Unchanged preview registrations can omit IDs and provider outputs.
	if s.New.ID == "" {
		s.New.ID = s.Old.ID
	}
	if len(s.New.Outputs) == 0 {
		s.New.Outputs = s.Old.Outputs
	}
	return change, nil
}

func (b *graphBuilder) link(from, to string, kind graph.Kind, state string, evidence graph.Evidence) {
	from, to = b.nodeIDs[from], b.nodeIDs[to]
	if from == "" || to == "" {
		b.graph.OmittedRelations++
		return
	}
	key := edgeKey{from, to, kind, state}
	if i, ok := b.edges[key]; ok {
		edge := &b.graph.Edges[i]
		if !slices.Contains(edge.Evidence, evidence) {
			edge.Evidence = append(edge.Evidence, evidence)
		}
		return
	}
	b.edges[key] = len(b.graph.Edges)
	b.graph.Edges = append(b.graph.Edges, graph.Edge{From: from, To: to, Kind: kind, State: state, Evidence: []graph.Evidence{evidence}})
}

func (b *graphBuilder) linkResource(entry resourceState) {
	r := entry.res
	if b.nodeIDs[r.URN] == "" {
		return
	}
	if b.multi && r.Type == "pulumi:pulumi:StackReference" {
		root := b.roots[scalar(r.Inputs["name"])]
		b.link(r.URN, root, graph.DependsOn, entry.state, graph.Evidence{Source: "stackReference", Property: "inputs.name"})
	}
	if r.Parent != "" {
		b.link(r.Parent, r.URN, graph.Contains, entry.state, graph.Evidence{Source: "parent"})
	}
	for _, dep := range r.Dependencies {
		b.link(r.URN, dep, graph.DependsOn, entry.state, graph.Evidence{Source: "dependencies"})
	}
	for property, deps := range r.PropertyDependencies {
		for _, dep := range deps {
			b.link(r.URN, dep, graph.DependsOn, entry.state, graph.Evidence{Source: "propertyDependencies", Property: property})
		}
	}
}
