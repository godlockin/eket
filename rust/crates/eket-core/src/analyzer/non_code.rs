//! Non-code file analysis implementation
//!
//! TASK-E11-004: Analyzes non-code files to extract nodes and relationships

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::OnceLock;

use crate::edge::EdgeType;
use crate::file::FileCategory;
use crate::node::NodeType;

/// Result of analyzing a non-code file
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NonCodeAnalysis {
    /// Primary node type for this file
    pub node_type: NodeType,
    /// Extracted child nodes (e.g., tables in SQL, services in docker-compose)
    pub nodes: Vec<NonCodeNode>,
    /// References to other files/symbols
    pub references: Vec<FileReference>,
    /// Metadata extracted from the file
    pub metadata: NonCodeMetadata,
}

/// A node extracted from a non-code file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NonCodeNode {
    /// Node identifier (e.g., table name, service name)
    pub id: String,
    /// Node type
    pub node_type: NodeType,
    /// Line number where defined (1-based)
    pub line: usize,
    /// Additional properties
    pub properties: serde_json::Value,
}

/// Reference from non-code file to another file or symbol
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReference {
    /// Target path or symbol
    pub target: String,
    /// Type of relationship
    pub edge_type: EdgeType,
    /// Line number of reference (1-based)
    pub line: usize,
}

/// Metadata extracted from non-code file
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NonCodeMetadata {
    /// File format (yaml, json, toml, etc.)
    pub format: Option<String>,
    /// Version if present (e.g., OpenAPI version)
    pub version: Option<String>,
    /// Description if present
    pub description: Option<String>,
    /// Tags/labels
    pub tags: Vec<String>,
}

/// Analyze a non-code file and extract knowledge graph data
pub fn analyze_non_code_file(path: &Path, category: FileCategory) -> NonCodeAnalysis {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return NonCodeAnalysis::default(),
    };

    analyze_content(path, category, &content)
}

/// Analyze content with known category (for testing)
pub fn analyze_content(path: &Path, category: FileCategory, content: &str) -> NonCodeAnalysis {
    let node_type = NodeType::from_category_and_content(category.clone(), path, content);

    match category {
        FileCategory::Config => analyze_config(path, content, node_type),
        FileCategory::Docs => analyze_docs(path, content),
        FileCategory::Infra => analyze_infra(path, content, node_type),
        FileCategory::Data => analyze_data(path, content, node_type),
        FileCategory::Script => analyze_script(path, content),
        _ => NonCodeAnalysis {
            node_type,
            ..Default::default()
        },
    }
}

// === Config Analysis ===

fn analyze_config(path: &Path, content: &str, node_type: NodeType) -> NonCodeAnalysis {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let metadata = NonCodeMetadata {
        format: Some(ext.clone()),
        ..Default::default()
    };

    let mut references = Vec::new();

    // Extract file references from config
    for (line_num, line) in content.lines().enumerate() {
        // Look for file path patterns
        if let Some(path_ref) = extract_file_reference(line) {
            references.push(FileReference {
                target: path_ref,
                edge_type: EdgeType::Configures,
                line: line_num + 1,
            });
        }
    }

    NonCodeAnalysis {
        node_type,
        nodes: Vec::new(),
        references,
        metadata,
    }
}

// === Documentation Analysis ===

fn analyze_docs(path: &Path, content: &str) -> NonCodeAnalysis {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let mut references = Vec::new();
    let mut tags = Vec::new();

    // Extract code references from markdown
    for (line_num, line) in content.lines().enumerate() {
        // Look for code file links
        if let Some(link) = extract_markdown_link(line) {
            if looks_like_code_file(&link) {
                references.push(FileReference {
                    target: link,
                    edge_type: EdgeType::Documents,
                    line: line_num + 1,
                });
            }
        }

        // Extract hashtags (common in docs)
        for tag in extract_hashtags(line) {
            if !tags.contains(&tag) {
                tags.push(tag);
            }
        }
    }

    // Extract description from first paragraph
    let description = content.lines().take(5).collect::<Vec<_>>().join(" ");

    NonCodeAnalysis {
        node_type: NodeType::Document,
        nodes: Vec::new(),
        references,
        metadata: NonCodeMetadata {
            format: Some(ext),
            description: Some(description.chars().take(200).collect()),
            tags,
            ..Default::default()
        },
    }
}

