from __future__ import annotations
from app.models import Job, UserProfile
from app.services.resume import keywords

QUESTION_BANK = [
    'Tell me about yourself and why this role fits your background.',
    'Which project best proves you can do this job?',
    'Describe a technical problem you debugged and how you solved it.',
    'How would you learn a missing technology quickly?',
    'What questions would you ask the team before starting?',
]

def generate_application_message(profile: UserProfile, job: Job) -> dict:
    """Deterministic, truthful draft: every skill term must come from resume or job text."""
    resume_terms = keywords(profile.resume_text, 12)
    job_terms = keywords(job.description + ' ' + job.title, 10)
    shared = [kw for kw in resume_terms if kw in job_terms][:5]
    if not shared:
        shared = resume_terms[:4]
    name = profile.name or 'Anwar Issaoui'
    skills = ', '.join(shared) if shared else 'software engineering fundamentals'
    short = (
        f"Hi {job.company} team, I am applying for the {job.title} role. "
        f"My resume shows experience with {skills}, and I am especially interested in contributing to this role because it matches my target field. "
        f"I would be happy to discuss how my projects and learning background fit your team."
    )
    cover = (
        f"Dear {job.company} hiring team,\n\n"
        f"My name is {name}, and I am interested in the {job.title} position. "
        f"Based on my resume, my strongest relevant areas are {skills}. "
        f"I am careful not to overstate my background, so I would present these as areas I have practiced or demonstrated in projects rather than as unsupported professional claims.\n\n"
        f"Thank you for considering my application.\n{name}"
    )
    evidence = { 'resume_keywords_used': shared, 'job_source': job.source, 'job_url': job.url }
    return {'short_message': short, 'cover_letter': cover, 'evidence': evidence}

def interview_questions(profile: UserProfile, job: Job) -> list[str]:
    terms = keywords(job.description + ' ' + profile.resume_text, 6)
    custom = []
    if terms:
        custom.append(f"How have you used or learned {terms[0]} in a project?")
    if len(terms) > 1:
        custom.append(f"The posting mentions {terms[1]}. What is your current level and how would you improve it?")
    return custom + QUESTION_BANK
