use crate::models::user::OfficeLocation;

/// Calculates the Haversine distance between two points on the Earth's surface.
/// Returns distance in meters.
pub fn calculate_distance(loc1: &OfficeLocation, loc2: &OfficeLocation) -> f64 {
    let earth_radius_m = 6_371_000.0;

    let lat1 = loc1.coordinates[1].to_radians();
    let lon1 = loc1.coordinates[0].to_radians();
    let lat2 = loc2.coordinates[1].to_radians();
    let lon2 = loc2.coordinates[0].to_radians();

    let dlat = lat2 - lat1;
    let dlon = lon2 - lon1;

    let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    earth_radius_m * c
}

/// Checks if user is within the geofence radius.
pub fn is_within_geofence(
    user_loc: &OfficeLocation,
    office_loc: &OfficeLocation,
    radius_m: f64,
) -> bool {
    calculate_distance(user_loc, office_loc) <= radius_m
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_distance() {
        // Monas to Sarinah (~1.2km)
        let monas = OfficeLocation {
            r#type: "Point".to_string(),
            coordinates: vec![106.827153, -6.175392],
        };
        let sarinah = OfficeLocation {
            r#type: "Point".to_string(),
            coordinates: vec![106.823908, -6.187383],
        };

        let dist = calculate_distance(&monas, &sarinah);
        assert!(dist > 1300.0 && dist < 1400.0); // Rough check
    }
}
