//! expertise_embedding.rs
//! 将 role/skills 标签编码为 64 维向量，用于语义相似度 dispatch。
//! 编码方式：字符哈希 bag-of-words + L2 归一化（不依赖外部 LLM）。

const DIMS: usize = 64;

/// 将标签列表编码为 64 维 f32 向量（L2 归一化）。
/// 每个 tag 的每个字符 c：bucket = (c as usize * 2654435761) % DIMS，叠加 1.0。
pub fn encode_tags(tags: &[String]) -> Vec<f32> {
    let mut vec = vec![0.0f32; DIMS];
    for tag in tags {
        for c in tag.chars() {
            let bucket = ((c as usize).wrapping_mul(2_654_435_761)) % DIMS;
            vec[bucket] += 1.0;
        }
    }
    l2_normalize(&mut vec);
    vec
}

/// 两向量 cosine 相似度。维度不匹配或零向量返回 0.0。
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    (dot / (norm_a * norm_b)).clamp(-1.0, 1.0)
}

fn l2_normalize(vec: &mut [f32]) {
    let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in vec.iter_mut() {
            *x /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_tags_produces_64d_vector() {
        let tags = vec!["rust".to_string(), "backend".to_string()];
        let v = encode_tags(&tags);
        assert_eq!(v.len(), 64);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "should be L2-normalized, norm={norm}");
    }

    #[test]
    fn test_encode_tags_empty_returns_zero_vector() {
        let v = encode_tags(&[]);
        assert_eq!(v.len(), 64);
        assert!(v.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn test_cosine_similarity_identical_vectors() {
        let tags = vec!["rust".to_string()];
        let v = encode_tags(&tags);
        let sim = cosine_similarity(&v, &v);
        assert!((sim - 1.0).abs() < 1e-5, "identical vectors should have cosine=1.0, got {sim}");
    }

    #[test]
    fn test_cosine_similarity_zero_vector() {
        let a = vec![0.0f32; 64];
        let b = encode_tags(&["rust".to_string()]);
        assert_eq!(cosine_similarity(&a, &b), 0.0);
    }

    #[test]
    fn test_cosine_similarity_same_tags_high_score() {
        let a = encode_tags(&["rust".to_string(), "backend".to_string()]);
        let b = encode_tags(&["rust".to_string(), "backend".to_string()]);
        let sim = cosine_similarity(&a, &b);
        assert!(sim > 0.99, "same tags should score > 0.99, got {sim}");
    }
}
