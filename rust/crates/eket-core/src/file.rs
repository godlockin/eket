//! File category classification for non-code file analysis
//!
//! TASK-E11-004: Extends ticket schema to support non-code files

use serde::{Deserialize, Serialize};
use std::path::Path;

/// File category for classification
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileCategory {
    /// Source code files (.rs, .ts, .py, etc.)
    Code,
    /// Configuration files (yaml, json, toml, .env, etc.)
    Config,
    /// Documentation files (md, rst, txt)
    Docs,
    /// Infrastructure files (Dockerfile, K8s, Terraform, CI/CD)
    Infra,
    /// Data/Schema files (sql, graphql, proto, prisma)
    Data,
    /// Script files (sh, bash, ps1, bat)
    Script,
    /// Markup files (html, css, scss)
    Markup,
    /// Metadata files (LICENSE, CHANGELOG, etc.)
    Meta,
}

impl Default for FileCategory {
    fn default() -> Self {
        Self::Code
    }
}

/// Common dotfile config patterns (case-insensitive)
const DOTFILE_CONFIGS: &[&str] = &[
    ".eslintrc",
    ".prettierrc",
    ".gitignore",
    ".editorconfig",
    ".dockerignore",
    ".npmrc",
    ".nvmrc",
    ".babelrc",
    ".stylelintrc",
    ".browserslistrc",
    ".huskyrc",
    ".lintstagedrc",
    ".commitlintrc",
    ".czrc",
    ".flowconfig",
    ".graphqlrc",
];

/// Infra filenames (case-insensitive)
const INFRA_FILENAMES: &[&str] = &[
    "dockerfile",
    "jenkinsfile",
    "makefile",
    "vagrantfile",
    "procfile",
    "rakefile",
];

/// Meta filenames (case-insensitive)
const META_FILENAMES: &[&str] = &[
    "license",
    "licence",
    "changelog",
    "contributing",
    "authors",
    "maintainers",
    "security",
    "code_of_conduct",
];

impl FileCategory {
    /// Classify a file based on its path
    ///
    /// Priority order:
    /// 1. Exact filename match (case-insensitive)
    /// 2. .env prefix match
    /// 3. Dotfile config match
    /// 4. Path pattern match
    /// 5. Extension match
    pub fn from_path(path: &Path) -> Self {
        let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        let filename_lower = filename.to_lowercase();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let path_str = path.to_string_lossy();

        // 1. Infra filenames (case-insensitive)
        if INFRA_FILENAMES.iter().any(|&f| filename_lower == f) {
            return FileCategory::Infra;
        }

        // 2. Meta filenames (case-insensitive, with or without extension)
        let basename = if let Some(pos) = filename_lower.rfind('.') {
            &filename_lower[..pos]
        } else {
            &filename_lower
        };
        if META_FILENAMES.iter().any(|&f| basename == f) {
            return FileCategory::Meta;
        }

        // 3. .env prefix (handles .env, .env.local, .env.example, etc.)
        if filename.starts_with(".env") {
            return FileCategory::Config;
        }

        // 4. Dotfile configs (case-insensitive)
        if DOTFILE_CONFIGS
            .iter()
            .any(|&d| filename_lower == d.to_lowercase())
        {
            return FileCategory::Config;
        }

        // 5. Path patterns (CI/CD, K8s)
        if path_str.contains(".github/workflows")
            || path_str.contains(".gitlab-ci")
            || path_str.contains(".circleci")
        {
            return FileCategory::Infra;
        }

        // Cross-platform K8s path check
        if path.iter().any(|c| {
            let s = c.to_string_lossy().to_lowercase();
            s == "k8s" || s == "kubernetes" || s == "helm" || s == "charts"
        }) {
            return FileCategory::Infra;
        }

        // 6. Extension match
        match ext.as_str() {
            // Config
            "yaml" | "yml" | "json" | "toml" | "ini" | "cfg" | "conf" | "properties" => {
                FileCategory::Config
            }
            // Docs
            "md" | "mdx" | "rst" | "txt" | "adoc" | "asciidoc" => FileCategory::Docs,
            // Infra
            "tf" | "tfvars" | "hcl" => FileCategory::Infra,
            // Data/Schema
            "sql" | "graphql" | "gql" | "proto" | "prisma" | "avsc" | "xsd" => FileCategory::Data,
            // Script
            "sh" | "bash" | "zsh" | "fish" | "ps1" | "psm1" | "bat" | "cmd" => FileCategory::Script,
            // Markup
            "html" | "htm" | "css" | "scss" | "sass" | "less" | "styl" | "pcss" => {
                FileCategory::Markup
            }
            // Default to Code
            _ => FileCategory::Code,
        }
    }
}

