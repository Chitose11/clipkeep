//! Join several text clips into one paste.
//!
//! Order is whatever the caller supplies (the panel sends multi-select ids in
//! selection order). A newline is the only separator the product uses; the
//! function still takes one so tests can show it is applied and not hard-wired
//! into the join. Any non-text row rejects the whole merge: image paths are
//! neither concatenated nor silently dropped.

use crate::db::KIND_TEXT;

/// Separator between clips. There is no settings control for this.
pub const SEPARATOR: &str = "\n";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MergeError {
    /// No clip was selected.
    Empty,
    /// A selected id is no longer in the database.
    Missing,
    /// At least one selected clip is not plain text.
    NotText,
}

impl MergeError {
    pub fn message(self) -> &'static str {
        match self {
            Self::Empty => "没有选中条目",
            Self::Missing => "有选中条目已不存在，请重新选择",
            Self::NotText => "选中内容包含图片，合并粘贴只支持文本",
        }
    }
}

/// Join `rows` with `separator`.
///
/// Each row is `(kind, content)` in paste order, or `None` when that id is gone.
/// An image (or any non-text kind) is reported even if another row is missing,
/// so a mixed selection never pastes a text subset.
pub fn merge_loaded<'a>(
    rows: impl IntoIterator<Item = Option<(&'a str, &'a str)>>,
    separator: &str,
) -> Result<String, MergeError> {
    let rows: Vec<_> = rows.into_iter().collect();
    if rows.is_empty() {
        return Err(MergeError::Empty);
    }
    if rows.iter().flatten().any(|(kind, _)| *kind != KIND_TEXT) {
        return Err(MergeError::NotText);
    }
    if rows.iter().any(Option::is_none) {
        return Err(MergeError::Missing);
    }
    Ok(rows
        .into_iter()
        .flatten()
        .map(|(_, content)| content)
        .collect::<Vec<_>>()
        .join(separator))
}

#[cfg(test)]
mod tests {
    use super::{MergeError, SEPARATOR, merge_loaded};
    use crate::db::{KIND_IMAGE, KIND_TEXT};

    #[test]
    fn separator_defaults_to_newline_and_is_applied_between_items() {
        assert_eq!(SEPARATOR, "\n");
        let merged = merge_loaded(
            [
                Some((KIND_TEXT, "甲")),
                Some((KIND_TEXT, "乙")),
                Some((KIND_TEXT, "丙")),
            ],
            SEPARATOR,
        )
        .unwrap();
        assert_eq!(merged, "甲\n乙\n丙");
        assert!(!merged.ends_with('\n'));
        assert_eq!(
            merge_loaded([Some((KIND_TEXT, "甲")), Some((KIND_TEXT, "乙"))], " | ").unwrap(),
            "甲 | 乙"
        );
    }

    #[test]
    fn order_follows_the_caller_and_does_not_sort() {
        let merged = merge_loaded(
            [
                Some((KIND_TEXT, "第三")),
                Some((KIND_TEXT, "第一")),
                Some((KIND_TEXT, "第二")),
            ],
            SEPARATOR,
        )
        .unwrap();
        assert_eq!(merged, "第三\n第一\n第二");
    }

    #[test]
    fn a_single_text_clip_is_pasted_without_an_extra_separator() {
        assert_eq!(
            merge_loaded([Some((KIND_TEXT, "仅一条"))], SEPARATOR).unwrap(),
            "仅一条"
        );
    }

    #[test]
    fn empty_selection_is_rejected() {
        assert_eq!(merge_loaded([], SEPARATOR), Err(MergeError::Empty));
        assert_eq!(MergeError::Empty.message(), "没有选中条目");
    }

    #[test]
    fn mixed_or_image_selection_is_rejected_without_joining() {
        let mixed = merge_loaded(
            [
                Some((KIND_TEXT, "姓名")),
                Some((KIND_IMAGE, "secret-image.png")),
                Some((KIND_TEXT, "电话")),
            ],
            SEPARATOR,
        );
        assert_eq!(mixed, Err(MergeError::NotText));
        assert_eq!(
            merge_loaded(
                [Some((KIND_IMAGE, "a.png")), Some((KIND_IMAGE, "b.png"))],
                SEPARATOR,
            ),
            Err(MergeError::NotText)
        );
        assert_eq!(
            MergeError::NotText.message(),
            "选中内容包含图片，合并粘贴只支持文本"
        );
    }

    #[test]
    fn a_missing_row_is_rejected_and_an_image_is_reported_first() {
        assert_eq!(
            merge_loaded([Some((KIND_TEXT, "甲")), None], SEPARATOR),
            Err(MergeError::Missing)
        );
        assert_eq!(
            merge_loaded([Some((KIND_IMAGE, "a.png")), None], SEPARATOR),
            Err(MergeError::NotText)
        );
        assert_eq!(
            MergeError::Missing.message(),
            "有选中条目已不存在，请重新选择"
        );
    }

    #[test]
    fn blank_and_multiline_text_is_kept_verbatim() {
        assert_eq!(
            merge_loaded(
                [
                    Some((KIND_TEXT, " a ")),
                    Some((KIND_TEXT, "")),
                    Some((KIND_TEXT, "b\n"))
                ],
                SEPARATOR,
            )
            .unwrap(),
            " a \n\nb\n"
        );
    }
}
