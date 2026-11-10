// @req PLAY-27 — Keep derived analysis in GenesisBlockDB under a content/version key.

use crate::smart_medley::{SmartMedleyAnalysis, ANALYZER_VERSION};
use genesis_block_native::{
    RelationalFilter, RelationalMutationBatch, RelationalMutationKind, RelationalRowMutation,
    RelationalSchemaPackage,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use uuid::Uuid;

const SETTINGS_NAMESPACE: &str = "lalin_play";
const SETTINGS_TABLE: &str = "settings";

fn registered_schema_version(database: &genesis_block_native::Storage) -> Result<u32, String> {
    let registered = database
        .get_relational_schema(SETTINGS_NAMESPACE)
        .map_err(|error| format!("cannot read the registered Lalin Play schema: {error}"))?;
    registered_schema_version_from_package(registered)
}

fn registered_schema_version_from_package(
    registered: Option<RelationalSchemaPackage>,
) -> Result<u32, String> {
    let package = registered
        .ok_or_else(|| "the Lalin Play relational schema is not registered".to_string())?;
    if package.namespace != SETTINGS_NAMESPACE || package.schema_version == 0 {
        return Err("the registered Lalin Play schema package is invalid".into());
    }
    Ok(package.schema_version)
}

pub fn load(
    directory: &Path,
    media_sha256: &str,
    analyzer_version: &str,
) -> Result<Option<SmartMedleyAnalysis>, String> {
    let key = cache_key(media_sha256, analyzer_version)?;
    let database = crate::library_store::open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let rows = crate::library_store::query_rows_at_offset(
        &database,
        SETTINGS_TABLE,
        &["id", "value"],
        vec![RelationalFilter::equal("id", Value::String(key.clone()))],
        1,
        0,
    )?;
    let Some(row) = rows.first() else {
        return Ok(None);
    };
    if row.get("id").and_then(Value::as_str) != Some(key.as_str()) {
        return Ok(None);
    }
    let Some(payload) = row.get("value").and_then(Value::as_str) else {
        return Ok(None);
    };
    let Ok(analysis) = serde_json::from_str::<SmartMedleyAnalysis>(payload) else {
        return Ok(None);
    };
    if analysis.analysis_version != analyzer_version
        || analysis.media_sha256.as_deref() != Some(media_sha256.to_ascii_lowercase().as_str())
    {
        return Ok(None);
    }
    Ok(Some(analysis))
}

pub fn save(directory: &Path, analysis: &SmartMedleyAnalysis) -> Result<(), String> {
    let media_sha256 = analysis
        .media_sha256
        .as_deref()
        .ok_or_else(|| "analysis cache requires a media SHA-256".to_string())?;
    let key = cache_key(media_sha256, &analysis.analysis_version)?;
    if analysis.analysis_version != ANALYZER_VERSION || analysis.duration_seconds.is_none() {
        return Err("analysis cache payload is stale or incomplete".into());
    }
    let serialized = serde_json::to_string(analysis).map_err(|error| error.to_string())?;
    let database = crate::library_store::open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let schema_version = registered_schema_version(&database)?;
    database
        .apply_relational_batch(RelationalMutationBatch {
            mutation_id: Uuid::new_v4().to_string(),
            namespace: SETTINGS_NAMESPACE.into(),
            schema_version,
            operations: vec![RelationalRowMutation {
                table: SETTINGS_TABLE.into(),
                kind: RelationalMutationKind::Upsert,
                values: json!({ "id": key, "value": serialized }),
                key: None,
            }],
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn clear(directory: &Path, media_sha256: &str, analyzer_version: &str) -> Result<(), String> {
    let key = cache_key(media_sha256, analyzer_version)?;
    let database = crate::library_store::open_database(directory)?;
    let database = database.lock().map_err(|error| error.to_string())?;
    let schema_version = registered_schema_version(&database)?;
    database
        .apply_relational_batch(RelationalMutationBatch {
            mutation_id: Uuid::new_v4().to_string(),
            namespace: SETTINGS_NAMESPACE.into(),
            schema_version,
            operations: vec![RelationalRowMutation {
                table: SETTINGS_TABLE.into(),
                kind: RelationalMutationKind::Delete,
                values: Value::Null,
                key: Some(json!({ "id": key })),
            }],
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn cache_key(media_sha256: &str, analyzer_version: &str) -> Result<String, String> {
    if media_sha256.len() != 64 || !media_sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("analysis cache key needs a 64-character SHA-256".into());
    }
    if analyzer_version.is_empty()
        || !analyzer_version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err("analysis cache key has an invalid analyzer version".into());
    }
    let normalized_hash = media_sha256.to_ascii_lowercase();
    let hasher = Sha256::digest(format!("{analyzer_version}:{normalized_hash}").as_bytes());
    let digest = hasher
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(format!("smart_medley_cache:{analyzer_version}:{digest}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::smart_medley::{
        AnalysisAvailability, AnalysisCacheState, KeyMode, MusicalKey, SmartMedleyAnalysis,
    };

    fn sample_analysis(hash: &str) -> SmartMedleyAnalysis {
        SmartMedleyAnalysis {
            analysis_version: ANALYZER_VERSION.into(),
            media_sha256: Some(hash.into()),
            duration_seconds: Some(12.0),
            bpm: Some(120.0),
            bpm_confidence: 0.86,
            key: Some(MusicalKey {
                tonic_semitone: 0,
                mode: KeyMode::Major,
            }),
            key_confidence: 0.81,
            cue_in_seconds: Some(0.0),
            cue_out_seconds: Some(12.0),
            cue_confidence: 0.83,
            availability: AnalysisAvailability::Ready,
            fallback_reason: None,
            cache_state: AnalysisCacheState::NotAttempted,
        }
    }

    fn schema_package(version: u32) -> RelationalSchemaPackage {
        RelationalSchemaPackage {
            namespace: SETTINGS_NAMESPACE.into(),
            schema_version: version,
            previous_version: None,
            package_id: "00000000-0000-4000-8000-000000000001".into(),
            schema_hash: String::new(),
            tables: vec![],
            named_queries: vec![],
        }
    }

    #[test]
    fn registered_schema_version_accepts_v1_and_v3_packages() {
        for version in [1, 3] {
            assert_eq!(
                registered_schema_version_from_package(Some(schema_package(version))).unwrap(),
                version
            );
        }
    }

    #[test]
    fn registered_schema_version_fails_closed_for_absent_or_invalid_package() {
        assert!(registered_schema_version_from_package(None).is_err());

        let mut wrong_namespace = schema_package(1);
        wrong_namespace.namespace = "another_namespace".into();
        assert!(registered_schema_version_from_package(Some(wrong_namespace)).is_err());

        assert!(registered_schema_version_from_package(Some(schema_package(0))).is_err());
    }

    #[test]
    fn genesis_cache_round_trips_and_is_separated_by_hash_and_version() {
        let directory = tempfile::tempdir().unwrap();
        let hash = "a".repeat(64);
        let sample = sample_analysis(&hash);
        let database = crate::library_store::open_database(directory.path()).unwrap();
        let schema_before = {
            let database = database.lock().unwrap();
            registered_schema_version(&database).unwrap()
        };
        save(directory.path(), &sample).unwrap();

        let loaded = load(directory.path(), &hash, ANALYZER_VERSION)
            .unwrap()
            .expect("cached analysis");
        assert_eq!(loaded, sample);
        assert!(load(directory.path(), &"b".repeat(64), ANALYZER_VERSION)
            .unwrap()
            .is_none());
        assert!(load(directory.path(), &hash, "smart-medley-next")
            .unwrap()
            .is_none());
        clear(directory.path(), &hash, ANALYZER_VERSION).unwrap();
        assert!(load(directory.path(), &hash, ANALYZER_VERSION)
            .unwrap()
            .is_none());
        let schema_after = {
            let database = database.lock().unwrap();
            registered_schema_version(&database).unwrap()
        };
        assert_eq!(schema_after, schema_before);
    }

    #[test]
    fn genesis_cache_rejects_malformed_hash_and_version() {
        let directory = tempfile::tempdir().unwrap();
        assert!(load(directory.path(), "not-a-hash", ANALYZER_VERSION).is_err());
        assert!(load(directory.path(), &"a".repeat(64), "../version").is_err());
    }

    #[test]
    fn cache_id_is_stable_for_media_hash_and_analyzer_version() {
        let media_hash = "A".repeat(64);
        let current_key = cache_key(&media_hash, ANALYZER_VERSION).unwrap();
        assert_eq!(
            current_key,
            "smart_medley_cache:smart-medley-0.2.0:9f44e89c4b0c33af752cca67652dce5b693e72868d7de95b5f4d8ab50b98b157"
        );
        assert_ne!(
            current_key,
            cache_key(&media_hash, "smart-medley-0.1.0").unwrap()
        );
    }
}
