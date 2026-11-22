// Package graph defines the source-independent model consumed by renderers.
package graph

import (
	"errors"
	"sort"
)

type Change string

const (
	Unchanged Change = "unchanged"
	Create    Change = "create"
	Update    Change = "update"
	Delete    Change = "delete"
	Replace   Change = "replace"
)

type Kind string

const (
	Contains   Kind = "contains"
	DependsOn  Kind = "depends_on"
	ConnectsTo Kind = "connects_to"
	Triggers   Kind = "triggers"
)

type Graph struct {
	SchemaVersion    int    `json:"schemaVersion"`
	Simulated        bool   `json:"simulated,omitempty"`
	Nodes            []Node `json:"nodes"`
	Edges            []Edge `json:"edges"`
	OmittedRelations int    `json:"omittedRelations"`
}

type Node struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Provider string `json:"provider"`
	Change   Change `json:"change,omitempty"`
	Stack    string `json:"stack,omitempty"`
}

type Evidence struct {
	Source   string `json:"source"`
	Resource string `json:"resource,omitempty"`
	Property string `json:"property,omitempty"`
	Label    string `json:"label,omitempty"`
	Details  string `json:"details,omitempty"`
}

type Edge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind Kind   `json:"kind"`
	// State distinguishes old and new topology without retaining raw resource data.
	State    string     `json:"state,omitempty"`
	Evidence []Evidence `json:"evidence"`
}

func (g *Graph) Normalize() {
	sort.Slice(g.Nodes, func(i, j int) bool { return g.Nodes[i].ID < g.Nodes[j].ID })
	sort.Slice(g.Edges, func(i, j int) bool {
		a, b := g.Edges[i], g.Edges[j]
		if a.From != b.From {
			return a.From < b.From
		}
		if a.To != b.To {
			return a.To < b.To
		}
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		return a.State < b.State
	})
	for i := range g.Edges {
		e := &g.Edges[i]
		sort.Slice(e.Evidence, func(i, j int) bool {
			a, b := e.Evidence[i], e.Evidence[j]
			if a.Source != b.Source {
				return a.Source < b.Source
			}
			if a.Property != b.Property {
				return a.Property < b.Property
			}
			if a.Resource != b.Resource {
				return a.Resource < b.Resource
			}
			if a.Label != b.Label {
				return a.Label < b.Label
			}
			return a.Details < b.Details
		})
	}
}

func (g Graph) Validate() error {
	if g.SchemaVersion != 1 || g.OmittedRelations < 0 {
		return errors.New("invalid graph metadata")
	}
	nodes := make(map[string]bool, len(g.Nodes))
	for _, n := range g.Nodes {
		if n.ID == "" || n.Name == "" || n.Type == "" || nodes[n.ID] {
			return errors.New("invalid or duplicate graph node")
		}
		switch n.Change {
		case "", Unchanged, Create, Update, Delete, Replace:
		default:
			return errors.New("invalid change status")
		}
		nodes[n.ID] = true
	}
	type key struct {
		from, to string
		kind     Kind
		state    string
	}
	seen := map[key]bool{}
	parents := map[string]map[string]string{}
	for _, e := range g.Edges {
		k := key{e.From, e.To, e.Kind, e.State}
		if !nodes[e.From] || !nodes[e.To] || len(e.Evidence) == 0 || seen[k] {
			return errors.New("invalid or duplicate graph edge")
		}
		if e.Kind != Contains && e.Kind != DependsOn && e.Kind != ConnectsTo && e.Kind != Triggers {
			return errors.New("invalid edge kind")
		}
		if e.State != "" && e.State != "before" && e.State != "after" {
			return errors.New("invalid edge state")
		}
		for _, v := range e.Evidence {
			if v.Resource != "" && !nodes[v.Resource] {
				return errors.New("missing evidence resource")
			}
			if v.Source == "" {
				return errors.New("missing evidence source")
			}
		}
		seen[k] = true
		if e.Kind == Contains {
			if parents[e.State] == nil {
				parents[e.State] = map[string]string{}
			}
			if _, exists := parents[e.State][e.To]; exists {
				return errors.New("multiple resource parents")
			}
			parents[e.State][e.To] = e.From
		}
	}
	for _, p := range parents {
		done := map[string]bool{}
		for child := range p {
			path := map[string]bool{}
			for n := child; n != "" && !done[n]; n = p[n] {
				if path[n] {
					return errors.New("cyclic resource parents")
				}
				path[n] = true
			}
			for n := range path {
				done[n] = true
			}
		}
	}
	return nil
}
