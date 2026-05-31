//! Node type definitions for knowledge graph
//!
//! TASK-E11-004: Extends ticket schema to support non-code files

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;

use crate::file::FileCategory;

/// Node types for knowledge graph
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum NodeType {
    // === Code nodes ===
    /// Generic file node
    #[default]
    File,
    /// Function/method definition
    Function,
    /// Class definition
    Class,
    /// Module/package
    Module,
    /// Interface/trait definition
    Interface,
    /// Type alias or type definition
    TypeDef,
    /// Constant/static value
    Constant,

    // === Non-code nodes ===
    /// Configuration file
    Config,
    /// Documentation file
    Document,
    /// Container/service definition (Dockerfile, docker-compose, K8s)
    Service,
    /// Database table definition
    Table,
    /// API endpoint definition
    Endpoint,
    /// CI/CD pipeline configuration
    Pipeline,
    /// Schema definition (GraphQL, Proto, Prisma)
    Schema,
    /// Infrastructure resource (Terraform, CloudFormation)
    Resource,
    /// Script file
    Script,
    /// Markup file (HTML, CSS)
    Markup,
    /// Metadata file (LICENSE, CHANGELOG)
    Meta,
}


/// Regex for detecting SQL CREATE TABLE statement (not in comments)
fn create_table_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Match CREATE TABLE at line start (possibly with leading whitespace)
        // Exclude lines starting with -- or /* comments
        Regex::new(r"(?m)^[^-/]*\bCREATE\s+(TEMP\s+|TEMPORARY\s+)?TABLE\b").expect("Invalid regex")
    })
}

/// Regex for detecting OpenAPI endpoint definitions
fn openapi_endpoint_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Match paths: or individual HTTP methods
        Regex::new(
            r#"(?m)^\s*["']?(/[^"'\s:]+)["']?\s*:|^\s*(get|post|put|patch|delete|options|head):"#,
        )
        .expect("Invalid regex")
    })
}

impl NodeType {
    /// Determine node type from category, path, and content
    pub fn from_category_and_content(category: FileCategory, path: &Path, content: &str) -> Self {
        match category {
            FileCategory::Config => Self::classify_config(path, content),
            FileCategory::Docs => NodeType::Document,
            FileCategory::Infra => Self::classify_infra(path, content),
            FileCategory::Data => Self::classify_data(path, content),
            FileCategory::Script => NodeType::Script,
            FileCategory::Markup => NodeType::Markup,
            FileCategory::Meta => NodeType::Meta,
            FileCategory::Code => NodeType::File,
        }
    }

    /// Classify config files - detect OpenAPI/Swagger for Endpoint
    fn classify_config(path: &Path, content: &str) -> NodeType {
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        // Detect OpenAPI/Swagger specs
        if (filename.contains("openapi") || filename.contains("swagger"))
            && (ext == "yaml" || ext == "yml" || ext == "json")
        {
            return NodeType::Endpoint;
        }

        // Check content for OpenAPI indicator
        if (ext == "yaml" || ext == "yml" || ext == "json")
            && (content.contains("openapi:") || content.contains("swagger:"))
        {
            return NodeType::Endpoint;
        }

        // Check for paths with HTTP methods (likely API spec)
        if openapi_endpoint_regex().is_match(content) && content.contains("paths:") {
            return NodeType::Endpoint;
        }

        NodeType::Config
    }

