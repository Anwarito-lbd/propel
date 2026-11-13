from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class Job:
    id: str
    title: str
    company: str
    location: str
    source: str
    url: str
    apply_url: str
    posted_at: str
    description: str
    job_type: str = "unknown"
    duration: str = ""
    score: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

@dataclass
class UserProfile:
    email: str
    name: str = ""
    field: str = ""
    target_location: str = ""
    target_duration: str = ""
    resume_text: str = ""

@dataclass
class Application:
    id: int
    email: str
    job_id: str
    title: str
    company: str
    url: str
    status: str
    note: str = ""