// === Infrastructure Analysis ===

fn analyze_infra(path: &Path, content: &str, node_type: NodeType) -> NonCodeAnalysis {
    let filename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    if filename.starts_with("dockerfile") || filename.ends_with(".dockerfile") {
        return analyze_dockerfile(content);
    }

    if filename.contains("docker-compose") {
        return analyze_docker_compose(content);
    }

    let path_str = path.to_string_lossy();
    if path_str.contains(".github/workflows") {
        return analyze_github_workflow(content);
    }

    // K8s or other infra
    NonCodeAnalysis {
        node_type,
        ..Default::default()
    }
}

fn analyze_dockerfile(content: &str) -> NonCodeAnalysis {
    let mut references = Vec::new();

    // Extract base images
    static BASE_IMAGE_RE: OnceLock<Regex> = OnceLock::new();
    let base_re =
        BASE_IMAGE_RE.get_or_init(|| Regex::new(r"(?i)^FROM\s+([^\s]+)").expect("Invalid regex"));

    for (line_num, line) in content.lines().enumerate() {
        if let Some(caps) = base_re.captures(line) {
            references.push(FileReference {
                target: caps[1].to_string(),
                edge_type: EdgeType::DependsOn,
                line: line_num + 1,
            });
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Service,
        nodes: Vec::new(),
        references,
        metadata: NonCodeMetadata {
            format: Some("dockerfile".to_string()),
            ..Default::default()
        },
    }
}

fn analyze_docker_compose(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();

    // Extract services
    static SERVICE_RE: OnceLock<Regex> = OnceLock::new();
    let service_re =
        SERVICE_RE.get_or_init(|| Regex::new(r"(?m)^  ([a-zA-Z0-9_-]+):$").expect("Invalid regex"));

    let mut in_services = false;
    for (line_num, line) in content.lines().enumerate() {
        if line.starts_with("services:") {
            in_services = true;
            continue;
        }

        if in_services {
            if let Some(caps) = service_re.captures(line) {
                nodes.push(NonCodeNode {
                    id: caps[1].to_string(),
                    node_type: NodeType::Service,
                    line: line_num + 1,
                    properties: serde_json::json!({}),
                });
            }

            // Exit services section on new top-level key
            if !line.starts_with(' ') && !line.is_empty() && !line.starts_with('#') {
                in_services = false;
            }
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Service,
        nodes,
        references: Vec::new(),
        metadata: NonCodeMetadata {
            format: Some("docker-compose".to_string()),
            ..Default::default()
        },
    }
}

fn analyze_github_workflow(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();

    // Extract jobs
    static JOB_RE: OnceLock<Regex> = OnceLock::new();
    let job_re =
        JOB_RE.get_or_init(|| Regex::new(r"(?m)^  ([a-zA-Z0-9_-]+):$").expect("Invalid regex"));

    let mut in_jobs = false;
    for (line_num, line) in content.lines().enumerate() {
        if line.starts_with("jobs:") {
            in_jobs = true;
            continue;
        }

        if in_jobs {
            if let Some(caps) = job_re.captures(line) {
                nodes.push(NonCodeNode {
                    id: caps[1].to_string(),
                    node_type: NodeType::Pipeline,
                    line: line_num + 1,
                    properties: serde_json::json!({}),
                });
            }

            if !line.starts_with(' ') && !line.is_empty() && !line.starts_with('#') {
                in_jobs = false;
            }
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Pipeline,
        nodes,
        references: Vec::new(),
        metadata: NonCodeMetadata {
            format: Some("github-workflow".to_string()),
            ..Default::default()
        },
    }
}

// === Data/Schema Analysis ===

fn analyze_data(path: &Path, content: &str, node_type: NodeType) -> NonCodeAnalysis {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "sql" => analyze_sql(content),
        "graphql" | "gql" => analyze_graphql(content),
        "proto" => analyze_proto(content),
        "prisma" => analyze_prisma(content),
        _ => NonCodeAnalysis {
            node_type,
            ..Default::default()
        },
    }
}

fn analyze_sql(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();
    let mut references = Vec::new();

    // Extract table definitions
    static TABLE_RE: OnceLock<Regex> = OnceLock::new();
    let table_re = TABLE_RE.get_or_init(|| {
        Regex::new(r#"(?i)CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-zA-Z0-9_]+)[`"]?"#)
            .expect("Invalid regex")
    });

    // Extract foreign key references
    static FK_RE: OnceLock<Regex> = OnceLock::new();
    let fk_re = FK_RE.get_or_init(|| {
        Regex::new(r#"(?i)REFERENCES\s+[`"]?([a-zA-Z0-9_]+)[`"]?"#).expect("Invalid regex")
    });

    let mut in_comment = false;

    for (line_num, line) in content.lines().enumerate() {
        let trimmed = line.trim();

        // Skip comments
        if trimmed.starts_with("--") {
            continue;
        }
        if trimmed.starts_with("/*") {
            in_comment = true;
        }
        if in_comment {
            if trimmed.contains("*/") {
                in_comment = false;
            }
            continue;
        }

        // Extract tables
        if let Some(caps) = table_re.captures(line) {
            nodes.push(NonCodeNode {
                id: caps[1].to_string(),
                node_type: NodeType::Table,
                line: line_num + 1,
                properties: serde_json::json!({}),
            });
        }

        // Extract FK references
        if let Some(caps) = fk_re.captures(line) {
            references.push(FileReference {
                target: caps[1].to_string(),
                edge_type: EdgeType::References,
                line: line_num + 1,
            });
        }
    }

    let node_type = if nodes.is_empty() {
        NodeType::Schema
    } else {
        NodeType::Table
    };

    NonCodeAnalysis {
        node_type,
        nodes,
        references,
        metadata: NonCodeMetadata {
            format: Some("sql".to_string()),
            ..Default::default()
        },
    }
}

fn analyze_graphql(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();

    // Extract type definitions
    static TYPE_RE: OnceLock<Regex> = OnceLock::new();
    let type_re = TYPE_RE.get_or_init(|| Regex::new(r"(?m)^type\s+(\w+)").expect("Invalid regex"));

    for (line_num, line) in content.lines().enumerate() {
        if let Some(caps) = type_re.captures(line) {
            nodes.push(NonCodeNode {
                id: caps[1].to_string(),
                node_type: NodeType::Schema,
                line: line_num + 1,
                properties: serde_json::json!({"kind": "type"}),
            });
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Schema,
        nodes,
        references: Vec::new(),
        metadata: NonCodeMetadata {
            format: Some("graphql".to_string()),
            ..Default::default()
        },
    }
}

fn analyze_proto(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();

    // Extract message and service definitions
    static MESSAGE_RE: OnceLock<Regex> = OnceLock::new();
    let message_re =
        MESSAGE_RE.get_or_init(|| Regex::new(r"(?m)^message\s+(\w+)").expect("Invalid regex"));

    static SERVICE_RE: OnceLock<Regex> = OnceLock::new();
    let service_re =
        SERVICE_RE.get_or_init(|| Regex::new(r"(?m)^service\s+(\w+)").expect("Invalid regex"));

    for (line_num, line) in content.lines().enumerate() {
        if let Some(caps) = message_re.captures(line) {
            nodes.push(NonCodeNode {
                id: caps[1].to_string(),
                node_type: NodeType::Schema,
                line: line_num + 1,
                properties: serde_json::json!({"kind": "message"}),
            });
        }
        if let Some(caps) = service_re.captures(line) {
            nodes.push(NonCodeNode {
                id: caps[1].to_string(),
                node_type: NodeType::Service,
                line: line_num + 1,
                properties: serde_json::json!({"kind": "service"}),
            });
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Schema,
        nodes,
        references: Vec::new(),
        metadata: NonCodeMetadata {
            format: Some("proto".to_string()),
            ..Default::default()
        },
    }
}

fn analyze_prisma(content: &str) -> NonCodeAnalysis {
    let mut nodes = Vec::new();

    // Extract model definitions
    static MODEL_RE: OnceLock<Regex> = OnceLock::new();
    let model_re =
        MODEL_RE.get_or_init(|| Regex::new(r"(?m)^model\s+(\w+)").expect("Invalid regex"));

    for (line_num, line) in content.lines().enumerate() {
        if let Some(caps) = model_re.captures(line) {
            nodes.push(NonCodeNode {
                id: caps[1].to_string(),
                node_type: NodeType::Schema,
                line: line_num + 1,
                properties: serde_json::json!({"kind": "model"}),
            });
        }
    }

    NonCodeAnalysis {
        node_type: NodeType::Schema,
        nodes,
        references: Vec::new(),
        metadata: NonCodeMetadata {
            format: Some("prisma".to_string()),
            ..Default::default()
        },
    }
}

// === Script Analysis ===

fn analyze_script(path: &Path, content: &str) -> NonCodeAnalysis {
    let mut references = Vec::new();

    // Extract sourced files
    static SOURCE_RE: OnceLock<Regex> = OnceLock::new();
    let source_re = SOURCE_RE.get_or_init(|| {
        Regex::new(r#"(?:source|\.|\.\.)\s+["']?([^\s"']+)"#).expect("Invalid regex")
    });

    for (line_num, line) in content.lines().enumerate() {
        if let Some(caps) = source_re.captures(line) {
            references.push(FileReference {
                target: caps[1].to_string(),
                edge_type: EdgeType::Imports,
                line: line_num + 1,
            });
        }
    }

    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    NonCodeAnalysis {
        node_type: NodeType::Script,
        nodes: Vec::new(),
        references,
        metadata: NonCodeMetadata {
            format: Some(ext),
            ..Default::default()
        },
    }
}

// === Helper Functions ===

fn extract_file_reference(line: &str) -> Option<String> {
    // Look for quoted file paths
    static FILE_REF_RE: OnceLock<Regex> = OnceLock::new();
    let re = FILE_REF_RE.get_or_init(|| {
        Regex::new(r#"["']([./][^"']+\.(js|ts|rs|py|go|java|rb|php|c|cpp|h))"#)
            .expect("Invalid regex")
    });

    re.captures(line).map(|caps| caps[1].to_string())
}

fn extract_markdown_link(line: &str) -> Option<String> {
    static LINK_RE: OnceLock<Regex> = OnceLock::new();
    let re = LINK_RE.get_or_init(|| Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").expect("Invalid regex"));

    re.captures(line).map(|caps| caps[2].to_string())
}

fn looks_like_code_file(path: &str) -> bool {
    let code_exts = [
        ".rs", ".ts", ".js", ".py", ".go", ".java", ".rb", ".c", ".cpp", ".h", ".cs", ".swift",
        ".kt",
    ];
    code_exts.iter().any(|ext| path.ends_with(ext))
}

fn extract_hashtags(line: &str) -> Vec<String> {
    static HASHTAG_RE: OnceLock<Regex> = OnceLock::new();
    let re =
        HASHTAG_RE.get_or_init(|| Regex::new(r"#([a-zA-Z][a-zA-Z0-9_-]*)").expect("Invalid regex"));

    re.captures_iter(line)
        .map(|caps| caps[1].to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_dockerfile() {
        let content = r#"
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
"#;
        let result = analyze_dockerfile(content);
        assert_eq!(result.node_type, NodeType::Service);
        assert_eq!(result.references.len(), 1);
        assert_eq!(result.references[0].target, "node:18-alpine");
    }

    #[test]
    fn test_analyze_docker_compose() {
        let content = r#"
version: '3'
services:
  web:
    build: .
  db:
    image: postgres
networks:
  default:
"#;
        let result = analyze_docker_compose(content);
        assert_eq!(result.node_type, NodeType::Service);
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].id, "web");
        assert_eq!(result.nodes[1].id, "db");
    }

    #[test]
    fn test_analyze_github_workflow() {
        let content = r#"
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
  test:
    needs: build
"#;
        let result = analyze_github_workflow(content);
        assert_eq!(result.node_type, NodeType::Pipeline);
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].id, "build");
        assert_eq!(result.nodes[1].id, "test");
    }

    #[test]
    fn test_analyze_sql_tables() {
        let content = r#"
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255)
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id)
);
"#;
        let result = analyze_sql(content);
        assert_eq!(result.node_type, NodeType::Table);
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].id, "users");
        assert_eq!(result.nodes[1].id, "posts");
        assert_eq!(result.references.len(), 1);
        assert_eq!(result.references[0].target, "users");
    }

    #[test]
    fn test_sql_comment_ignored() {
        let content = r#"
-- CREATE TABLE fake (id INT);
/* CREATE TABLE also_fake (id INT); */
SELECT * FROM real_table;
"#;
        let result = analyze_sql(content);
        assert_eq!(result.nodes.len(), 0);
    }

    #[test]
    fn test_analyze_graphql() {
        let content = r#"
type User {
  id: ID!
  name: String!
}

type Post {
  id: ID!
  author: User!
}
"#;
        let result = analyze_graphql(content);
        assert_eq!(result.node_type, NodeType::Schema);
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].id, "User");
        assert_eq!(result.nodes[1].id, "Post");
    }

    #[test]
    fn test_analyze_proto() {
        let content = r#"
syntax = "proto3";

message User {
  string id = 1;
  string name = 2;
}

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}
"#;
        let result = analyze_proto(content);
        assert_eq!(result.node_type, NodeType::Schema);
        assert_eq!(result.nodes.len(), 2);
        assert!(result.nodes.iter().any(|n| n.id == "User"));
        assert!(result.nodes.iter().any(|n| n.id == "UserService"));
    }

    #[test]
    fn test_analyze_prisma() {
        let content = r#"
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
"#;
        let result = analyze_prisma(content);
        assert_eq!(result.node_type, NodeType::Schema);
        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.nodes[0].id, "User");
        assert_eq!(result.nodes[1].id, "Post");
    }

    #[test]
    fn test_extract_file_reference() {
        assert_eq!(
            extract_file_reference(r#"import { foo } from "./module.ts""#),
            Some("./module.ts".to_string())
        );
        assert_eq!(
            extract_file_reference(r#"require('./helper.js')"#),
            Some("./helper.js".to_string())
        );
        assert_eq!(extract_file_reference("no file here"), None);
    }

    #[test]
    fn test_extract_markdown_link() {
        assert_eq!(
            extract_markdown_link("[see code](./src/main.rs)"),
            Some("./src/main.rs".to_string())
        );
        assert_eq!(
            extract_markdown_link("[docs](https://example.com)"),
            Some("https://example.com".to_string())
        );
    }

    #[test]
    fn test_looks_like_code_file() {
        assert!(looks_like_code_file("main.rs"));
        assert!(looks_like_code_file("app.ts"));
        assert!(looks_like_code_file("service.py"));
        assert!(!looks_like_code_file("readme.md"));
        assert!(!looks_like_code_file("config.yaml"));
    }

    #[test]
    fn test_extract_hashtags() {
        let tags = extract_hashtags("This is #important and #urgent");
        assert_eq!(tags.len(), 2);
        assert!(tags.contains(&"important".to_string()));
        assert!(tags.contains(&"urgent".to_string()));
    }

    #[test]
    fn test_analyze_content_integration() {
        let path = Path::new("Dockerfile");
        let content = "FROM rust:1.70\nCOPY . .";
        let result = analyze_content(path, FileCategory::Infra, content);
        assert_eq!(result.node_type, NodeType::Service);
    }
}