    /// Classify infrastructure files
    fn classify_infra(path: &Path, content: &str) -> NodeType {
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let path_str = path.to_string_lossy();

        // Docker files -> Service
        if filename.starts_with("dockerfile")
            || filename.contains("docker-compose")
            || filename.ends_with(".dockerfile")
        {
            return NodeType::Service;
        }

        // CI/CD -> Pipeline
        if path_str.contains(".github/workflows")
            || path_str.contains(".gitlab-ci")
            || path_str.contains(".circleci")
            || filename == "jenkinsfile"
            || filename.ends_with(".jenkinsfile")
        {
            return NodeType::Pipeline;
        }

        // K8s deployments -> Service (they define services)
        if path.iter().any(|c| {
            let s = c.to_string_lossy().to_lowercase();
            s == "k8s" || s == "kubernetes" || s == "helm" || s == "charts"
        }) {
            // K8s service definitions
            if content.contains("kind: Service")
                || content.contains("kind: Deployment")
                || content.contains("kind: Pod")
            {
                return NodeType::Service;
            }
            // Other K8s resources
            return NodeType::Resource;
        }

        // Terraform -> Resource
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if ext == "tf" || ext == "tfvars" || ext == "hcl" {
            return NodeType::Resource;
        }

        NodeType::Resource
    }

    /// Classify data/schema files
    fn classify_data(path: &Path, content: &str) -> NodeType {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();

        match ext.as_str() {
            "sql" => {
                // Only match CREATE TABLE if it's not in a comment
                // The regex excludes lines starting with -- or containing /*
                if Self::has_create_table_statement(content) {
                    NodeType::Table
                } else {
                    NodeType::Schema
                }
            }
            "graphql" | "gql" | "proto" | "prisma" | "avsc" | "xsd" => NodeType::Schema,
            _ => NodeType::Schema,
        }
    }

    /// Check if content has a valid CREATE TABLE statement (not in comments)
    fn has_create_table_statement(content: &str) -> bool {
        // Filter out comment lines and check for CREATE TABLE
        for line in content.lines() {
            let trimmed = line.trim();
            // Skip SQL comments
            if trimmed.starts_with("--") || trimmed.starts_with("/*") || trimmed.starts_with("*") {
                continue;
            }
            // Check for CREATE TABLE in non-comment line
            if create_table_regex().is_match(line) {
                return true;
            }
        }
        false
    }
}

