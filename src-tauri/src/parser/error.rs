use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Binary read error: {0}")]
    BinRw(#[from] binrw::Error),

    #[error("Invalid magic bytes: {0}")]
    InvalidMagic(String),

    #[error("Unexpected end of file")]
    UnexpectedEof,

    #[error("String encoding error")]
    EncodingError,

    #[error("Unsupported plugin: {0}")]
    UnsupportedPlugin(String),
}
