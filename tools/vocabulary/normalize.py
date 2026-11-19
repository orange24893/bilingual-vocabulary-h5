import hashlib
import unicodedata


def normalize_text(text, language):
    value = unicodedata.normalize("NFC", " ".join(text.strip().split()))
    return value.casefold() if language == "en" else value


def stable_id(language, normalized, primary_source, sense_id=""):
    identity = "\0".join((language, normalized, primary_source, sense_id))
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]
    return "builtin-{}-{}".format(language, digest)


def content_hash(text):
    normalized = unicodedata.normalize("NFC", text.strip())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def audio_stem(entry_id, kind, spoken_text):
    if kind not in {"word", "phrase", "example"}:
        raise ValueError("Unsupported audio kind: {}".format(kind))
    return "{}.{}.{}".format(entry_id, kind, content_hash(spoken_text))
