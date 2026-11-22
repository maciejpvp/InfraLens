// Package render embeds a self-contained diagram viewer in one HTML file.
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

var page = template.Must(template.New("diagram").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>InfraLens · Infrastructure diagram</title>
<style>{{.CSS}}</style>
</head>
<body class="dark bg-background text-foreground">
<div id="infralens-root"></div>
<noscript>This diagram requires JavaScript. All scripts are embedded in this file.</noscript>
<pre id="infralens-licenses" hidden>{{.Notices}}</pre>
<script id="infralens-data" type="application/json">{{.Data}}</script>
<script id="infralens-icons" type="application/json">{{.Icons}}</script>
<script>{{.JS}}</script>
</body>
</html>
`))

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
