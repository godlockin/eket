use criterion::{black_box, criterion_group, criterion_main, Criterion};
use context_mon::ContextEstimator;

fn startup_benchmark(c: &mut Criterion) {
    c.bench_function("startup", |b| {
        b.iter(|| {
            let estimator = ContextEstimator::new();
            black_box(estimator.rough_estimate())
        })
    });
}

criterion_group!(benches, startup_benchmark);
criterion_main!(benches);
