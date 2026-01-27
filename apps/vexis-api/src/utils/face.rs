/// Calculates similarity between two sets of 3D landmarks.
/// landmarks1 and landmarks2 should be flat vectors of 1434 elements (478 * 3).
pub fn compare_landmarks(landmarks1: &Vec<f32>, landmarks2: &Vec<f32>) -> f32 {
    if landmarks1.len() != landmarks2.len() || landmarks1.is_empty() {
        return 0.0;
    }

    // Simple Euclidean distance based similarity
    let mut sum_sq_diff = 0.0;
    for i in 0..landmarks1.len() {
        sum_sq_diff += (landmarks1[i] - landmarks2[i]).powi(2);
    }

    let mse = sum_sq_diff / (landmarks1.len() as f32);
    let rmse = mse.sqrt();

    // Convert distance to similarity score (0.0 to 1.0)
    // This is a heuristic, threshold needs to be tuned.
    // MediaPipe landmarks are normalized [0, 1] usually.
    let similarity = 1.0 / (1.0 + rmse);

    similarity
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_identical() {
        let l1 = vec![0.5; 1434];
        let l2 = vec![0.5; 1434];
        assert_eq!(compare_landmarks(&l1, &l2), 1.0);
    }
}
