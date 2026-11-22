package cli

import (
	"bytes"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestRejectsFIFOWithoutWaitingForWriter(t *testing.T) {
	dir := t.TempDir()
	input := filepath.Join(dir, "input.json")
	if err := syscall.Mkfifo(input, 0600); err != nil {
		t.Fatal(err)
	}
	for _, command := range []string{"graph", "render"} {
		t.Run(command, func(t *testing.T) {
			result := make(chan bool, 1)
			go func() {
				var logs bytes.Buffer
				code := newPulumiCLI(&logs, &logs).Run([]string{command, "--provider=pulumi", "--input", input, "--output", filepath.Join(dir, "output")})
				result <- code != 0 && strings.Contains(logs.String(), "input must be a regular file")
			}()
			select {
			case rejected := <-result:
				if !rejected {
					t.Fatal("expected a regular-file diagnostic")
				}
			case <-time.After(time.Second):
				t.Fatal("command blocked while opening a FIFO without a writer")
			}
		})
	}
}
