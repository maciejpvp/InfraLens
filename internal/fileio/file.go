// Package fileio provides filesystem operations shared by Laytrace workflows.
package fileio

import (
	"errors"
	"io"
	"os"
	"path/filepath"
)

// ErrNotRegular indicates a path or opened file is not a regular file.
var ErrNotRegular = errors.New("not a regular file")

// StatRegular checks that path resolves to a regular file.
func StatRegular(path string) (os.FileInfo, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, ErrNotRegular
	}
	return info, nil
}

// Exists reports whether path can be statted.
func Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// OpenRegular checks the path before opening it and validates the opened file.
func OpenRegular(path string) (*os.File, os.FileInfo, error) {
	if _, err := StatRegular(path); err != nil {
		return nil, nil, err
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, nil, ErrNotRegular
	}
	return f, info, nil
}

// SameFile reports whether both file descriptions refer to the same file.
func SameFile(a, b os.FileInfo) bool {
	return a != nil && b != nil && os.SameFile(a, b)
}

// WriteAtomic replaces path only after write and close succeed.
func WriteAtomic(path string, write func(io.Writer) error) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".laytrace-*")
	if err != nil {
		return errors.New("cannot create output file")
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()
	writeErr := write(tmp)
	closeErr := tmp.Close()
	if writeErr != nil || closeErr != nil {
		return errors.New("cannot write output file")
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return errors.New("cannot replace output file")
	}
	return nil
}

// CreateScratch creates a temporary file and returns a cleanup function.
func CreateScratch(pattern string) (*os.File, func(), error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return nil, nil, err
	}
	return f, func() {
		f.Close()
		os.Remove(f.Name())
	}, nil
}
