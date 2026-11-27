// Package render embeds a self-contained diagram viewer in one HTML file.
package render

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"io"
	"strings"

	"laytrace/internal/cost"
	"laytrace/internal/graph"
)

//go:embed frontend/dist/viewer.css
var css string

//go:embed frontend/dist/viewer.js
var viewerJS string

//go:embed frontend/dist/licenses.md
var dependencyNotices string

//go:embed frontend/SHADCN-LICENSE.md
var shadcnNotice string

//go:embed frontend/src/assets/brand/favicon.svg
var favicon []byte

//go:embed icons/*.svg
var iconFiles embed.FS

var page = template.Must(template.New("diagram").Parse(`<!doctype html>
<html lang="en" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Laytrace · Infrastructure diagram</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,{{.Favicon}}">
<style>{{.CSS}}</style>
</head>
<body class="bg-background text-foreground">
<div id="laytrace-root"></div>
<noscript>This diagram requires JavaScript. All scripts are embedded in this file.</noscript>
<pre id="laytrace-licenses" hidden>{{.Notices}}</pre>
<script id="laytrace-data" type="application/json">{{.Data}}</script>
{{if .Costs}}<script id="laytrace-costs" type="application/json">{{.Costs}}</script>{{end}}
<script id="laytrace-icons" type="application/json">{{.Icons}}</script>
<script>{{.JS}}</script>
</body>
</html>
`))

func HTML(w io.Writer, g graph.Graph, report *cost.Report) error {
	if err := g.Validate(); err != nil {
		return err
	}
	data, err := json.Marshal(g)
	if err != nil {
		return err
	}
	var costs template.JS
	if report != nil {
		payload, err := json.Marshal(report)
		if err != nil {
			return err
		}
		costs = template.JS(payload)
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
		Costs   template.JS
		Icons   template.JS
		JS      template.JS
		CSS     template.CSS
		Favicon string
		Notices string
	}{template.JS(data), costs, template.JS(iconJSON), template.JS(viewerJS), template.CSS(css), base64.StdEncoding.EncodeToString(favicon), shadcnNotice + "\n\n" + dependencyNotices})
}