impl std::fmt::Display for NodeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::File => "file",
            Self::Function => "function",
            Self::Class => "class",
            Self::Module => "module",
            Self::Interface => "interface",
            Self::TypeDef => "typedef",
            Self::Constant => "constant",
            Self::Config => "config",
            Self::Document => "document",
            Self::Service => "service",
            Self::Table => "table",
            Self::Endpoint => "endpoint",
            Self::Pipeline => "pipeline",
            Self::Schema => "schema",
            Self::Resource => "resource",
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

    // === NodeType Tests ===

    #[test]
    fn test_sql_table_detection() {
        let path = Path::new("schema.sql");
        let valid = "CREATE TABLE users (id INT);";
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Data, path, valid),
            NodeType::Table
        );
    }

    #[test]
    fn test_sql_temp_table_detection() {
        let path = Path::new("schema.sql");
        let valid = "CREATE TEMP TABLE temp_users (id INT);";
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Data, path, valid),
            NodeType::Table
        );
    }

    #[test]
    fn test_sql_comment_not_table() {
        let path = Path::new("schema.sql");
        // CREATE TABLE in SQL comment should NOT trigger Table type
        let comment = "-- CREATE TABLE users\nSELECT * FROM foo;";
        assert_ne!(
            NodeType::from_category_and_content(FileCategory::Data, path, comment),
            NodeType::Table
        );
    }

    #[test]
    fn test_sql_multiline_comment_not_table() {
        let path = Path::new("schema.sql");
        let comment = "/* CREATE TABLE users */\nSELECT 1;";
        assert_ne!(
            NodeType::from_category_and_content(FileCategory::Data, path, comment),
            NodeType::Table
        );
    }

    #[test]
    fn test_sql_no_create_table() {
        let path = Path::new("queries.sql");
        let content = "SELECT * FROM users WHERE id = 1;";
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Data, path, content),
            NodeType::Schema
        );
    }

    #[test]
    fn test_graphql_schema() {
        let path = Path::new("schema.graphql");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Data, path, "type User { id: ID! }"),
            NodeType::Schema
        );
    }

    #[test]
    fn test_proto_schema() {
        let path = Path::new("messages.proto");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Data, path, "message User {}"),
            NodeType::Schema
        );
    }

    #[test]
    fn test_dockerfile_service() {
        let path = Path::new("Dockerfile");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Infra, path, "FROM node:18"),
            NodeType::Service
        );
    }

    #[test]
    fn test_docker_compose_service() {
        let path = Path::new("docker-compose.yml");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Infra, path, "services:"),
            NodeType::Service
        );
    }

    #[test]
    fn test_github_workflow_pipeline() {
        let path = Path::new(".github/workflows/ci.yml");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Infra, path, "on: push"),
            NodeType::Pipeline
        );
    }

    #[test]
    fn test_jenkinsfile_pipeline() {
        let path = Path::new("Jenkinsfile");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Infra, path, "pipeline {}"),
            NodeType::Pipeline
        );
    }

    #[test]
    fn test_k8s_deployment_service() {
        let path = Path::new("k8s/deployment.yaml");
        assert_eq!(
            NodeType::from_category_and_content(
                FileCategory::Infra,
                path,
                "kind: Deployment\nspec:"
            ),
            NodeType::Service
        );
    }

    #[test]
    fn test_k8s_configmap_resource() {
        let path = Path::new("kubernetes/configmap.yaml");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Infra, path, "kind: ConfigMap"),
            NodeType::Resource
        );
    }

    #[test]
    fn test_terraform_resource() {
        let path = Path::new("main.tf");
        assert_eq!(
            NodeType::from_category_and_content(
                FileCategory::Infra,
                path,
                "resource \"aws_instance\" {}"
            ),
            NodeType::Resource
        );
    }

    #[test]
    fn test_openapi_endpoint() {
        let path = Path::new("openapi.yaml");
        let content = r#"
openapi: 3.0.0
paths:
  /users:
    get:
      summary: Get users
"#;
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Config, path, content),
            NodeType::Endpoint
        );
    }

    #[test]
    fn test_swagger_endpoint() {
        let path = Path::new("swagger.json");
        let content = r#"{"swagger": "2.0", "paths": {}}"#;
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Config, path, content),
            NodeType::Endpoint
        );
    }

    #[test]
    fn test_regular_config() {
        let path = Path::new("config.yaml");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Config, path, "database: postgres"),
            NodeType::Config
        );
    }

    #[test]
    fn test_document_type() {
        let path = Path::new("README.md");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Docs, path, "# Title"),
            NodeType::Document
        );
    }

    #[test]
    fn test_script_type() {
        let path = Path::new("deploy.sh");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Script, path, "#!/bin/bash"),
            NodeType::Script
        );
    }

    #[test]
    fn test_markup_type() {
        let path = Path::new("index.html");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Markup, path, "<html></html>"),
            NodeType::Markup
        );
    }

    #[test]
    fn test_meta_type() {
        let path = Path::new("LICENSE");
        assert_eq!(
            NodeType::from_category_and_content(FileCategory::Meta, path, "MIT License"),
            NodeType::Meta
        );
    }

    #[test]
    fn test_exhaustive_category_mapping() {
        // All categories should map to a valid NodeType without panicking
        let categories = [
            FileCategory::Code,
            FileCategory::Config,
            FileCategory::Docs,
            FileCategory::Infra,
            FileCategory::Data,
            FileCategory::Script,
            FileCategory::Markup,
            FileCategory::Meta,
        ];
        for cat in categories {
            let _ = NodeType::from_category_and_content(cat, Path::new("test"), "");
        }
    }

    #[test]
    fn test_serde_lowercase() {
        assert_eq!(
            serde_json::to_string(&NodeType::Service).unwrap(),
            "\"service\""
        );
        assert_eq!(
            serde_json::to_string(&NodeType::Pipeline).unwrap(),
            "\"pipeline\""
        );
        assert_eq!(
            serde_json::to_string(&NodeType::Endpoint).unwrap(),
            "\"endpoint\""
        );
    }
}
