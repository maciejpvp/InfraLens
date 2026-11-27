package graph

import (
	"encoding/json"
	"errors"
	"io"
	"strings"
)

const maxQueryGraphBytes = 32 << 20

// ReadJSON reads a normalized Laytrace graph, validates it, and sorts its results.
func ReadJSON(r io.Reader) (Graph, error) {
	data, err := io.ReadAll(io.LimitReader(r, maxQueryGraphBytes+1))
	if err != nil {
		return Graph{}, errors.New("cannot read graph file")
	}
	if len(data) > maxQueryGraphBytes {
		return Graph{}, errors.New("graph file exceeds 32 MiB")
	}
	var g Graph
	if err := json.Unmarshal(data, &g); err != nil {
		return Graph{}, errors.New("graph file is not valid Laytrace JSON")
	}
	if err := g.Validate(); err != nil {
		return Graph{}, err
	}
	g.Normalize()
	return g, nil
}

type QueryOptions struct {
	ID, Name, Stack, Type string
	Search                string
	Change                Change
	Changed, Summary      bool
	Limit, Offset         int
	RelationOffset        int
}

func (a QueryOptions) validate() error {
	if a.Offset < 0 || a.RelationOffset < 0 || a.Limit < 0 || a.Limit > 25 {
		return errors.New("offsets must be nonnegative and limit must be between 1 and 25 when set")
	}
	if a.Changed && a.Change == Unchanged {
		return errors.New("--changed cannot be combined with --change unchanged")
	}
	switch a.Change {
	case "", Create, Update, Replace, Delete, Unchanged:
		return nil
	default:
		return errors.New("unsupported change status")
	}
}

func (a QueryOptions) matches(n Node) bool {
	return (a.ID == "" || n.ID == a.ID) &&
		(a.Name == "" || n.Name == a.Name) &&
		(a.Stack == "" || n.Stack == a.Stack) &&
		(a.Type == "" || n.Type == a.Type) &&
		(a.Change == "" || n.Change == a.Change || (a.Change == Replace && n.MayReplace)) &&
		(!a.Changed || (n.Change != "" && n.Change != Unchanged)) &&
		(a.Search == "" || strings.Contains(strings.ToLower(n.Name), a.Search) ||
			strings.Contains(strings.ToLower(n.Type), a.Search) ||
			strings.Contains(strings.ToLower(n.Stack), a.Search) ||
			strings.Contains(strings.ToLower(n.Service), a.Search))
}

type QueryResult struct {
	Source               string         `json:"source"`
	Coverage             string         `json:"coverage"`
	OmittedRelations     int            `json:"omittedRelations"`
	Total                int            `json:"total"`
	ChangeCounts         map[string]int `json:"changeCounts"`
	PossibleReplacements int            `json:"possibleReplacements,omitempty"`
	Resources            []Node         `json:"resources"`
	NextOffset           int            `json:"nextOffset,omitempty"`
	Relations            []relation     `json:"relations,omitempty"`
	RelationsTruncated   bool           `json:"relationsTruncated,omitempty"`
	NextRelationOffset   int            `json:"nextRelationOffset,omitempty"`
}

type relation struct {
	From          string     `json:"from"`
	To            string     `json:"to"`
	OtherName     string     `json:"otherName"`
	Kind          Kind       `json:"kind"`
	State         string     `json:"state,omitempty"`
	Evidence      []Evidence `json:"evidence"`
	EvidenceCount int        `json:"evidenceCount"`
}

// Query returns a page of matches from a validated, normalized graph.
func (g Graph) Query(args QueryOptions) (QueryResult, error) {
	if err := args.validate(); err != nil {
		return QueryResult{}, err
	}
	args.Search = strings.ToLower(strings.TrimSpace(args.Search))
	limit := args.Limit
	if limit == 0 {
		limit = 10
	}
	result := QueryResult{
		Source: "graph", Coverage: "Only states recorded in this graph are available.",
		OmittedRelations: g.OmittedRelations, Resources: make([]Node, 0, limit),
		ChangeCounts: make(map[string]int),
	}
	switch {
	case g.Simulated:
		result.Source = "simulated"
		result.Coverage = "Simulated topology."
	case g.PreviewProvider == "pulumi":
		result.Source = "pulumi-preview"
		result.Coverage = "Compared with the saved stack state. Coverage is limited to resources and relationships captured by the preview."
	case g.PreviewProvider == "aws-cdk":
		result.Source = "aws-cdk-preview"
		result.Coverage = "Compared with the deployed template. Only target relationships are available. Replacement statuses are template-based."
	}
	for _, node := range g.Nodes {
		if args.matches(node) {
			if !args.Summary && result.Total >= args.Offset && len(result.Resources) < limit {
				result.Resources = append(result.Resources, node)
			}
			status := string(node.Change)
			if status == "" {
				status = "unclassified"
			}
			result.ChangeCounts[status]++
			if node.MayReplace {
				result.PossibleReplacements++
			}
			result.Total++
		}
	}
	if end := args.Offset + len(result.Resources); !args.Summary && end < result.Total {
		result.NextOffset = end
	}
	if result.Total == 1 && len(result.Resources) == 1 {
		result.Relations, result.NextRelationOffset = directRelations(g, result.Resources[0].ID, limit, args.RelationOffset)
		result.RelationsTruncated = result.NextRelationOffset > 0
	}
	return result, nil
}

func directRelations(g Graph, id string, limit, offset int) ([]relation, int) {
	names := make(map[string]string, len(g.Nodes))
	for _, node := range g.Nodes {
		names[node.ID] = node.Name
	}
	var relations []relation
	skipped := 0
	for _, edge := range g.Edges {
		if edge.From != id && edge.To != id {
			continue
		}
		if g.PreviewProvider == "aws-cdk" && edge.State == "before" {
			continue
		}
		if skipped < offset {
			skipped++
			continue
		}
		if len(relations) == limit {
			return relations, offset + limit
		}
		other := edge.To
		if edge.To == id {
			other = edge.From
		}
		state := edge.State
		if g.PreviewProvider == "aws-cdk" {
			state = "after"
		}
		evidence := make([]Evidence, min(len(edge.Evidence), 2))
		copy(evidence, edge.Evidence)
		for i := range evidence {
			evidence[i].Details = ""
		}
		relations = append(relations, relation{edge.From, edge.To, names[other], edge.Kind, state, evidence, len(edge.Evidence)})
	}
	return relations, 0
}
