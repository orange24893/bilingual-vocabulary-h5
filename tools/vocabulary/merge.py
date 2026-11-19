import copy

from normalize import normalize_text, stable_id


SOURCE_ORDER = {"topik-standard": 0, "ecdict": 0, "awl": 1}


def match_legacy(rule, candidates):
    matches = [
        record for record in candidates
        if record.language == rule["language"]
        and record.normalized_text == rule["normalizedText"]
        and (
            rule["language"] != "ko"
            or normalize_text(record.fields.get("phrase", {}).get("text", ""), "ko")
            == normalize_text(rule["matchPhrase"], "ko")
        )
    ]
    if not matches:
        return None
    if len(matches) > 1:
        details = [
            {"sourceKey": record.source_key, "phrase": record.fields.get("phrase", {})}
            for record in candidates
            if record.language == rule["language"]
            and record.normalized_text == rule["normalizedText"]
        ]
        raise ValueError(
            "Legacy rule {} matched {} candidates: {!r}".format(
                rule["id"], len(matches), details
            )
        )
    return matches[0]


def fill_missing(target, source):
    for key, value in source.items():
        if key not in target or target[key] in (None, "", [], {}):
            target[key] = copy.deepcopy(value)
        elif isinstance(value, dict) and isinstance(target[key], dict):
            fill_missing(target[key], value)


def source_sort_key(record):
    return (
        SOURCE_ORDER.get(record.primary_source, 10),
        record.primary_source,
        record.source_key,
        record.sense_id
    )


def merge_group(records):
    ordered = sorted(records, key=source_sort_key)
    base = copy.deepcopy(ordered[0])
    for record in ordered[1:]:
        fill_missing(base.fields, record.fields)
        if record.level is not None:
            base.level = record.level if base.level is None else min(base.level, record.level)
        base.advanced = base.advanced or record.advanced
        base.priority = min(base.priority, record.priority)
    unique_sources = {
        (source.name, source.source_id): source
        for record in ordered for source in record.sources
    }
    sense_id = base.sense_id if base.language == "ko" else ""
    entry = {
        "id": stable_id(base.language, base.normalized_text, base.primary_source, sense_id),
        "language": base.language,
        "text": base.text,
        "normalizedText": base.normalized_text,
        "primarySource": base.primary_source,
        "sourceKey": base.source_key,
        "senseId": sense_id,
        "level": base.level,
        "advanced": base.advanced,
        "priority": base.priority,
        "sources": [
            {"name": source.name, "sourceId": source.source_id, "license": source.license}
            for source in sorted(
                unique_sources.values(), key=lambda item: (item.name, item.source_id)
            )
        ]
    }
    entry.update(base.fields)
    return entry


def merge_records(records, legacy):
    remaining = list(records)
    for rule in legacy:
        matched = match_legacy(rule, remaining)
        if matched is not None:
            remaining = [record for record in remaining if record is not matched]
    groups = {}
    for record in remaining:
        sense_id = record.sense_id if record.language == "ko" else ""
        key = (record.language, record.normalized_text, sense_id)
        groups.setdefault(key, []).append(record)
    return [merge_group(groups[key]) for key in sorted(groups)]
