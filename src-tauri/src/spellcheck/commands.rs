use std::collections::HashMap;
use std::io::Write as IoWrite;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use super::Spellchecker;

// ── State ─────────────────────────────────────────────────────────────────────

/// Keyed by lang code (e.g. "fr_FR"). Loaded on demand, cached for the session.
pub struct SpellState(pub Mutex<HashMap<String, Spellchecker>>);

// ── Dictionary catalog ────────────────────────────────────────────────────────

struct DictEntry {
    lang: &'static str,
    name: &'static str,
    /// Folder name inside the LibreOffice dictionaries repo
    folder: &'static str,
    /// Filename stem inside that folder (without extension)
    stem: &'static str,
}

// Base URL for raw file access to the LibreOffice dictionaries repository
const DICT_BASE: &str =
    "https://raw.githubusercontent.com/LibreOffice/dictionaries/master";

static CATALOG: &[DictEntry] = &[
    DictEntry { lang: "af_ZA", name: "Afrikaans",                folder: "af_ZA",  stem: "af_ZA"  },
    DictEntry { lang: "ar",    name: "العربية",                  folder: "ar",     stem: "ar"     },
    DictEntry { lang: "bg_BG", name: "Български",                folder: "bg_BG",  stem: "bg_BG"  },
    DictEntry { lang: "ca",    name: "Català",                   folder: "ca",     stem: "ca"     },
    DictEntry { lang: "cs_CZ", name: "Čeština",                  folder: "cs_CZ",  stem: "cs_CZ"  },
    DictEntry { lang: "da_DK", name: "Dansk",                    folder: "da_DK",  stem: "da_DK"  },
    DictEntry { lang: "de_DE", name: "Deutsch (Deutschland)",    folder: "de",     stem: "de_DE"  },
    DictEntry { lang: "de_AT", name: "Deutsch (Österreich)",     folder: "de",     stem: "de_AT"  },
    DictEntry { lang: "de_CH", name: "Deutsch (Schweiz)",        folder: "de",     stem: "de_CH"  },
    DictEntry { lang: "el_GR", name: "Ελληνικά",                 folder: "el_GR",  stem: "el_GR"  },
    DictEntry { lang: "en_US", name: "English (United States)",  folder: "en",     stem: "en_US"  },
    DictEntry { lang: "en_GB", name: "English (United Kingdom)", folder: "en",     stem: "en_GB"  },
    DictEntry { lang: "en_AU", name: "English (Australia)",      folder: "en",     stem: "en_AU"  },
    DictEntry { lang: "en_CA", name: "English (Canada)",         folder: "en",     stem: "en_CA"  },
    DictEntry { lang: "es_ES", name: "Español (España)",         folder: "es",     stem: "es_ES"  },
    DictEntry { lang: "es_MX", name: "Español (México)",         folder: "es",     stem: "es_MX"  },
    DictEntry { lang: "et_EE", name: "Eesti",                    folder: "et_EE",  stem: "et_EE"  },
    DictEntry { lang: "fa_IR", name: "فارسی",                    folder: "fa_IR",  stem: "fa_IR"  },
    DictEntry { lang: "fi_FI", name: "Suomi",                    folder: "fi_FI",  stem: "fi_FI"  },
    DictEntry { lang: "fr_FR", name: "Français (France)",        folder: "fr_FR",  stem: "fr_FR"  },
    DictEntry { lang: "fr_BE", name: "Français (Belgique)",      folder: "fr_BE",  stem: "fr_BE"  },
    DictEntry { lang: "gl",    name: "Galego",                   folder: "gl",     stem: "gl_ES"  },
    DictEntry { lang: "he_IL", name: "עברית",                    folder: "he_IL",  stem: "he_IL"  },
    DictEntry { lang: "hr_HR", name: "Hrvatski",                 folder: "hr_HR",  stem: "hr_HR"  },
    DictEntry { lang: "hu_HU", name: "Magyar",                   folder: "hu_HU",  stem: "hu_HU"  },
    DictEntry { lang: "id",    name: "Bahasa Indonesia",         folder: "id",     stem: "id_ID"  },
    DictEntry { lang: "it_IT", name: "Italiano",                 folder: "it_IT",  stem: "it_IT"  },
    DictEntry { lang: "ko_KR", name: "한국어",                    folder: "ko_KR",  stem: "ko_KR"  },
    DictEntry { lang: "lt_LT", name: "Lietuvių",                 folder: "lt_LT",  stem: "lt_LT"  },
    DictEntry { lang: "lv_LV", name: "Latviešu",                 folder: "lv_LV",  stem: "lv_LV"  },
    DictEntry { lang: "nb_NO", name: "Norsk Bokmål",             folder: "no",     stem: "nb_NO"  },
    DictEntry { lang: "nl_NL", name: "Nederlands",               folder: "nl_NL",  stem: "nl_NL"  },
    DictEntry { lang: "pl_PL", name: "Polski",                   folder: "pl_PL",  stem: "pl_PL"  },
    DictEntry { lang: "pt_BR", name: "Português (Brasil)",       folder: "pt_BR",  stem: "pt_BR"  },
    DictEntry { lang: "pt_PT", name: "Português (Portugal)",     folder: "pt_PT",  stem: "pt_PT"  },
    DictEntry { lang: "ro_RO", name: "Română",                   folder: "ro",     stem: "ro_RO"  },
    DictEntry { lang: "ru_RU", name: "Русский",                  folder: "ru_RU",  stem: "ru_RU"  },
    DictEntry { lang: "sk_SK", name: "Slovenčina",               folder: "sk_SK",  stem: "sk_SK"  },
    DictEntry { lang: "sl_SI", name: "Slovenščina",              folder: "sl_SI",  stem: "sl_SI"  },
    DictEntry { lang: "sq_AL", name: "Shqip",                    folder: "sq_AL",  stem: "sq_AL"  },
    DictEntry { lang: "sr",    name: "Српски",                   folder: "sr",     stem: "sr"     },
    DictEntry { lang: "sv_SE", name: "Svenska",                  folder: "sv_SE",  stem: "sv_SE"  },
    DictEntry { lang: "tr_TR", name: "Türkçe",                   folder: "tr_TR",  stem: "tr_TR"  },
    DictEntry { lang: "uk_UA", name: "Українська",               folder: "uk_UA",  stem: "uk_UA"  },
    DictEntry { lang: "vi",    name: "Tiếng Việt",               folder: "vi",     stem: "vi_VN"  },
    DictEntry { lang: "zh_CN", name: "中文 (简体)",               folder: "zh_CN",  stem: "zh_CN"  },
    DictEntry { lang: "zh_TW", name: "中文 (繁體)",               folder: "zh_TW",  stem: "zh_TW"  },
];