impl std::fmt::Display for FileCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Code => "code",
            Self::Config => "config",
            Self::Docs => "docs",
            Self::Infra => "infra",
            Self::Data => "data",
            Self::Script => "script",
            Self::Markup => "markup",
            Self::Meta => "meta",
        };
        write!(f, "{s}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // === FileCategory Tests ===

    #[test]
    fn test_dockerfile_case_variants() {
        for name in ["Dockerfile", "dockerfile", "DOCKERFILE"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Infra,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_infra_filenames() {
        for name in [
            "Makefile",
            "MAKEFILE",
            "makefile",
            "Jenkinsfile",
            "Vagrantfile",
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Infra,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_dotenv_variants() {
        for name in [
            ".env",
            ".env.local",
            ".env.example",
            ".env.production",
            ".env.test",
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Config,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_dotfile_configs() {
        for name in [
            ".eslintrc",
            ".prettierrc",
            ".gitignore",
            ".editorconfig",
            ".npmrc",
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Config,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_dotfile_case_insensitive() {
        for name in [".ESLintrc", ".ESLINTRC", ".GitIgnore"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Config,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_path_priority_over_extension() {
        // .github/workflows/*.yml should be Infra, not Config
        assert_eq!(
            FileCategory::from_path(Path::new(".github/workflows/ci.yml")),
            FileCategory::Infra
        );
        assert_eq!(
            FileCategory::from_path(Path::new(".gitlab-ci/deploy.yaml")),
            FileCategory::Infra
        );
    }

    #[test]
    fn test_k8s_paths() {
        assert_eq!(
            FileCategory::from_path(Path::new("k8s/deployment.yaml")),
            FileCategory::Infra
        );
        assert_eq!(
            FileCategory::from_path(Path::new("kubernetes/service.yml")),
            FileCategory::Infra
        );
        assert_eq!(
            FileCategory::from_path(Path::new("charts/myapp/values.yaml")),
            FileCategory::Infra
        );
    }

    #[test]
    fn test_config_extensions() {
        for (name, expected) in [
            ("config.yaml", FileCategory::Config),
            ("settings.yml", FileCategory::Config),
            ("package.json", FileCategory::Config),
            ("Cargo.toml", FileCategory::Config),
            ("app.ini", FileCategory::Config),
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                expected,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_docs_extensions() {
        for name in ["README.md", "notes.txt", "guide.mdx"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Docs,
                "Failed for: {name}"
            );
        }
        // CHANGELOG.rst is Meta because CHANGELOG is a meta filename
        assert_eq!(
            FileCategory::from_path(Path::new("CHANGELOG.rst")),
            FileCategory::Meta
        );
    }

    #[test]
    fn test_data_extensions() {
        for name in [
            "schema.sql",
            "api.graphql",
            "messages.proto",
            "schema.prisma",
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Data,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_script_extensions() {
        for name in ["deploy.sh", "build.bash", "setup.ps1", "run.bat"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Script,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_markup_extensions() {
        for name in ["index.html", "styles.css", "app.scss", "theme.less"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Markup,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_infra_terraform() {
        for name in ["main.tf", "variables.tfvars", "provider.hcl"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Infra,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_meta_files() {
        for name in [
            "LICENSE",
            "LICENSE.md",
            "CHANGELOG.md",
            "CONTRIBUTING.md",
            "AUTHORS",
        ] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Meta,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_empty_path() {
        assert_eq!(FileCategory::from_path(Path::new("")), FileCategory::Code);
    }

    #[test]
    fn test_code_default() {
        for name in ["main.rs", "app.ts", "module.py", "service.java"] {
            assert_eq!(
                FileCategory::from_path(Path::new(name)),
                FileCategory::Code,
                "Failed for: {name}"
            );
        }
    }

    #[test]
    fn test_serde_lowercase() {
        assert_eq!(
            serde_json::to_string(&FileCategory::Config).unwrap(),
            "\"config\""
        );
        assert_eq!(
            serde_json::to_string(&FileCategory::Infra).unwrap(),
            "\"infra\""
        );
    }
}
