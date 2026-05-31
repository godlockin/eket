//! Edge type definitions for knowledge graph
//!
//! TASK-E11-004: Extends ticket schema to support non-code files

use serde::{Deserialize, Serialize};

/// Edge types for knowledge graph relationships
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[derive(Default)]
pub enum EdgeType {
    // === Structural relationships ===
    /// Module/file imports another
    Imports,
    /// Module/file exports symbols
    Exports,
    /// Parent contains child (file contains function, class contains method)
    Contains,
    /// Class inherits from another
    Inherits,
    /// Class/struct implements interface/trait
    Implements,

    // === Behavioral relationships ===
    /// Function calls another function
    Calls,
    /// Function reads from variable/field
    Reads,
    /// Function writes to variable/field
    Writes,
    /// Function instantiates a class
    Instantiates,

    // === Dependency relationships ===
    /// Generic dependency relationship
    #[default]
    DependsOn,
    /// Test file tests target
    TestedBy,
    /// Type references another type
    References,

    // === Non-code relationships (NEW for TASK-E11-004) ===
    /// Config file configures code (config -> code)
    Configures,
    /// Document describes code (document -> code)
    Documents,
    /// Service/container deploys code (service -> code)
    Deploys,
    /// Migration modifies table (migration -> table)
    Migrates,
    /// Pipeline triggers service/deployment (pipeline -> service)
    Triggers,
    /// Schema defines types used by code (schema -> code)
    DefinesSchema,
    /// Resource provisions service (resource -> service)
    Provisions,
    /// Routing config routes to service (config -> service)
    Routes,

    // === Reverse edges (for bidirectional queries) ===
    /// Inverse of Configures (code <- config)
    ConfiguredBy,
    /// Inverse of Documents (code <- document)
    DocumentedBy,
    /// Inverse of Deploys (code <- service)
    DeployedBy,
    /// Inverse of DefinesSchema (code <- schema)
    UsesSchema,
}

impl EdgeType {
    /// Get the inverse edge type for bidirectional relationships
    pub fn inverse(&self) -> Option<EdgeType> {
        match self {
            Self::Configures => Some(Self::ConfiguredBy),
            Self::ConfiguredBy => Some(Self::Configures),
            Self::Documents => Some(Self::DocumentedBy),
            Self::DocumentedBy => Some(Self::Documents),
            Self::Deploys => Some(Self::DeployedBy),
            Self::DeployedBy => Some(Self::Deploys),
            Self::DefinesSchema => Some(Self::UsesSchema),
            Self::UsesSchema => Some(Self::DefinesSchema),
            Self::Contains => None, // Contains doesn't have a meaningful inverse
            Self::Inherits => None, // InheritedBy would be unusual
            Self::Implements => None,
            Self::Calls => None,
            Self::Imports => None,
            Self::Exports => None,
            Self::Reads => None,
            Self::Writes => None,
            Self::Instantiates => None,
            Self::DependsOn => None,
            Self::TestedBy => None,
            Self::References => None,
            Self::Migrates => None,
            Self::Triggers => None,
            Self::Provisions => None,
            Self::Routes => None,
        }
    }

    /// Check if this is a structural relationship
    pub fn is_structural(&self) -> bool {
        matches!(
            self,
            Self::Imports | Self::Exports | Self::Contains | Self::Inherits | Self::Implements
        )
    }

    /// Check if this is a behavioral relationship
    pub fn is_behavioral(&self) -> bool {
        matches!(
            self,
            Self::Calls | Self::Reads | Self::Writes | Self::Instantiates
        )
    }

    /// Check if this is a non-code relationship
    pub fn is_non_code(&self) -> bool {
        matches!(
            self,
            Self::Configures
                | Self::ConfiguredBy
                | Self::Documents
                | Self::DocumentedBy
                | Self::Deploys
                | Self::DeployedBy
                | Self::Migrates
                | Self::Triggers
                | Self::DefinesSchema
                | Self::UsesSchema
                | Self::Provisions
                | Self::Routes
        )
    }
}