// ── Helper: dictionary storage directory ──────────────────────────────────────

fn dict_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {e}"))?
        .join("dictionaries");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create dictionaries dir: {e}"))?;
    Ok(dir)
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct DictionaryInfo {
    pub lang: String,
    pub name: String,
    pub installed: bool,
}

#[derive(Serialize)]
pub struct SpellError {
    pub word: String,
    pub char_start: usize,
    pub char_len: usize,
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

/// Extract (word, char_start) from a game-translation string.
/// Skips: XML/tag markup `<…>`, ALL-CAPS tokens, tokens containing digits,
/// tokens shorter than 2 chars, and `%`-format codes like `%d`/`%s`.
fn tokenize(text: &str) -> Vec<(String, usize)> {
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut tokens = Vec::new();
    let mut i = 0;

    while i < len {
        // Skip XML-style tags
        if chars[i] == '<' {
            while i < len && chars[i] != '>' {
                i += 1;
            }
            if i < len {
                i += 1;
            }
            continue;
        }

        // Skip % format codes (e.g. %d, %s, %1, %0, %%)
        if chars[i] == '%' {
            i += 1;
            while i < len && (chars[i].is_alphanumeric() || chars[i] == '%') {
                i += 1;
            }
            continue;
        }

        // Start of a word (letters and apostrophes)
        if chars[i].is_alphabetic() {
            let start = i;
            while i < len && (chars[i].is_alphabetic() || chars[i] == '\'') {
                i += 1;
            }
            // Strip leading/trailing apostrophes
            let mut word_chars: Vec<char> = chars[start..i].to_vec();
            while word_chars.first() == Some(&'\'') { word_chars.remove(0); }
            while word_chars.last()  == Some(&'\'') { word_chars.pop(); }

            let word: String = word_chars.iter().collect();
            if word.len() < 2 { continue; }
            // Skip ALL-CAPS (abbreviations / game tokens)
            if word.chars().all(|c| c.is_uppercase()) { continue; }

            tokens.push((word, start));
        } else {
            i += 1;
        }
    }

    tokens
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// List all known dictionaries with their install status.
#[tauri::command]
pub async fn list_dictionaries_cmd(app: AppHandle) -> Result<Vec<DictionaryInfo>, String> {
    let dir = dict_dir(&app)?;
    let infos = CATALOG
        .iter()
        .map(|e| DictionaryInfo {
            lang: e.lang.to_string(),
            name: e.name.to_string(),
            installed: dir.join(format!("{}.aff", e.stem)).exists()
                && dir.join(format!("{}.dic", e.stem)).exists(),
        })
        .collect();
    Ok(infos)
}

/// Download and install a dictionary (.aff + .dic) from the LibreOffice repo.
#[tauri::command]
pub async fn download_dictionary_cmd(app: AppHandle, lang: String) -> Result<(), String> {
    let entry = CATALOG
        .iter()
        .find(|e| e.lang == lang)
        .ok_or_else(|| format!("Unknown language: {lang}"))?;

    let dir = dict_dir(&app)?;
    let client = reqwest::Client::new();

    for ext in &["aff", "dic"] {
        let url = format!("{DICT_BASE}/{}/{}.{ext}", entry.folder, entry.stem);
        let bytes = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Download error for {url}: {e}"))?
            .error_for_status()
            .map_err(|e| format!("HTTP error for {url}: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("Read error for {url}: {e}"))?;

        let dest = dir.join(format!("{}.{ext}", entry.stem));
        let mut f = std::fs::File::create(&dest)
            .map_err(|e| format!("Cannot create {}: {e}", dest.display()))?;
        f.write_all(&bytes)
            .map_err(|e| format!("Cannot write {}: {e}", dest.display()))?;
    }

    Ok(())
}

/// Delete an installed dictionary (and evict it from the in-memory cache).
#[tauri::command]
pub async fn delete_dictionary_cmd(
    app: AppHandle,
    lang: String,
    state: State<'_, SpellState>,
) -> Result<(), String> {
    let entry = CATALOG
        .iter()
        .find(|e| e.lang == lang)
        .ok_or_else(|| format!("Unknown language: {lang}"))?;

    let dir = dict_dir(&app)?;
    for ext in &["aff", "dic"] {
        let path = dir.join(format!("{}.{ext}", entry.stem));
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Cannot delete {}: {e}", path.display()))?;
        }
    }

    // Evict from cache so a re-download takes effect immediately
    state.0.lock().unwrap().remove(&lang);

    Ok(())
}

/// Spell-check `text` with the given dictionary.
/// Returns the list of misspelled word positions (char-based).
#[tauri::command]
pub async fn spellcheck_cmd(
    app: AppHandle,
    lang: String,
    text: String,
    state: State<'_, SpellState>,
) -> Result<Vec<SpellError>, String> {
    // Load dictionary if not yet cached
    {
        let mut map = state.0.lock().unwrap();
        if !map.contains_key(&lang) {
            let entry = CATALOG
                .iter()
                .find(|e| e.lang == lang)
                .ok_or_else(|| format!("Unknown language: {lang}"))?;
            let dir = dict_dir(&app)?;
            let aff = dir.join(format!("{}.aff", entry.stem));
            if !aff.exists() {
                return Err(format!("Dictionary {lang} is not installed"));
            }
            let checker = Spellchecker::load(&aff)?;
            map.insert(lang.clone(), checker);
        }
    }

    let map = state.0.lock().unwrap();
    let checker = map.get(&lang).unwrap();

    let mut errors = Vec::new();
    for (word, char_start) in tokenize(&text) {
        if !checker.spell(&word) {
            errors.push(SpellError {
                char_len: word.chars().count(),
                word,
                char_start,
            });
        }
    }

    Ok(errors)
}

/// Return spelling suggestions for a single word.
#[tauri::command]
pub async fn get_suggestions_cmd(
    app: AppHandle,
    lang: String,
    word: String,
    state: State<'_, SpellState>,
) -> Result<Vec<String>, String> {
    {
        let mut map = state.0.lock().unwrap();
        if !map.contains_key(&lang) {
            let entry = CATALOG
                .iter()
                .find(|e| e.lang == lang)
                .ok_or_else(|| format!("Unknown language: {lang}"))?;
            let dir = dict_dir(&app)?;
            let aff = dir.join(format!("{}.aff", entry.stem));
            if !aff.exists() {
                return Err(format!("Dictionary {lang} is not installed"));
            }
            let checker = Spellchecker::load(&aff)?;
            map.insert(lang.clone(), checker);
        }
    }

    let map = state.0.lock().unwrap();
    let checker = map.get(&lang).unwrap();
    Ok(checker.suggest(&word))
}
