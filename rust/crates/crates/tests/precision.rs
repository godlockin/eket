use context_mon::ContextEstimator;

fn main() -> anyhow::Result<()> {
    let estimator = ContextEstimator::new();

    let start = std::time::Instant::now();
    let rough = estimator.rough_estimate()?;
    println!("Rough: {} tokens in {:.2}ms", rough, start.elapsed().as_secs_f64() * 1000.0);

    let start = std::time::Instant::now();
    let precise = estimator.precise_estimate()?;
    println!("Precise: {} tokens in {:.2}ms", precise, start.elapsed().as_secs_f64() * 1000.0);

    Ok(())
}
