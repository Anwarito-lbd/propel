# Crawl4AI service

This sidecar is the deep-crawl source for Propel. It discovers public ATS postings, checks `robots.txt`, renders JavaScript pages with Crawl4AI and extracts `schema.org/JobPosting` records.

```bash
docker build -t propel-crawl4ai services/crawl4ai
docker run --rm -p 8080:8080 propel-crawl4ai
```

Set the web app runtime variable `CRAWL4AI_API_URL` to the reachable service URL. When it is absent or temporarily unavailable, the web app continues with Career-Ops' zero-token public Greenhouse, Lever and Ashby providers.

The service never logs in, bypasses CAPTCHAs or submits applications.
