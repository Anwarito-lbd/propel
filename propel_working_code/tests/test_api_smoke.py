import os
import tempfile
from fastapi.testclient import TestClient


def test_signup_profile_pipeline_works(monkeypatch):
    with tempfile.TemporaryDirectory() as td:
        monkeypatch.setenv('PROPEL_DB', os.path.join(td, 'test.db'))
        from app.main import app, startup
        startup()
        client = TestClient(app)
        r = client.post('/api/signup', json={'email':'test@example.com','password':'secret123','name':'Test User'})
        assert r.status_code == 200
        token = r.json()['token']
        r = client.post('/api/profile', data={'token':token,'name':'Test User','field':'Software Engineering','target_location':'Canada','target_duration':'4 months'}, files={'resume':('resume.txt', b'Python React FastAPI SQL', 'text/plain')})
        assert r.status_code == 200
        r = client.get('/api/profile', params={'token':token})
        assert r.status_code == 200
        assert 'Python' in r.json()['resume_text']
