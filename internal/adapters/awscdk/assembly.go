package awscdk

import (
	"encoding/json"
	"errors"
	"io/fs"
	"path"
	"strings"
)

type assemblyManifest struct {
	Artifacts map[string]struct {
		Type        string `json:"type"`
		DisplayName string `json:"displayName"`
		Environment string `json:"environment"`
		Properties  struct {
			TemplateFile  string `json:"templateFile"`
			DirectoryName string `json:"directoryName"`
			StackName     string `json:"stackName"`
		} `json:"properties"`
	} `json:"artifacts"`
}

func assemblySources(assembly fs.FS, dir string) ([]source, error) {
	data, err := readAssemblyFile(assembly, path.Join(dir, "manifest.json"))
	if err != nil {
		return nil, err
	}
	var manifest assemblyManifest
	if json.Unmarshal(data, &manifest) != nil {
		return nil, errors.New("invalid synthesized CDK assembly manifest")
	}
	var sources []source
	for id, artifact := range manifest.Artifacts {
		switch artifact.Type {
		case "aws:cloudformation:stack":
			file := artifact.Properties.TemplateFile
			if !fs.ValidPath(file) || file == "." {
				return nil, errors.New("invalid stack template path in CDK manifest")
			}
			stack := artifact.DisplayName
			if stack == "" {
				stack = path.Join(dir, id)
			}
			diffName := artifact.DisplayName
			if diffName == "" {
				diffName = id
			}
			if name := artifact.Properties.StackName; name != "" && name != id {
				diffName += " (" + name + ")"
			}
			name := artifact.Properties.StackName
			if name == "" {
				name = id
			}
			environment := strings.TrimPrefix(artifact.Environment, "aws://")
			account, region, _ := strings.Cut(environment, "/")
			sources = append(sources, source{
				stack: stack, path: path.Join(dir, file), diffName: diffName,
				stackName: name, account: account, region: region,
			})
		case "cdk:cloud-assembly":
			child := artifact.Properties.DirectoryName
			if !fs.ValidPath(child) || child == "." {
				return nil, errors.New("invalid nested assembly path in CDK manifest")
			}
			nested, err := assemblySources(assembly, path.Join(dir, child))
			if err != nil {
				return nil, err
			}
			sources = append(sources, nested...)
		}
	}
	return sources, nil
}

func readAssemblyFile(assembly fs.FS, path string) ([]byte, error) {
	info, err := fs.Stat(assembly, path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("cannot read synthesized CDK assembly file")
	}
	data, err := fs.ReadFile(assembly, path)
	if err != nil {
		return nil, errors.New("cannot read synthesized CDK assembly file")
	}
	return data, nil
}
