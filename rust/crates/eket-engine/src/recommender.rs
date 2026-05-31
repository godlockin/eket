/// Recommender — TF-IDF cosine similarity for ticket recommendation.
use std::collections::HashMap;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct RecommendResult {
    pub ticket_id: String,
    pub title: String,
    pub score: f64,
    pub matched_terms: Vec<String>,
}

// ─── Recommender ─────────────────────────────────────────────────────────────

pub struct Recommender;

impl Recommender {
    pub fn new() -> Self {
        Self
    }

    /// TF-IDF cosine similarity recommendation.
    ///
    /// * `query_content` — new ticket's content
    /// * `corpus`        — existing tickets as `(id, title, content)`
    /// * `k`             — return top-k results
    pub fn recommend(
        &self,
        query_content: &str,
        corpus: &[(String, String, String)],
        k: usize,
    ) -> Vec<RecommendResult> {
        if corpus.is_empty() || k == 0 {
            return Vec::new();
        }

        // Tokenize all documents
        let query_tokens = tokenize(query_content);
        let corpus_tokens: Vec<Vec<String>> = corpus
            .iter()
            .map(|(_, _, content)| tokenize(content))
            .collect();

        // Build all-docs list for IDF (corpus only, consistent with common practice)
        let all_docs: Vec<&Vec<String>> = corpus_tokens.iter().collect();

        // Build query TF-IDF vector
        let query_vec = tfidf_vector(&query_tokens, &all_docs);

        // Score each corpus doc
        let mut scored: Vec<(usize, f64)> = corpus_tokens
            .iter()
            .enumerate()
            .map(|(i, tokens)| {
                let doc_vec = tfidf_vector(tokens, &all_docs);
                let score = cosine_similarity(&query_vec, &doc_vec);
                (i, score)
            })
            .collect();

        // Sort descending
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Build results, skip zero-score items
        scored
            .into_iter()
            .filter(|(_, score)| *score > 0.0)
            .take(k)
            .map(|(i, score)| {
                let (id, title, _) = &corpus[i];
                let doc_vec = tfidf_vector(&corpus_tokens[i], &all_docs);
                // matched_terms: terms in both query and doc with non-zero weight
                let matched_terms: Vec<String> = query_vec
                    .keys()
                    .filter(|t| doc_vec.contains_key(*t))
                    .cloned()
                    .collect();
                RecommendResult {
                    ticket_id: id.clone(),
                    title: title.clone(),
                    score,
                    matched_terms,
                }
            })
            .collect()
    }
}

impl Default for Recommender {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/// Tokenize text: CJK unigrams + ASCII words (lowercase, len >= 2).
pub fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut ascii_buf = String::new();

    for ch in text.chars() {
        if is_cjk(ch) {
            // Flush ASCII buffer first
            if !ascii_buf.is_empty() {
                flush_ascii(&mut ascii_buf, &mut tokens);
            }
            // CJK unigram
            tokens.push(ch.to_string());
        } else if ch.is_ascii_alphanumeric() {
            ascii_buf.push(ch.to_ascii_lowercase());
        } else {
            // delimiter
            if !ascii_buf.is_empty() {
                flush_ascii(&mut ascii_buf, &mut tokens);
            }
        }
    }
    if !ascii_buf.is_empty() {
        flush_ascii(&mut ascii_buf, &mut tokens);
    }

    tokens
}

fn flush_ascii(buf: &mut String, tokens: &mut Vec<String>) {
    if buf.len() >= 2 {
        tokens.push(buf.clone());
    }
    buf.clear();
}

fn is_cjk(ch: char) -> bool {
    matches!(ch,
        '\u{4E00}'..='\u{9FFF}'   // CJK Unified Ideographs
        | '\u{3400}'..='\u{4DBF}' // Extension A
        | '\u{20000}'..='\u{2A6DF}' // Extension B
        | '\u{F900}'..='\u{FAFF}' // CJK Compatibility Ideographs
        | '\u{3040}'..='\u{309F}' // Hiragana
        | '\u{30A0}'..='\u{30FF}' // Katakana
    )
}

