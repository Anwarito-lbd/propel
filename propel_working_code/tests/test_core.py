from app.models import Job, UserProfile
from app.services.resume import extract_resume_text, keywords
from app.services.scoring import score_job, filter_jobs
from app.services.generator import generate_application_message, interview_questions

RESUME = "Python Java React FastAPI SQL project at uOttawa software engineering co-op"

def test_txt_resume_extraction():
    assert 'Python' in extract_resume_text('resume.txt', RESUME.encode())

def test_keywords_are_deterministic():
    assert keywords('Python Python Java and the FastAPI')[0] == 'python'

def test_senior_roles_are_penalized():
    junior = Job('1','Software Engineering Intern','Acme','Canada','test','u','u','2026','Python React internship')
    senior = Job('2','Senior Software Engineer','Acme','Canada','test','u','u','2026','Python React')
    assert score_job(junior, RESUME, 'Software Engineering', '4 months') > score_job(senior, RESUME, 'Software Engineering', '4 months')

def test_filter_jobs_returns_ranked_results():
    jobs = [
        Job('1','Marketing Manager','Acme','Canada','test','u','u','2026','growth'),
        Job('2','Software Engineering Intern','Acme','Canada','test','u','u','2026','Python React internship'),
    ]
    out = filter_jobs(jobs, query='Software Engineering', location='Canada', resume_text=RESUME, field='Software Engineering')
    assert len(out) == 1
    assert out[0].id == '2'

def test_generated_message_contains_source_evidence():
    profile = UserProfile(email='a@b.com', name='Anwar', field='Software Engineering', resume_text=RESUME)
    job = Job('2','Software Engineering Intern','Acme','Canada','Remotive public API','https://example.com','https://example.com','2026','Python React internship')
    result = generate_application_message(profile, job)
    assert 'Acme' in result['short_message']
    assert result['evidence']['job_url'] == 'https://example.com'

def test_interview_questions_are_job_specific():
    profile = UserProfile(email='a@b.com', resume_text=RESUME)
    job = Job('2','Software Engineering Intern','Acme','Canada','test','u','u','2026','FastAPI React SQL')
    questions = interview_questions(profile, job)
    assert len(questions) >= 5
    assert any('FastAPI'.lower() in q.lower() or 'fastapi' in q.lower() for q in questions)
