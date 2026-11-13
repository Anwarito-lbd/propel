from __future__ import annotations
import io
from docx import Document
from pypdf import PdfReader

ALLOWED_EXTENSIONS = {'.txt', '.pdf', '.docx'}

def extract_resume_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith('.txt'):
        return content.decode('utf-8', errors='ignore').strip()
    if lower.endswith('.pdf'):
        reader = PdfReader(io.BytesIO(content))
        return '\n'.join(page.extract_text() or '' for page in reader.pages).strip()
    if lower.endswith('.docx'):
        doc = Document(io.BytesIO(content))
        return '\n'.join(p.text for p in doc.paragraphs if p.text.strip()).strip()
    raise ValueError('Unsupported file type. Upload TXT, PDF, or DOCX.')

def keywords(text: str, limit: int = 28) -> list[str]:
    stop = {'the','and','for','with','from','that','this','you','your','are','was','were','have','has','will','can','into','using','use','all','our','their','a','an','of','to','in','on','as','by','is','be','or','at'}
    words = []
    for raw in text.replace('/', ' ').replace('-', ' ').split():
        w = ''.join(ch.lower() for ch in raw if ch.isalnum() or ch in ['#','+'])
        if len(w) >= 3 and w not in stop:
            words.append(w)
    counts = {}
    for w in words:
        counts[w] = counts.get(w, 0) + 1
    return [w for w, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]]
