//! Claude subscription limits for the overview, read from the claude-statusline skill's
//! usage records (`<config>/statusline/usage`). Read-only: the skill's own usage tool is the
//! only writer of those files.

use std::path::{Path, PathBuf};

use axum::Router;
use axum::routing::get;
use serde_json::{Value, json};

use crate::AppState;
use crate::api::{ApiResult, success};

pub(super) fn routes() -> Router<AppState> {
    Router::new().route("/api/v1/usage/claude-limits", get(get_claude_limits))
}

async fn get_claude_limits() -> ApiResult {
    let root = usage_root();
    Ok(success(read_limits(root.as_deref())))
}

/// The same rule as the skill's `usage_lib_usage_root`: `CLAUDE_USAGE_ROOT`, else
/// `<CLAUDE_CONFIG_DIR or ~/.claude>/statusline/usage`.
fn usage_root() -> Option<PathBuf> {
    if let Some(root) = std::env::var_os("CLAUDE_USAGE_ROOT").filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(root));
    }
    let config = std::env::var_os("CLAUDE_CONFIG_DIR")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".claude")))?;
    Some(config.join("statusline").join("usage"))
}

fn read_json(path: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn number(value: &Value, key: &str) -> Value {
    value
        .get(key)
        .filter(|item| item.is_number())
        .cloned()
        .unwrap_or(Value::Null)
}

fn text(value: &Value, key: &str) -> Value {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|item| !item.is_empty())
        .map(|item| Value::String(item.to_owned()))
        .unwrap_or(Value::Null)
}

/// Each account's latest 5-hour and 7-day usage. `installed` is false when the skill has no
/// usage directory yet; an account appears once its first state has been recorded.
fn read_limits(root: Option<&Path>) -> Value {
    let Some(root) = root.filter(|path| path.is_dir()) else {
        return json!({"installed": false, "accounts": []});
    };
    let accounts = read_json(&root.join("accounts.json")).unwrap_or(Value::Null);
    let mut directories: Vec<(String, Value)> = accounts
        .as_object()
        .map(|map| {
            map.values()
                .filter_map(|account| {
                    let directory = account.get("directory")?.as_str()?.to_owned();
                    Some((directory, account.clone()))
                })
                .collect()
        })
        .unwrap_or_default();
    if root.join("default").join("state.json").is_file()
        && !directories
            .iter()
            .any(|(directory, _)| directory == "default")
    {
        directories.push(("default".to_owned(), Value::Null));
    }

    let mut out = Vec::new();
    for (directory, account) in directories {
        // Only plain child directory names: never follow a path out of the usage root.
        if directory.is_empty() || directory.contains(['/', '\\']) || directory.starts_with('.') {
            continue;
        }
        let Some(state) = read_json(&root.join(&directory).join("state.json")) else {
            continue;
        };
        out.push(json!({
            "directory": directory,
            "display_name": text(&account, "displayName"),
            "email": text(&account, "emailAddress"),
            "observed_at": text(&state, "last_observed_at"),
            "five_hour": {
                "used_pct": number(&state, "last_five_pct"),
                "reset_at": text(&state, "last_five_reset_at"),
            },
            "seven_day": {
                "used_pct": number(&state, "last_seven_pct"),
                "reset_at": text(&state, "last_seven_reset_at"),
            },
        }));
    }
    json!({"installed": true, "accounts": out})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(path: &Path, value: Value) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, serde_json::to_string(&value).unwrap()).unwrap();
    }

    #[test]
    fn reports_not_installed_without_a_usage_directory() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_limits(Some(&dir.path().join("missing")));
        assert_eq!(result["installed"], false);
        assert_eq!(result["accounts"], json!([]));
        assert_eq!(read_limits(None)["installed"], false);
    }

    #[test]
    fn reads_each_account_latest_limits() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(
            &root.join("accounts.json"),
            json!({"uuid-1": {"directory": "uuid-1_me", "displayName": "Me", "emailAddress": "me@example.com"},
                   "uuid-2": {"directory": "uuid-2_none"},
                   "uuid-3": {"directory": "../escape"}}),
        );
        write(
            &root.join("uuid-1_me/state.json"),
            json!({"last_observed_at": "2026-11-22T11:00:00Z", "last_five_pct": 62, "last_seven_pct": 88.5,
                   "last_five_reset_at": "2026-11-22T13:00:00Z", "last_seven_reset_at": null}),
        );
        write(&root.join("escape/state.json"), json!({"last_five_pct": 1}));

        let result = read_limits(Some(root));
        assert_eq!(result["installed"], true);
        let accounts = result["accounts"].as_array().unwrap();
        assert_eq!(
            accounts.len(),
            1,
            "accounts without a state, or outside the root, are skipped"
        );
        let me = &accounts[0];
        assert_eq!(me["display_name"], "Me");
        assert_eq!(me["five_hour"]["used_pct"], 62);
        assert_eq!(me["five_hour"]["reset_at"], "2026-11-22T13:00:00Z");
        assert_eq!(me["seven_day"]["used_pct"], 88.5);
        assert_eq!(me["seven_day"]["reset_at"], Value::Null);
    }

    #[test]
    fn falls_back_to_the_default_directory() {
        let dir = tempfile::tempdir().unwrap();
        write(
            &dir.path().join("default/state.json"),
            json!({"last_five_pct": 5}),
        );
        let result = read_limits(Some(dir.path()));
        assert_eq!(result["accounts"][0]["directory"], "default");
        assert_eq!(result["accounts"][0]["five_hour"]["used_pct"], 5);
    }
}
