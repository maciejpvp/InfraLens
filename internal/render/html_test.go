package render

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"html"
	"regexp"
	"strings"
	"testing"

	"laytrace/internal/graph"
)

func TestHTMLTextEscaping(t *testing.T) {
	g := graph.Graph{SchemaVersion: 1, Nodes: []graph.Node{{ID: "a", Name: `</script><script>alert(1)</script>`, Type: "test"}, {ID: "b", Name: "target", Type: "test"}}, Edges: []graph.Edge{{From: "a", To: "b", Kind: graph.DependsOn, Evidence: []graph.Evidence{{Source: "test", Property: `<img src=x onerror=alert(1)>`, Label: `</script><script>alert(1)</script>`, Details: `<img src=x onerror=alert(1)>`}}}}}
	var out bytes.Buffer
	if err := HTML(&out, g, nil); err != nil {
		t.Fatal(err)
	}
	result := out.String()
	if strings.Contains(result, `</script><script>alert(1)</script>`) || strings.Contains(result, `<img src=x`) || !strings.Contains(result, `\u003cscript\u003e`) {
		t.Fatal("unsafe script embedding")
	}
	matches := regexp.MustCompile(`(?s)<script id="laytrace-data" type="application/json">(.*?)</script>`).FindStringSubmatch(result)
	if len(matches) != 2 {
		t.Fatal("missing embedded graph")
	}
	var decoded graph.Graph
	if err := json.Unmarshal([]byte(matches[1]), &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Nodes[0].Name != g.Nodes[0].Name {
		t.Fatal("node label changed")
	}
	if strings.Contains(result, "<script src=") || strings.Count(result, "<link ") != 1 || !strings.Contains(html.UnescapeString(result), `href="data:image/svg+xml;base64,`+base64.StdEncoding.EncodeToString(favicon)+`"`) {
		t.Fatal("external assets")
	}

}

func TestSimulationLabel(t *testing.T) {
	g := graph.Graph{SchemaVersion: 1, Simulated: true, Nodes: []graph.Node{{ID: "a", Name: "planned", Type: "test", Change: graph.Create}}}
	var out bytes.Buffer
	if err := HTML(&out, g, nil); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "SIMULATION") || !strings.Contains(out.String(), `"simulated":true`) {
		t.Fatal("simulation is not clearly labeled")
	}
}

func TestOfflineIconsAndEnglishInterface(t *testing.T) {
	if strings.Contains(strings.ToLower(viewerJS), "</script") || strings.Contains(strings.ToLower(css), "</style") {
		t.Fatal("frontend assets contain a closing tag that would terminate an inline block")
	}
	var out bytes.Buffer
	if err := HTML(&out, graph.Graph{SchemaVersion: 1}, nil); err != nil {
		t.Fatal(err)
	}
	result := out.String()
	if !strings.Contains(result, `<html lang="en" class="dark">`) || !strings.Contains(result, "img-src data:") || !strings.Contains(result, "default-src 'none'") {
		t.Fatal("missing English language or offline image policy")
	}
	match := regexp.MustCompile(`<script id="laytrace-icons" type="application/json">(.*?)</script>`).FindStringSubmatch(result)
	if len(match) != 2 {
		t.Fatal("missing embedded icons")
	}
	var icons map[string]string
	if err := json.Unmarshal([]byte(match[1]), &icons); err != nil {
		t.Fatal(err)
	}
	if len(icons) != 16 {
		t.Fatalf("got %d service icons", len(icons))
	}
	for name, uri := range icons {
		prefix := "data:image/svg+xml;base64,"
		if !strings.HasPrefix(uri, prefix) {
			t.Fatalf("external icon: %s", name)
		}
		data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, prefix))
		if err != nil {
			t.Fatal(err)
		}
		original, err := iconFiles.ReadFile("icons/" + name + ".svg")
		if err != nil || !bytes.Equal(data, original) || !bytes.Contains(data, []byte("<svg")) {
			t.Fatalf("icon artwork changed: %s", name)
		}
	}
}