impl std::fmt::Display for EdgeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Imports => "imports",
            Self::Exports => "exports",
            Self::Contains => "contains",
            Self::Inherits => "inherits",
            Self::Implements => "implements",
            Self::Calls => "calls",
            Self::Reads => "reads",
            Self::Writes => "writes",
            Self::Instantiates => "instantiates",
            Self::DependsOn => "depends_on",
            Self::TestedBy => "tested_by",
            Self::References => "references",
            Self::Configures => "configures",
            Self::ConfiguredBy => "configured_by",
            Self::Documents => "documents",
            Self::DocumentedBy => "documented_by",
            Self::Deploys => "deploys",
            Self::DeployedBy => "deployed_by",
            Self::Migrates => "migrates",
            Self::Triggers => "triggers",
            Self::DefinesSchema => "defines_schema",
            Self::UsesSchema => "uses_schema",
            Self::Provisions => "provisions",
            Self::Routes => "routes",
        };
        write!(f, "{s}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_edge_type_snake_case_serde() {
        assert_eq!(
            serde_json::to_string(&EdgeType::DependsOn).unwrap(),
            "\"depends_on\""
        );
        assert_eq!(
            serde_json::to_string(&EdgeType::DefinesSchema).unwrap(),
            "\"defines_schema\""
        );
        assert_eq!(
            serde_json::to_string(&EdgeType::TestedBy).unwrap(),
            "\"tested_by\""
        );
    }

    #[test]
    fn test_edge_type_deserialize() {
        assert_eq!(
            serde_json::from_str::<EdgeType>("\"depends_on\"").unwrap(),
            EdgeType::DependsOn
        );
        assert_eq!(
            serde_json::from_str::<EdgeType>("\"defines_schema\"").unwrap(),
            EdgeType::DefinesSchema
        );
    }

    #[test]
    fn test_inverse_edges() {
        assert_eq!(EdgeType::Configures.inverse(), Some(EdgeType::ConfiguredBy));
        assert_eq!(EdgeType::ConfiguredBy.inverse(), Some(EdgeType::Configures));
        assert_eq!(EdgeType::Documents.inverse(), Some(EdgeType::DocumentedBy));
        assert_eq!(EdgeType::Deploys.inverse(), Some(EdgeType::DeployedBy));
        assert_eq!(
            EdgeType::DefinesSchema.inverse(),
            Some(EdgeType::UsesSchema)
        );
    }

    #[test]
    fn test_no_inverse_for_structural() {
        assert_eq!(EdgeType::Contains.inverse(), None);
        assert_eq!(EdgeType::Inherits.inverse(), None);
        assert_eq!(EdgeType::Implements.inverse(), None);
    }

    #[test]
    fn test_is_structural() {
        assert!(EdgeType::Imports.is_structural());
        assert!(EdgeType::Contains.is_structural());
        assert!(EdgeType::Inherits.is_structural());
        assert!(!EdgeType::Calls.is_structural());
        assert!(!EdgeType::Configures.is_structural());
    }

    #[test]
    fn test_is_behavioral() {
        assert!(EdgeType::Calls.is_behavioral());
        assert!(EdgeType::Reads.is_behavioral());
        assert!(EdgeType::Writes.is_behavioral());
        assert!(!EdgeType::Imports.is_behavioral());
        assert!(!EdgeType::Configures.is_behavioral());
    }

    #[test]
    fn test_is_non_code() {
        assert!(EdgeType::Configures.is_non_code());
        assert!(EdgeType::Documents.is_non_code());
        assert!(EdgeType::Deploys.is_non_code());
        assert!(EdgeType::Migrates.is_non_code());
        assert!(EdgeType::DefinesSchema.is_non_code());
        assert!(!EdgeType::Imports.is_non_code());
        assert!(!EdgeType::Calls.is_non_code());
    }

    #[test]
    fn test_display() {
        assert_eq!(format!("{}", EdgeType::DependsOn), "depends_on");
        assert_eq!(format!("{}", EdgeType::DefinesSchema), "defines_schema");
        assert_eq!(format!("{}", EdgeType::ConfiguredBy), "configured_by");
    }

    #[test]
    fn test_default() {
        assert_eq!(EdgeType::default(), EdgeType::DependsOn);
    }

    #[test]
    fn test_clone_eq() {
        let edge = EdgeType::Configures;
        let cloned = edge.clone();
        assert_eq!(edge, cloned);
    }
}
