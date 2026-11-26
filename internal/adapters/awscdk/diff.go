package awscdk

import (
	"errors"
	"regexp"
	"strings"

	"infralens/internal/graph"
)

var (
	errDiffFormat = errors.New("unexpected or incomplete CDK diff output; run cdk diff '**' --no-lookups --method=template to check diagnostics")
	diffColor     = regexp.MustCompile(`\x1b\[[0-9;]*m`)
	diffEnv       = regexp.MustCompile(` \(aws://[^()[:space:]]+\)$`)
)

// shortcut: CDK diff emits terminal text, switch to structured output when supported by the CDK CLI versions we use.
func applyDiff(g *graph.Graph, sources []source, output string) error {
	stackNames := make(map[string]string, len(sources))
	for _, src := range sources {
		if _, exists := stackNames[src.diffName]; exists {
			return errDiffFormat
		}
		stackNames[src.diffName] = src.stack
	}

	type resourceKey struct{ stack, id string }
	nodes := make(map[resourceKey]int, len(g.Nodes))
	for i := range g.Nodes {
		node := &g.Nodes[i]
		node.Change = graph.Unchanged
		node.MayReplace = false
		nodes[resourceKey{node.Stack, node.Name}] = i
	}
	compared := make(map[string]bool, len(sources))
	var stack string
	var resources bool
	for line := range strings.SplitSeq(diffColor.ReplaceAllString(output, ""), "\n") {
		line = strings.TrimRight(line, "\r\t ")
		if name, ok := strings.CutPrefix(line, "Stack "); ok {
			stack = stackNames[diffEnv.ReplaceAllString(name, "")]
			if compared[stack] {
				return errDiffFormat
			}
			resources = false
		}
		if stack == "" {
			continue
		}
		switch line {
		case "Resources":
			resources = true
		case "Template", "Parameters", "Metadata", "Mappings", "Conditions", "Outputs", "Other Changes":
			resources = false
			compared[stack] = true
		default:
			if strings.HasPrefix(line, "There were no differences") {
				resources = false
				compared[stack] = true
			}
		}
		if !resources || !strings.HasPrefix(line, "[") {
			continue
		}

		id, kind, change, mayReplace, err := parseDiffResource(line)
		if err != nil {
			return err
		}
		key := resourceKey{stack, id}
		index, exists := nodes[key]
		if change == graph.Delete {
			if exists {
				return errDiffFormat
			}
			node := resourceNode(stack, id, kind)
			node.Change = change
			nodes[key] = len(g.Nodes)
			g.Nodes = append(g.Nodes, node)
		} else {
			if !exists || g.Nodes[index].Type != kind || g.Nodes[index].Change != graph.Unchanged {
				return errDiffFormat
			}
			g.Nodes[index].Change = change
			g.Nodes[index].MayReplace = mayReplace
		}
		compared[stack] = true
	}
	if len(compared) != len(sources) {
		return errDiffFormat
	}
	g.Normalize()
	return g.Validate()
}

func parseDiffResource(line string) (id, kind string, change graph.Change, mayReplace bool, err error) {
	switch {
	case strings.HasPrefix(line, "[+] "):
		change = graph.Create
	case strings.HasPrefix(line, "[~] "):
		change = graph.Update
		if strings.HasSuffix(line, " replace") {
			change = graph.Replace
			line = strings.TrimSuffix(line, " replace")
		} else {
			line, mayReplace = strings.CutSuffix(line, " may be replaced")
		}
	case strings.HasPrefix(line, "[-] "):
		change = graph.Delete
		line = strings.TrimSuffix(strings.TrimSuffix(line, " destroy"), " orphan")
	default:
		return "", "", "", false, errDiffFormat
	}
	fields := strings.Fields(line)
	if len(fields) < 3 || !resourceType.MatchString(fields[1]) || !logicalID.MatchString(fields[len(fields)-1]) {
		return "", "", "", false, errDiffFormat
	}
	// CDK inserts the optional construct path before the logical ID.
	return fields[len(fields)-1], fields[1], change, mayReplace, nil
}
