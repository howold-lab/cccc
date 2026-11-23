//! Sidebar sections: named folders of Groups, plus Groups pinned beside the overview. Stored
//! once per CCCC home so every browser and device shows the same sections.

use std::path::{Path, PathBuf};

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::AppState;
use crate::api::{ApiError, ApiResult, success};

const MAX_SECTIONS: usize = 50;
const MAX_NAME_CHARS: usize = 40;
const MAX_IDS: usize = 500;

pub(super) fn routes() -> Router<AppState> {
    Router::new().route(
        "/api/v1/sidebar/sections",
        get(get_sections).put(put_sections),
    )
}

fn store_path(root: &Path) -> PathBuf {
    root.join("state").join("sidebar_sections.json")
}

async fn get_sections(State(state): State<AppState>) -> ApiResult {
    Ok(success(read_sections(state.home.root())))
}

async fn put_sections(State(state): State<AppState>, Json(body): Json<Value>) -> ApiResult {
    let normalized = normalize(&body).map_err(ApiError::bad)?;
    let path = store_path(state.home.root());
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| ApiError::bad(error.to_string()))?;
    }
    let bytes =
        serde_json::to_vec_pretty(&normalized).map_err(|error| ApiError::bad(error.to_string()))?;
    cccc_core::fs::atomic_write(&path, &bytes).map_err(|error| ApiError::bad(error.to_string()))?;
    Ok(success(json!({"saved": true, "sections": normalized})))
}

/// The saved sections, or an empty layout (`saved: false`) before anything was saved.
fn read_sections(root: &Path) -> Value {
    let saved = std::fs::read_to_string(store_path(root))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|value| normalize(&value).ok());
    match saved {
        Some(sections) => json!({"saved": true, "sections": sections}),
        None => json!({"saved": false, "sections": {"v": 1, "pinned": [], "sections": []}}),
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn id_list(value: Option<&Value>, field: &str) -> Result<Vec<String>, String> {
    let Some(value) = value else {
        return Ok(Vec::new());
    };
    let items = value
        .as_array()
        .ok_or_else(|| format!("{field} must be a list of Group IDs"))?;
    if items.len() > MAX_IDS {
        return Err(format!("{field} has too many entries"));
    }
    let mut out: Vec<String> = Vec::new();
    for item in items {
        let id = item
            .as_str()
            .filter(|id| valid_id(id))
            .ok_or_else(|| format!("{field} has an invalid Group ID"))?;
        if !out.iter().any(|seen| seen == id) {
            out.push(id.to_owned());
        }
    }
    Ok(out)
}

/// Checks and tidies a layout: valid IDs, trimmed non-empty names, and each Group in at most
/// one place (pinned first, then the first section that lists it).
fn normalize(body: &Value) -> Result<Value, String> {
    let pinned = id_list(body.get("pinned"), "pinned")?;
    let mut placed: Vec<String> = pinned.clone();
    let raw = match body.get("sections") {
        None => Vec::new(),
        Some(value) => value
            .as_array()
            .ok_or_else(|| "sections must be a list".to_owned())?
            .clone(),
    };
    if raw.len() > MAX_SECTIONS {
        return Err("too many sections".into());
    }
    let mut sections = Vec::new();
    let mut ids: Vec<String> = Vec::new();
    for section in raw {
        let id = section
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| valid_id(id))
            .ok_or_else(|| "a section has an invalid id".to_owned())?;
        if ids.iter().any(|seen| seen == id) {
            return Err("section ids must be unique".into());
        }
        ids.push(id.to_owned());
        let name = section
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "a section needs a name".to_owned())?;
        if name.chars().count() > MAX_NAME_CHARS {
            return Err("a section name is too long".into());
        }
        let group_ids: Vec<String> = id_list(section.get("group_ids"), "group_ids")?
            .into_iter()
            .filter(|gid| !placed.contains(gid))
            .collect();
        placed.extend(group_ids.iter().cloned());
        sections.push(json!({"id": id, "name": name, "group_ids": group_ids}));
    }
    Ok(json!({"v": 1, "pinned": pinned, "sections": sections}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_empty_layout_before_anything_is_saved() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_sections(dir.path());
        assert_eq!(result["saved"], false);
        assert_eq!(result["sections"]["sections"], json!([]));
    }

    #[test]
    fn keeps_each_group_in_one_place() {
        let layout = normalize(&json!({
            "pinned": ["g_a"],
            "sections": [
                {"id": "s1", "name": " 中台 ", "group_ids": ["g_a", "g_b", "g_b"]},
                {"id": "s2", "name": "知识库", "group_ids": ["g_b", "g_c"]}
            ]
        }))
        .unwrap();
        assert_eq!(layout["pinned"], json!(["g_a"]));
        assert_eq!(layout["sections"][0]["name"], "中台");
        assert_eq!(layout["sections"][0]["group_ids"], json!(["g_b"]));
        assert_eq!(layout["sections"][1]["group_ids"], json!(["g_c"]));
    }

    #[test]
    fn rejects_bad_layouts() {
        assert!(normalize(&json!({"sections": [{"id": "s1", "name": ""}]})).is_err());
        assert!(normalize(&json!({"sections": [{"id": "../x", "name": "a"}]})).is_err());
        assert!(
            normalize(&json!({"sections": [{"id": "s", "name": "a"}, {"id": "s", "name": "b"}]}))
                .is_err()
        );
        assert!(normalize(&json!({"pinned": ["../etc"]})).is_err());
        assert!(normalize(&json!({"sections": [{"id": "s", "name": "x".repeat(41)}]})).is_err());
    }

    #[test]
    fn round_trips_through_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let layout =
            normalize(&json!({"sections": [{"id": "s1", "name": "中台", "group_ids": ["g_a"]}]}))
                .unwrap();
        let path = store_path(dir.path());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        cccc_core::fs::atomic_write(&path, &serde_json::to_vec(&layout).unwrap()).unwrap();
        let result = read_sections(dir.path());
        assert_eq!(result["saved"], true);
        assert_eq!(
            result["sections"]["sections"][0]["group_ids"],
            json!(["g_a"])
        );
    }
}
