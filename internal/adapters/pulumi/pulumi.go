// Package pulumi translates export v3 and non-streaming preview JSON into a graph.
package pulumi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
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
	g := graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{}, Edges: []graph.Edge{}}
	if len(sources) == 0 {
		return g, errors.New("at least one input is required")
	}
	var resources []resourceState
	seen := map[string]bool{}
	roots := map[string]string{}
	named := map[string]bool{}
	for _, source := range sources {
		if source.Reader == nil {
			return g, errors.New("missing input reader")
		}
		if source.Stack != "" {
			parts := strings.Split(source.Stack, "/")
			if len(parts) != 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" || named[source.Stack] {
				return g, errors.New("input stack names must be unique org/project/stack identities")
			}
			named[source.Stack] = true
		}
		foundRoot := false

		var doc struct {
			Version    int `json:"version"`
			Deployment *struct {
				Resources []resource `json:"resources"`
			} `json:"deployment"`
			Steps json.RawMessage `json:"steps"`
		}
		decoder := json.NewDecoder(source.Reader)
		if err := decoder.Decode(&doc); err != nil {
			return graph.Graph{}, errors.New("invalid Pulumi JSON")
		}
		var trailing any
		if err := decoder.Decode(&trailing); err != io.EOF {
			return graph.Graph{}, errors.New("expected one JSON document; streaming JSON is unsupported")
		}
		add := func(res resource, change graph.Change) error {
			parts := strings.Split(res.URN, "::")
			if len(parts) != 4 || !strings.HasPrefix(parts[0], "urn:pulumi:") || parts[1] == "" || parts[2] == "" || parts[3] == "" || res.Type == "" {
				return errors.New("invalid Pulumi resource identity")
			}
			if seen[res.URN] {
				return errors.New("duplicate Pulumi resource")
			}
			seen[res.URN] = true
			stack := parts[1] + "/" + strings.TrimPrefix(parts[0], "urn:pulumi:")
			if source.Stack != "" {
				identity := strings.Split(source.Stack, "/")
				if identity[1]+"/"+identity[2] != stack {
					return errors.New("input stack identity does not match resource URN")
				}
			}
			if res.Type == "pulumi:pulumi:Stack" {
				if foundRoot {
					return errors.New("multiple stack roots in one input")
				}
				foundRoot = true
				if source.Stack != "" {
					roots[source.Stack] = res.URN
				}
				if len(sources) == 1 {
					return nil
				}
			}
			if strings.HasPrefix(res.Type, "pulumi:providers:") {
				return nil
			}
			g.Nodes = append(g.Nodes, graph.Node{ID: id(res.URN), Name: parts[3], Type: res.Type, Provider: strings.SplitN(res.Type, ":", 2)[0], Change: change, Stack: stack})
			return nil
		}
		switch {
		case doc.Deployment != nil && doc.Steps == nil:
			if doc.Version != 3 {
				return g, errors.New("unsupported Pulumi export version; expected version 3")
			}
			for _, r := range doc.Deployment.Resources {
				if err := add(r, ""); err != nil {
					return g, err
				}
				resources = append(resources, resourceState{r, ""})
			}
		case doc.Deployment == nil && doc.Steps != nil:
			var steps []step
			if err := json.Unmarshal(doc.Steps, &steps); err != nil || string(doc.Steps) == "null" {
				return g, errors.New("invalid Pulumi preview steps")
			}
			for _, s := range steps {
				var change graph.Change
				// shortcut: only logical preview operations, extend with fixtures for other Pulumi operations.
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
					return g, errors.New("unsupported Pulumi preview operation")
				}
				if s.URN == "" || (s.Old != nil && s.Old.URN != s.URN) || (s.New != nil && s.New.URN != s.URN) {
					return g, errors.New("inconsistent preview resource identity")
				}
				if (change == graph.Create && s.New == nil) || (change == graph.Delete && s.Old == nil) || ((change == graph.Update || change == graph.Replace) && (s.Old == nil || s.New == nil)) || (s.Old == nil && s.New == nil) {
					return g, errors.New("missing preview resource state")
				}
				// Unchanged preview registrations can omit IDs and provider outputs.
				if change == graph.Unchanged && s.Old != nil && s.New != nil {
					if s.New.ID == "" {
						s.New.ID = s.Old.ID
					}
					if len(s.New.Outputs) == 0 {
						s.New.Outputs = s.Old.Outputs
					}
				}
				res := s.New
				if res == nil {
					res = s.Old
				}
				if err := add(*res, change); err != nil {
					return g, err
				}
				if s.Old != nil {
					resources = append(resources, resourceState{*s.Old, "before"})
				}
				if s.New != nil {
					resources = append(resources, resourceState{*s.New, "after"})
				}
			}
		default:
			return g, errors.New("expected Pulumi export or preview steps")
		}
		if source.Stack != "" && !foundRoot {
			return g, errors.New("named input must contain its stack root; include unchanged resources in preview")
		}
	}
	nodes := map[string]bool{}
	for _, n := range g.Nodes {
		nodes[n.ID] = true
	}
	type edgeKey struct {
		from, to string
		kind     graph.Kind
		state    string
	}
	edges := map[edgeKey]int{}
	link := func(from, to string, kind graph.Kind, state string, evidence graph.Evidence) {
		from, to = id(from), id(to)
		if !nodes[from] || !nodes[to] {
			g.OmittedRelations++
			return
		}
		key := edgeKey{from, to, kind, state}
		if i, ok := edges[key]; ok {
			for _, v := range g.Edges[i].Evidence {
				if v == evidence {
					return
				}
			}
			g.Edges[i].Evidence = append(g.Edges[i].Evidence, evidence)
			return
		}
		edges[key] = len(g.Edges)
		g.Edges = append(g.Edges, graph.Edge{From: from, To: to, Kind: kind, State: state, Evidence: []graph.Evidence{evidence}})
	}
	for _, entry := range resources {
		r := entry.res
		if !nodes[id(r.URN)] {
			continue
		}
		if len(sources) > 1 && r.Type == "pulumi:pulumi:StackReference" {
			var target string
			if err := json.Unmarshal(r.Inputs["name"], &target); err != nil || target == "" {
				g.OmittedRelations++
			} else if root, ok := roots[target]; ok {
				link(r.URN, root, graph.DependsOn, entry.state, graph.Evidence{Source: "stackReference", Property: "inputs.name"})
			} else {
				g.OmittedRelations++
			}
		}
		if r.Parent != "" {
			link(r.Parent, r.URN, graph.Contains, entry.state, graph.Evidence{Source: "parent"})
		}
		for _, dep := range r.Dependencies {
			link(r.URN, dep, graph.DependsOn, entry.state, graph.Evidence{Source: "dependencies"})
		}
		for property, deps := range r.PropertyDependencies {
			for _, dep := range deps {
				link(r.URN, dep, graph.DependsOn, entry.state, graph.Evidence{Source: "propertyDependencies", Property: property})
			}
		}
	}
	awsRelations(resources, link)
	g.Normalize()
	return g, g.Validate()
}