fn tf(term: &str, doc_tokens: &[String]) -> f64 {
    if doc_tokens.is_empty() {
        return 0.0;
    }
    let count = doc_tokens.iter().filter(|t| t.as_str() == term).count();
    count as f64 / doc_tokens.len() as f64
}

fn idf(term: &str, all_docs: &[&Vec<String>]) -> f64 {
    let df = all_docs
        .iter()
        .filter(|doc| doc.iter().any(|t| t.as_str() == term))
        .count();
    ((all_docs.len() as f64 + 1.0) / (df as f64 + 1.0)).ln() + 1.0
}

fn tfidf_vector(tokens: &[String], all_docs: &[&Vec<String>]) -> HashMap<String, f64> {
    let mut vocab: Vec<&str> = tokens.iter().map(|s| s.as_str()).collect();
    vocab.sort_unstable();
    vocab.dedup();

    vocab
        .into_iter()
        .map(|term| {
            let score = tf(term, tokens) * idf(term, all_docs);
            (term.to_owned(), score)
        })
        .collect()
}

fn cosine_similarity(a: &HashMap<String, f64>, b: &HashMap<String, f64>) -> f64 {
    let dot: f64 = a
        .iter()
        .filter_map(|(k, va)| b.get(k).map(|vb| va * vb))
        .sum();

    let norm_a: f64 = a.values().map(|v| v * v).sum::<f64>().sqrt();
    let norm_b: f64 = b.values().map(|v| v * v).sum::<f64>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommend_finds_similar() {
        let rec = Recommender::new();
        let corpus = vec![
            (
                "T-1".to_owned(),
                "Memory Safety".to_owned(),
                "Rust ownership borrow checker memory safety".to_owned(),
            ),
            (
                "T-2".to_owned(),
                "Web Framework".to_owned(),
                "HTTP server routing middleware REST API".to_owned(),
            ),
            (
                "T-3".to_owned(),
                "Database".to_owned(),
                "SQLite query performance index optimization".to_owned(),
            ),
        ];
        let results = rec.recommend("Rust memory ownership borrow checker", &corpus, 3);
        assert!(!results.is_empty());
        assert_eq!(results[0].ticket_id, "T-1");
        assert!(results[0].score > 0.0);
    }

    #[test]
    fn recommend_empty_corpus() {
        let rec = Recommender::new();
        let results = rec.recommend("anything", &[], 5);
        assert!(results.is_empty());
    }

    #[test]
    fn tokenize_chinese() {
        let tokens = tokenize("内存安全");
        assert_eq!(tokens, vec!["内", "存", "安", "全"]);
    }

    #[test]
    fn tokenize_mixed() {
        let tokens = tokenize("Rust内存安全");
        assert!(tokens.contains(&"rust".to_owned()));
        assert!(tokens.contains(&"内".to_owned()));
    }

    #[test]
    fn tokenize_filters_short() {
        let tokens = tokenize("a bb ccc");
        // "a" length 1 should be filtered, "bb" and "ccc" kept
        assert!(!tokens.contains(&"a".to_owned()));
        assert!(tokens.contains(&"bb".to_owned()));
        assert!(tokens.contains(&"ccc".to_owned()));
    }

    #[test]
    fn recommend_returns_top_k() {
        let rec = Recommender::new();
        let corpus: Vec<(String, String, String)> = (0..10)
            .map(|i| {
                (
                    format!("T-{i}"),
                    format!("Ticket {i}"),
                    format!("rust memory ownership borrow checker safety item{i}"),
                )
            })
            .collect();
        let results = rec.recommend("rust memory ownership", &corpus, 3);
        assert!(results.len() <= 3);
    }
}
