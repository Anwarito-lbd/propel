import io
import os
import tempfile
from docx import Document
from fastapi.testclient import TestClient

from app.main import app, startup


def _docx_bytes(text: str) -> bytes:
    doc = Document()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_signup_login_profile_and_full_pipeline_works(monkeypatch):
    with tempfile.TemporaryDirectory() as td:
        monkeypatch.setenv('PROPEL_DB', os.path.join(td, 'test.db'))
        startup()
        client = TestClient(app)

        # Signup & login
        r = client.post('/api/signup', json={'email': 'test@example.com', 'password': 'secret123', 'name': 'Test User'})
        assert r.status_code == 200
        token = r.json()['token']

        bad_login = client.post('/api/login', json={'email': 'test@example.com', 'password': 'wrong'})
        assert bad_login.status_code == 401

        login = client.post('/api/login', json={'email': 'test@example.com', 'password': 'secret123'})
        assert login.status_code == 200
        token = login.json()['token']

        # Reject unsupported extension
        bad_resume = client.post(
            '/api/profile',
            data={'token': token, 'name': 'Test User'},
            files={'resume': ('resume.exe', b'MZ', 'application/octet-stream')},
        )
        assert bad_resume.status_code == 400

        # Upload DOCX resume
        docx_payload = _docx_bytes('Python React FastAPI SQL software engineering co-op at uOttawa')
        r = client.post(
            '/api/profile',
            data={
                'token': token,
                'name': 'Test User',
                'field': 'Software Engineering',
                'target_location': 'Canada',
                'target_duration': '4 months',
            },
            files={'resume': ('resume.docx', docx_payload, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')},
        )
        assert r.status_code == 200
        r = client.get('/api/profile', params={'token': token})
        assert r.status_code == 200
        assert 'FastAPI' in r.json()['resume_text']

        # Mock live providers: Remotive returns 1 job, Arbeitnow raises an error (transparently surfaced)
        from app.models import Job
        from app.services import jobs as jobs_service

        async def fake_remotive(_query=''):
            return [
                Job(
                    id='remotive-1',
                    title='Software Engineering Intern',
                    company='MapleTech',
                    location='Ottawa, Canada',
                    source='Remotive public API',
                    url='https://remotive.com/remote-jobs/software-dev/intern-1',
                    apply_url='https://remotive.com/remote-jobs/software-dev/intern-1',
                    posted_at='2026-11-10',
                    description='Build Python FastAPI React APIs for 4 months.',
                )
            ]

        async def failing_arbeitnow():
            raise RuntimeError('upstream timeout')

        monkeypatch.setattr(jobs_service, 'fetch_remotive', fake_remotive)
        monkeypatch.setattr(jobs_service, 'fetch_arbeitnow', failing_arbeitnow)

        search_res = client.post('/api/jobs/search', json={'token': token, 'query': 'Software Engineering', 'location': 'Canada'})
        assert search_res.status_code == 200
        body = search_res.json()
        assert len(body['jobs']) == 1
        assert body['jobs'][0]['id'] == 'remotive-1'
        assert any('Arbeitnow' in err for err in body['provider_errors'])

        # Save job, inspect applications, update status, reject Auto-applied
        save_res = client.post('/api/jobs/save', json={'token': token, 'job_id': 'remotive-1', 'status': 'saved'})
        assert save_res.status_code == 200

        apps_res = client.get('/api/applications', params={'token': token})
        assert apps_res.status_code == 200
        apps = apps_res.json()['applications']
        assert len(apps) == 1
        app_id = apps[0]['id']

        bad_status = client.post('/api/applications/status', json={'token': token, 'application_id': app_id, 'status': 'Auto-applied'})
        assert bad_status.status_code == 400

        ok_status = client.post('/api/applications/status', json={'token': token, 'application_id': app_id, 'status': 'applied'})
        assert ok_status.status_code == 200

        # Generate evidence-backed materials & interview questions
        gen_res = client.post('/api/generate', json={'token': token, 'job_id': 'remotive-1'})
        assert gen_res.status_code == 200
        assert 'MapleTech' in gen_res.json()['short_message']
        assert gen_res.json()['evidence']['job_url'] == 'https://remotive.com/remote-jobs/software-dev/intern-1'

        int_res = client.post('/api/interview', json={'token': token, 'job_id': 'remotive-1'})
        assert int_res.status_code == 200
        assert int_res.json()['voice_enabled'] is False
        assert len(int_res.json()['questions']) >= 5

        # Delete application
        del_res = client.delete(f'/api/applications/{app_id}', params={'token': token})
        assert del_res.status_code == 200
        assert client.get('/api/applications', params={'token': token}).json()['applications'] == []
