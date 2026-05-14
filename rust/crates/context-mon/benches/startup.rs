use criterion::{black_box, criterion_group, criterion_main, Criterion};
use context_mon::ContextEstimator;

fn benchmark_rough_estimate(c: &mut Criterion) {
    let estimator = ContextEstimator::new();
    c.bench_function("rough_estimate", |b| {
        b.iter(|| black_box(estimator.rough_estimate()))
    });
}

fn benchmark_startup(c: &mut Criterion) {
    c.bench_function("full_estimate", |b| {
        b.iter(|| {
            let estimator = ContextEstimator::new();
            black_box(estimator.estimate())
        })
    });
}

criterion_group!(benches, benchmark_rough_estimate, benchmark_startup);
criterion_main!(benches);
