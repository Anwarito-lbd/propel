"""Crawl4AI bridge for Propel.

Only public pages are visited. The service does not log in, evade CAPTCHAs or
bypass robots.txt. In production, place it behind authentication and rate limits.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import UTC, datetime
from html import unescape
from typing import Any
from urllib.parse import quote_plus, unquote, urlparse, parse_qs
from urllib.robotparser import RobotFileParser
from urllib.request import Request, urlopen

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="Propel Crawl4AI Job Service", version="1.0.0")
USER_AGENT = "Propel/1.0 (public-job-research)"
ATS_DOMAINS = ("boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "myworkdayjobs.com")


class SearchRequest(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    country: str = "Canada"
    max_results: int = Field(default=40, ge=1, le=100)


def allowed_by_robots(url: str) -> bool:
    parsed = urlparse(url)
    robot_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    try:
        req = Request(robot_url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=8) as response:  # nosec: constrained robots URL
            lines = response.read().decode("utf-8", errors="replace").splitlines()
        parser = RobotFileParser(); parser.parse(lines)
        return parser.can_fetch(USER_AGENT, url)
    except OSError:
        return True


def json_values(value: Any):
    if isinstance(value, list):
        for item in value: yield from json_values(item)
    elif isinstance(value, dict):
        yield value
        if value.get("@graph"): yield from json_values(value["@graph"])


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", unescape(str(value or "")))).strip()


def parse_jobs(html: str, page_url: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for raw in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, flags=re.I | re.S):
        try: payload = json.loads(raw)
        except json.JSONDecodeError: continue
        for item in json_values(payload):
            types = item.get("@type", [])
            if "JobPosting" not in ([types] if isinstance(types, str) else types): continue
            locations = item.get("jobLocation", []); locations = locations if isinstance(locations, list) else [locations]
            place = []
            for location in locations:
                address = location.get("address", {}) if isinstance(location, dict) else {}
                place.extend(str(address.get(key, "")) for key in ("addressLocality", "addressRegion", "addressCountry"))
            org = item.get("hiringOrganization", {})
            jobs.append({
                "title": clean(item.get("title")), "company": clean(org.get("name") if isinstance(org, dict) else org),
                "location": ", ".join(filter(None, place)), "employment_type": clean(item.get("employmentType")),
                "date_posted": clean(item.get("datePosted")), "description": clean(item.get("description"))[:6000],
                "url": page_url, "application_url": clean(item.get("url")) or page_url,
                "discovered_at": datetime.now(UTC).isoformat(),
            })
    return jobs


def unwrap_ddg(url: str) -> str:
    parsed = urlparse(url)
    if parsed.netloc.endswith("duckduckgo.com"):
        target = parse_qs(parsed.query).get("uddg", [None])[0]
        return unquote(target) if target else url
    return url


@app.get("/health")
async def health(): return {"ok": True, "engine": "crawl4ai"}


@app.post("/jobs/search")
async def search(payload: SearchRequest):
    browser = BrowserConfig(headless=True, user_agent=USER_AGENT)
    run = CrawlerRunConfig(cache_mode=CacheMode.ENABLED, page_timeout=25_000)
    urls: list[str] = []
    async with AsyncWebCrawler(config=browser) as crawler:
        for domain in ATS_DOMAINS:
            query = quote_plus(f'"{payload.title}" "{payload.country}" site:{domain}')
            result = await crawler.arun(url=f"https://html.duckduckgo.com/html/?q={query}", config=run)
            if not result.success: continue
            for href in re.findall(r'class="result__a"[^>]+href="([^"]+)"', result.html):
                target = unwrap_ddg(unescape(href))
                if urlparse(target).netloc.endswith(domain) and target not in urls: urls.append(target)
            if len(urls) >= payload.max_results: break

        semaphore = asyncio.Semaphore(4)
        async def visit(url: str):
            if not await asyncio.to_thread(allowed_by_robots, url): return []
            async with semaphore:
                result = await crawler.arun(url=url, config=run)
                return parse_jobs(result.html, url) if result.success else []
        groups = await asyncio.gather(*(visit(url) for url in urls[:payload.max_results]))

    jobs = [job for group in groups for job in group]
    canadian = [job for job in jobs if re.search(r"canada|\bca\b|ontario|quebec|alberta|british columbia|ottawa|toronto|montreal|vancouver|waterloo", f"{job['location']} {job['description']}", re.I)]
    return {"jobs": canadian[:payload.max_results], "discovered_urls": len(urls), "engine": "crawl4ai"}
