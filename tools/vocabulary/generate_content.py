import copy
import hashlib
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from content import missing_required_fields, normalize_example, validate_entry_language


PROVIDER_VARIABLES = [
    "VOCAB_GENERATION_BASE_URL",
    "VOCAB_GENERATION_API_KEY",
    "VOCAB_GENERATION_MODEL"
]


def request_hash(entry, avoid_examples=()):
    payload = entry
    if avoid_examples:
        payload = {"entry": entry, "avoidExamples": sorted(avoid_examples)}
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def set_field(entry, path, value):
    parts = path.split(".")
    target = entry
    for part in parts[:-1]:
        target = target.setdefault(part, {})
    target[parts[-1]] = copy.deepcopy(value)


def generated_value(generated, path):
    if isinstance(generated, dict) and path in generated:
        return generated[path]
    value = generated
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def validate_krdict_value(value, path):
    if isinstance(value, str):
        if not value.strip():
            raise ValueError("KRDICT field {} is blank".format(path))
    elif isinstance(value, dict):
        for key, child in value.items():
            validate_krdict_value(child, path + "." + key)
    else:
        raise ValueError("KRDICT field {} must contain strings".format(path))


def load_krdict_snapshot(path):
    allowed_fields = {
        "pronunciation", "definitionEn", "definitionKo", "definitionZh",
        "phrase", "example"
    }
    snapshot = {}
    for line_number, line in enumerate(Path(path).read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        record = json.loads(line)
        if set(record) != {"sourceKey", "fields", "source"}:
            raise ValueError("Invalid KRDICT record at line {}".format(line_number))
        source_key = record["sourceKey"]
        if source_key in snapshot:
            raise ValueError("Duplicate KRDICT sourceKey: " + source_key)
        unknown = set(record["fields"]) - allowed_fields
        if unknown:
            raise ValueError("KRDICT unknown fields: {}".format(sorted(unknown)))
        if set(record["source"]) != {"name", "sourceId", "license"}:
            raise ValueError("Invalid KRDICT source at line {}".format(line_number))
        validate_krdict_value(record["fields"], "fields")
        validate_krdict_value(record["source"], "source")
        snapshot[source_key] = record
    return snapshot


def merge_krdict(entry, snapshot):
    merged = copy.deepcopy(entry)
    record = snapshot.get(entry.get("sourceKey"))
    if record is None:
        return merged
    for key, value in record["fields"].items():
        if isinstance(value, dict):
            target = merged.setdefault(key, {})
            for child_key, child_value in value.items():
                if not target.get(child_key):
                    target[child_key] = copy.deepcopy(child_value)
        elif not merged.get(key):
            merged[key] = copy.deepcopy(value)
    sources = merged.setdefault("sources", [])
    source = copy.deepcopy(record["source"])
    if not any(
        item.get("name") == source["name"] and item.get("sourceId") == source["sourceId"]
        for item in sources
    ):
        sources.append(source)
    return merged


def enrich_entry(entry, cache_dir, avoid_examples=()):
    missing = missing_required_fields(entry)
    if not missing:
        if not validate_entry_language(entry):
            raise ValueError("Entry {} has invalid language content".format(entry.get("id")))
        return copy.deepcopy(entry)
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / (request_hash(entry, avoid_examples) + ".json")
    if cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))
    configuration = {name: os.environ.get(name, "") for name in PROVIDER_VARIABLES}
    for name in PROVIDER_VARIABLES:
        if not configuration[name]:
            raise RuntimeError("Missing required provider variable: " + name)
    avoid_prompt = ""
    if avoid_examples:
        avoid_prompt = " Do not use any sentence from this exclusion list: {}.".format(
            json.dumps(list(avoid_examples)[:25], ensure_ascii=False)
        )
    prompt = (
        "Complete this vocabulary entry for a language learner. Return only a JSON object "
        "with these missing field paths: {}. Use nested objects for phrase and example, "
        "and every requested value must be a non-empty string. Provide accurate, natural, "
        "distinct phrases and examples with Chinese translations. Preserve the learning language, do not "
        "fabricate citations, and do not copy an example from another entry.{} Existing entry: {}"
    ).format(
        ", ".join(missing), avoid_prompt, json.dumps(entry, ensure_ascii=False, sort_keys=True)
    )
    payload = {
        "model": configuration["VOCAB_GENERATION_MODEL"],
        "messages": [
            {"role": "system", "content": "You produce accurate structured vocabulary learning content."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    request = Request(
        configuration["VOCAB_GENERATION_BASE_URL"].rstrip("/") + "/chat/completions",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + configuration["VOCAB_GENERATION_API_KEY"],
            "Content-Type": "application/json",
            "User-Agent": "VocabularyLibraryBuilder/1.0"
        }
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=120) as response:
                if response.status != 200:
                    raise RuntimeError("Content provider HTTP {}".format(response.status))
                outer = json.loads(response.read().decode("utf-8"))
                generated = json.loads(outer["choices"][0]["message"]["content"])
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace").strip() or str(error.reason)
            raise RuntimeError(
                "Content provider HTTP {}: {}".format(error.code, detail[:1000])
            ) from error
        except json.JSONDecodeError as error:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise ValueError(
                "Content provider returned invalid JSON after 3 attempts: {}".format(error)
            ) from error
        enriched = copy.deepcopy(entry)
        for path in missing:
            value = generated_value(generated, path)
            if value is not None:
                set_field(enriched, path, value)
        remaining = missing_required_fields(enriched)
        if not remaining:
            if not validate_entry_language(enriched):
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise ValueError(
                    "Generated entry failed language validation after 3 attempts; "
                    "last provider payload: {}".format(
                        json.dumps(generated, ensure_ascii=False)[:800]
                    )
                )
            if normalize_example(enriched["example"]["text"]) in {
                normalize_example(text) for text in avoid_examples
            }:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                raise ValueError(
                    "Generated example duplicates an earlier entry after 3 attempts; "
                    "last provider payload: {}".format(
                        json.dumps(generated, ensure_ascii=False)[:800]
                    )
                )
            temporary = cache_path.with_suffix(".tmp")
            temporary.write_text(
                json.dumps(enriched, ensure_ascii=False, indent=2, sort_keys=True),
                encoding="utf-8"
            )
            os.replace(str(temporary), str(cache_path))
            return enriched
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise ValueError(
        "Generated entry still misses after 3 attempts: {}; last provider payload: {}".format(
            ", ".join(remaining), json.dumps(generated, ensure_ascii=False)[:800]
        )
    )


def repair_duplicate_examples(entries, cache_dir):
    completed = copy.deepcopy(entries)
    seen = {}
    repairs = 0
    for index, entry in enumerate(completed):
        normalized = normalize_example(entry["example"]["text"])
        if normalized in seen:
            avoid_examples = (seen[normalized],) + tuple(seen.values())
            entry["example"] = {"text": "", "translationZh": ""}
            entry["contentStatus"] = "incomplete"
            if "audioValidation" in entry:
                entry["audioValidation"].pop("example", None)
            entry = enrich_entry(entry, cache_dir, avoid_examples=avoid_examples)
            entry["contentStatus"] = "content-complete"
            completed[index] = entry
            normalized = normalize_example(entry["example"]["text"])
            repairs += 1
            print("Duplicate example repaired {}: {}".format(repairs, entry["id"]), flush=True)
        seen[normalized] = entry["example"]["text"]
    return completed
