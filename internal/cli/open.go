package cli

import (
	"net/url"
	"os/exec"
	"runtime"
)

func openHTML(path string) error {
	uri := (&url.URL{Scheme: "file", Path: path}).String()
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", uri).Run()
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", uri).Run()
	default:
		return exec.Command("xdg-open", uri).Run()
	}
}
