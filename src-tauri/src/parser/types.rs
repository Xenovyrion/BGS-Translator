use crate::parser::strings_file::StringFileKind::{self, DlStrings, IlStrings, Strings};

/// For each record type, list exactly which subrecords contain
/// translatable text and which .strings file they point to, if localized.
pub fn translatable_subrecords(record_type: &[u8; 4]) -> &'static [(&'static [u8; 4], StringFileKind)] {
    match record_type {

        // ── Activator ────────────────────────────────────────────────────────
        b"ACTI" => &[
            (b"FULL", Strings),
            (b"ATTX", Strings), // activation prompt text
        ],

        // ── Alchemy / Consumables ────────────────────────────────────────────
        b"ALCH" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
            (b"DNAM", DlStrings), // addiction name
        ],

        // ── Ammunition ─────────────────────────────────────────────────────────
        b"AMMO" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
            (b"ONAM", Strings), // short name
        ],

        // ── Armor ────────────────────────────────────────────────────────────
        b"ARMO" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Poster / artwork ─────────────────────────────────────────────────
        b"AVIF" => &[
            (b"FULL", Strings),
            (b"ANAM", Strings), // artist name
        ],

        // ── Biome ─────────────────────────────────────────────────────────────
        b"BIOM" => &[
            (b"FULL", Strings),
        ],

        // ── Book ─────────────────────────────────────────────────────────────
        b"BOOK" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),   // book contents
            (b"CNAM", DlStrings),   // author
        ],

        // ── Interior cell ────────────────────────────────────────────────
        b"CELL" => &[
            (b"FULL", Strings),
        ],

        // ── Challenge / Achievement ────────────────────────────────────────────────
        b"CHAL" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Character class ──────────────────────────────────────────────
        b"CLAS" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Building lot ────────────────────────────────────────────────
        b"COBJ" => &[
            (b"DESC", DlStrings),
        ],

        // ── Container ─────────────────────────────────────────────────────────
        b"CONT" => &[
            (b"FULL", Strings),
        ],

        // ── Discussion topic ─────────────────────────────────────────────────
        b"DIAL" => &[
            (b"FULL", Strings),
        ],

        // ── Type of damage ───────────────────────────────────────────────────
        b"DMGT" => &[
            (b"FULL", Strings),
        ],

        // ──  ─────────────────────────────────────────────────────────────
        b"DOOR" => &[
            (b"FULL", Strings),
        ],

        // ── Enchantment ──────────────────────────────────────────────────────
        b"ENCH" => &[
            (b"FULL", Strings),
        ],

        // ── Explosion ─────────────────────────────────────────────────────────
        b"EXPL" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Faction ───────────────────────────────────────────────────────────
        b"FACT" => &[
            (b"FULL", Strings),
            (b"RNAM", Strings), // rank names
        ],

        // ── Flora ─────────────────────────────────────────────────────────────
        b"FLOR" => &[
            (b"FULL", Strings),
            (b"ATTX", Strings),
        ],

        // ── List of shapes ───────────────────────────────────────────────────
        b"FLST" => &[
            (b"FULL", Strings),
        ],

        // ── Furniture ────────────────────────────────────────────────────────────
        b"FURN" => &[
            (b"FULL", Strings),
            (b"ATTX", Strings),
        ],

        // ── Particle effect ───────────────────────────────────────────────
        b"FXPD" => &[
            (b"FULL", Strings),
        ],

        // ── Ship (Starfield) ──────────────────────────────────────────────
        b"GBFM" => &[
            (b"FULL", Strings),
            (b"HULL", Strings),
        ],

        // ── Game parameter (string only) ──────────────────────────────
        // GMST with DATA = string if EDID starts with ‘s’ — filtered in plugin.rs
        b"GMST" => &[
            (b"DATA", Strings),
        ],

        // ── Offer / Planet Trait (Starfield) ──────────────────────────────────
        b"GPOF" => &[
            (b"NNAM", DlStrings),
            (b"DNAM", DlStrings),
            (b"VOVS", Strings),
            (b"RESN", Strings),
        ],

        // ── Set of features ──────────────────────────────────────────────────
        b"GPOG" => &[
            (b"NNAM", DlStrings),
        ],

        // ── Danger zone ───────────────────────────────────────────────────
        b"HAZD" => &[
            (b"FULL", Strings),
        ],

        // ── Body part ───────────────────────────────────────────────────
        b"HDPT" => &[
            (b"FULL", Strings),
        ],

        // ── Idle animation ────────────────────────────────────────────────────
        b"IDLE" => &[
            (b"FULL", Strings),
        ],

        // ── Dialog response ───────────────────────────────────────────────
        b"INFO" => &[
            (b"NAM1", IlStrings), // response text (with audio sync)
            (b"RNAM", DlStrings), // reply
        ],

        // ── Naming instance ───────────────────────────────────────────────────
        b"INNR" => &[
            (b"WNAM", Strings),
        ],

        // ── Resource (Starfield) ─────────────────────────────────────────────
        b"IRES" => &[
            (b"FULL", Strings),
            (b"NNAM", DlStrings),
        ],

        // ── Key ───────────────────────────────────────────────────────────────
        b"KEYM" => &[
            (b"FULL", Strings),
        ],

        // ── Keyword ───────────────────────────────────────────────────────────
        b"KYWD" => &[
            (b"FULL", Strings),
        ],

        // ── Location ──────────────────────────────────────────────────────────
        b"LCTN" => &[
            (b"FULL", Strings),
        ],

        // ── Loading screen ────────────────────────────────────────────────
        b"LSCR" => &[
            (b"DESC", DlStrings),
        ],

        // ── List of levels (objects) ─────────────────────────────────────────
        b"LVLI" => &[
            (b"ONAM", Strings),
        ],

        // ── List of Levels (NPCs) ────────────────────────────────────────────
        b"LVLN" => &[
            (b"ONAM", Strings),
        ],

        // ── Message ───────────────────────────────────────────────────────────
        b"MESG" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
            (b"ITXT", DlStrings), // button text
            (b"NNAM", DlStrings), // message title
        ],

        // ── Magical effect ─────────────────────────────────────────────────────
        b"MGEF" => &[
            (b"FULL", Strings),
            (b"DNAM", DlStrings),
        ],

        // ── Miscellaneous ──────────────────────────────────────────────────────
        b"MISC" => &[
            (b"FULL", Strings),
            (b"NNAM", DlStrings),
        ],

        // ── Animated static object ──────────────────────────────────────────────
        b"MSTT" => &[
            (b"FULL", Strings),
        ],

        // ── PNJ ───────────────────────────────────────────────────────────────
        b"NPC_" => &[
            (b"FULL", Strings),
            (b"SHRT", Strings),
        ],

        // ── Object Modification ──────────────────────────────────────────────
        b"OMOD" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Perk ─────────────────────────────────────────────────────────────
        b"PERK" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
            (b"EPF2", DlStrings), // description de l'effet de perk
        ],

        // ── Ship (hull) ──────────────────────────────────────────────────
        b"PKIN" => &[
            (b"FULL", Strings),
        ],

        // ── Planet map marker ─────────────────────────────────────────────────
        b"PMFT" => &[
            (b"FULL", Strings),
        ],

        // ── Planet (Starfield) ───────────────────────────────────────────────
        b"PNDT" => &[
            (b"FULL", Strings),
        ],

        // ── Projectile ────────────────────────────────────────────────────────
        b"PROJ" => &[
            (b"FULL", Strings),
        ],

        // ── Quest ─────────────────────────────────────────────────────────────
        b"QUST" => &[
            (b"FULL", Strings),    // quest name
            (b"CNAM", DlStrings),  // log entries
            (b"NNAM", DlStrings),  // name of the next objective
            (b"QMSU", Strings),    // marker display string
            (b"QMDT", DlStrings),  // marker description
            (b"QMDP", DlStrings),  // marker popup
            (b"QMDS", DlStrings),  // marker short description
        ],

        // ── Race ──────────────────────────────────────────────────────────────
        b"RACE" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
            (b"FMRN", Strings),    // female morph name
            (b"SNAM", Strings),    // skin name
            (b"FDSL", DlStrings),  // feather display string
        ],

        // ── Cross-reference ──────────────────────────────────────────────────
        b"REFR" => &[
            (b"UNAM", Strings),
        ],

        // ── Scripted response ────────────────────────────────────────────────
        b"RSPJ" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Scene ─────────────────────────────────────────────────────────────
        b"SCEN" => &[
            (b"FULL", Strings),
        ],

        // ── Spell ───────────────────────────────────────────────────
        b"SPEL" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Static object ────────────────────────────────────────────────────
        b"STAT" => &[
            (b"FULL", Strings),
        ],

        // ── Star (Starfield) ────────────────────────────────────────────────
        b"STDT" => &[
            (b"FULL", Strings),
        ],

        // ── Terminal ──────────────────────────────────────────────────────────
        b"TERM" => &[
            (b"FULL", Strings),
            (b"DNAM", DlStrings),  // folder title
            (b"TNAM", Strings),    // entry title
            (b"NAM1", DlStrings),  // entry body
            (b"INAM", Strings),    // response text
        ],

        // ── Terminal Menu (Starfield) ─────────────────────────────────────────
        b"TMLM" => &[
            (b"FULL", Strings),
            (b"BTXT", DlStrings),  // body text
            (b"ITXT", DlStrings),  // item text
            (b"UNAM", Strings),    // user name
            (b"INAM", Strings),    // item name
            (b"ISTX", Strings),    // item short text
        ],

        // ── Water ───────────────────────────────────────────────────────────────
        b"WATR" => &[
            (b"FULL", Strings),
        ],

        // ── Weapon ──────────────────────────────────────────────────────────────
        b"WEAP" => &[
            (b"FULL", Strings),
            (b"DESC", DlStrings),
        ],

        // ── Outside world ───────────────────────────────────────────────────
        b"WRLD" => &[
            (b"FULL", Strings),
        ],

        _ => &[],
    }
}

/// Returns true if this record type can contain translatable strings.
pub fn is_translatable_record(rec_type: &[u8; 4]) -> bool {
    !translatable_subrecords(rec_type).is_empty()
}