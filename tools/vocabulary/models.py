from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class SourceRef:
    name: str
    source_id: str
    license: str


@dataclass
class SourceRecord:
    language: str
    text: str
    normalized_text: str
    primary_source: str
    source_key: str
    sense_id: str = ""
    level: Optional[int] = None
    advanced: bool = False
    priority: int = 999999999
    fields: dict = field(default_factory=dict)
    sources: list = field(default_factory=list)
