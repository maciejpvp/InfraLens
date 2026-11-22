// Package render embeds a self-contained SVG diagram viewer in one HTML file.
package render

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"io"
	"strings"

	"infralens/internal/graph"
)

//go:embed viewer.html
var markup string

//go:embed frontend/dist/viewer.css
var css string

//go:embed frontend/dist/viewer.js
var viewerJS string

//go:embed frontend/dist/licenses.md
var dependencyNotices string

//go:embed frontend/SHADCN-LICENSE.md
var shadcnNotice string

//go:embed icons/*.svg
var iconFiles embed.FS

var page = template.Must(template.New("diagram").Parse(markup))

func HTML(w io.Writer, g graph.Graph) error {
	if err := g.Validate(); err != nil {
		return err
	}
	data, err := json.Marshal(g)
	if err != nil {
		return err
	}
	files, err := iconFiles.ReadDir("icons")
	if err != nil {
		return err
	}
	icons := map[string]string{}
	for _, file := range files {
		data, err := iconFiles.ReadFile("icons/" + file.Name())
		if err != nil {
			return err
		}
		icons[strings.TrimSuffix(file.Name(), ".svg")] = "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString(data)
	}
	iconJSON, err := json.Marshal(icons)
	if err != nil {
		return err
	}
	// Only encoding/json output and compiled-in code receive trusted template types.
	return page.Execute(w, struct {
		Data    template.JS
		Icons   template.JS
		JS      template.JS
		CSS     template.CSS
		Notices string
	}{template.JS(data), template.JS(iconJSON), template.JS(viewerJS), template.CSS(css), shadcnNotice + "\n\n" + dependencyNotices})
}
