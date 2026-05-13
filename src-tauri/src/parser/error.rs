use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("Erreur I/O : {0}")]
    Io(#[from] std::io::Error),

    #[error("Erreur de lecture binaire : {0}")]
    BinRw(#[from] binrw::Error),

    #[error("Magic invalide : {0}")]
    InvalidMagic(String),

    #[error("Unexpected end of file")]
    UnexpectedEof,

    #[error("String encoding error")]
    EncodingError,

    #[error("Unsupported plugin: {0}")]
    UnsupportedPlugin(String),
}
