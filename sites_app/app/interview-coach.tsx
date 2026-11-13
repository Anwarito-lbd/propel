"use client";

import { useEffect, useRef, useState } from "react";

type CoachJob = { company: string; title: string; description: string; url: string };
type Feedback = { feedback: string; strengths: string[]; improvements: string[]; score: number; overallScore: number; summary?: string };

type RecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean;
  start: () => void; stop: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

export default function InterviewCoach({ initialJob, jobs, onRefresh }: { initialJob: CoachJob | null; jobs: CoachJob[]; onRefresh: () => Promise<void> }) {
  const [job, setJob] = useState<CoachJob>(initialJob ?? { company: "", title: "", description: "", url: "" });
  const [difficulty, setDifficulty] = useState("balanced");
  const [sessionId, setSessionId] = useState("");
  const [question, setQuestion] = useState("");
  const [competency, setCompetency] = useState("");
  const [questionNumber, setQuestionNumber] = useState(1);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [history, setHistory] = useState<Array<{ question: string; answer: string; score: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { recognitionRef.current?.stop(); audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);

  function startListening() {
    if (listening) return;
    const BrowserRecognition = (window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: RecognitionConstructor }).webkitSpeechRecognition;
    if (!BrowserRecognition) { setError("Voice dictation is not supported by this browser. You can still type your answer."); return; }
    const recognition = new BrowserRecognition();
    recognition.lang = "en-CA"; recognition.interimResults = false; recognition.continuous = true;
    recognition.onresult = (event) => {
      const pieces: string[] = [];
      for (let index = 0; index < event.results.length; index++) pieces.push(event.results[index][0].transcript);
      setAnswer((current) => `${current}${current ? " " : ""}${pieces.join(" ")}`.trim());
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setError("Microphone dictation stopped. Check browser microphone permission or type your answer."); };
    recognitionRef.current = recognition; setListening(true); setError(""); recognition.start();
  }

  async function speak(text: string, listenAfter = false) {
    setSpeaking(true); setError("");
    try {
      audioRef.current?.pause();
      const response = await fetch("/api/interview/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!response.ok) { const payload = await response.json() as { error?: string }; throw new Error(payload.error || "Voice playback failed."); }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url); audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); if (listenAfter) startListening(); };
      audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); setError("Audio could not be played in this browser."); };
      await audio.play();
    } catch {
      if (!("speechSynthesis" in window)) { setSpeaking(false); setError("Voice playback is not supported in this browser."); return; }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-CA"; utterance.rate = 0.96; utterance.pitch = 1;
      utterance.onend = () => { setSpeaking(false); if (listenAfter) startListening(); };
      utterance.onerror = () => { setSpeaking(false); setError("Voice playback stopped. You can continue by reading the question."); };
      window.speechSynthesis.speak(utterance);
    }
  }

  function toggleListening() {
    if (listening) { recognitionRef.current?.stop(); return; }
    startListening();
  }

  async function start() {
    if (!job.company.trim() || !job.title.trim()) { setError("Enter a company and job title, or choose a live result."); return; }
    setBusy(true); setError(""); setFeedback(null); setHistory([]); setDone(false);
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", job, difficulty }) });
      const payload = await response.json() as { sessionId?: string; question?: string; competency?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "The interview could not start.");
      setSessionId(payload.sessionId ?? ""); setQuestion(payload.question ?? ""); setCompetency(payload.competency ?? ""); setQuestionNumber(1); setAnswer("");
      if (handsFree && payload.question) await speak(payload.question, true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The interview could not start."); }
    finally { setBusy(false); }
  }

  async function submitAnswer() {
    if (!answer.trim()) return;
    recognitionRef.current?.stop(); setBusy(true); setError("");
    const answeredQuestion = question; const submittedAnswer = answer.trim();
    try {
      const response = await fetch("/api/interview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "answer", sessionId, answer: submittedAnswer }) });
      const payload = await response.json() as Feedback & { nextQuestion?: string; nextCompetency?: string; questionNumber?: number; done?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Feedback could not be generated.");
      setFeedback(payload); setHistory((current) => [...current, { question: answeredQuestion, answer: submittedAnswer, score: payload.score }]);
      setDone(Boolean(payload.done));
      if (!payload.done) { setQuestion(payload.nextQuestion ?? ""); setCompetency(payload.nextCompetency ?? ""); setQuestionNumber(payload.questionNumber ?? questionNumber + 1); setAnswer(""); }
      if (handsFree) {
        const narration = payload.done ? (payload.summary || payload.feedback) : `${payload.feedback} Next question. ${payload.nextQuestion ?? ""}`;
        await speak(narration, !payload.done);
      }
      await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Feedback could not be generated."); }
    finally { setBusy(false); }
  }

  function reset() {
    recognitionRef.current?.stop(); audioRef.current?.pause(); setSessionId(""); setQuestion(""); setAnswer(""); setFeedback(null); setHistory([]); setDone(false); setError("");
  }

  function selectLiveJob(item: CoachJob) {
    setJob({ ...item });
    setError("");
  }

  if (!sessionId) return <section className="subpage interview-page">
    <div className="subpage-head"><p className="eyebrow">AI MOCK INTERVIEW · RESUME + REAL ROLE</p><h1>Practice out loud.</h1><p>Five tailored questions, answer-by-answer coaching, and optional voice. Scores are practice estimates—not hiring predictions.</p></div>
    <div className="interview-setup">
      <div className="setup-main">
        <span className="setup-kicker">TARGET INTERVIEW</span>
        <div className="profile-grid"><label>Company<input value={job.company} onChange={(event) => setJob({ ...job, company: event.target.value })} placeholder="Company name" /></label><label>Job title<input value={job.title} onChange={(event) => setJob({ ...job, title: event.target.value })} placeholder="Software Engineer Intern" /></label></div>
        <label>Job description (optional)<textarea value={job.description} onChange={(event) => setJob({ ...job, description: event.target.value })} placeholder="Paste the real posting here for more targeted questions." /></label>
        {job.company && job.title && <div className="selected-live-job"><span>Selected role</span><strong>{job.title}</strong><small>{job.company}</small></div>}
        <label>Coach style<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="supportive">Supportive</option><option value="balanced">Balanced</option><option value="challenging">Challenging</option></select></label>
        <label className="hands-free"><input type="checkbox" checked={handsFree} onChange={(event) => setHandsFree(event.target.checked)} /><span><b>Hands-free voice interview</b><small>Reads each question, starts the microphone after playback, then speaks the coaching and next question.</small></span></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary interview-start" disabled={busy} onClick={() => void start()}>{busy ? "Preparing your questions…" : "Start 5-question interview"}</button>
      </div>
      <aside className="recent-roles"><span>USE A LIVE JOB</span><p>Pick one of your current verified search results, then start the interview.</p>{jobs.slice(0, 6).map((item) => { const selected = job.url === item.url && job.title === item.title; return <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} key={`${item.company}-${item.title}-${item.url}`} onClick={() => selectLiveJob(item)}><b>{selected ? "✓ " : ""}{item.title}</b><small>{item.company}</small></button>; })}{!jobs.length && <div className="mini-empty">Search live jobs first, or enter a role manually.</div>}</aside>
    </div>
  </section>;

  return <section className="subpage interview-page active-interview">
    <div className="interview-top"><div><p className="eyebrow">MOCK INTERVIEW · {job.company.toUpperCase()}</p><h1>{job.title}</h1></div><button className="secondary" onClick={reset}>End practice</button></div>
    <div className="interview-progress"><span style={{ width: `${Math.min((questionNumber / 5) * 100, 100)}%` }} /><p>Question {done ? 5 : questionNumber} of 5</p></div>
    <div className="interview-room">
      <section className="interviewer-panel">
        <div className={`voice-orb ${speaking ? "speaking" : ""}`}><i /><span>{speaking ? "Speaking" : "AI coach"}</span></div>
        {!done ? <><span className="competency">{competency}</span><h2>{question}</h2><button className="listen-button" disabled={speaking} onClick={() => void speak(question, handsFree)}>{speaking ? "Playing question…" : handsFree ? "▶ Replay, then open microphone" : "▶ Listen to question"}</button></> : <><span className="competency">INTERVIEW COMPLETE</span><h2>Review your evidence-based feedback and practice again when ready.</h2></>}
      </section>
      <section className="answer-panel">
        {!done && <><label>Your answer<textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Use the STAR method: situation, task, action, result…" /></label><div className="answer-tools"><button className={listening ? "mic active" : "mic"} onClick={toggleListening}>{listening ? "■ Stop recording" : "● Answer with microphone"}</button><span>{answer.trim().split(/\s+/).filter(Boolean).length} words</span></div><button className="primary submit-answer" disabled={busy || answer.trim().length < 5} onClick={() => void submitAnswer()}>{busy ? "Reviewing your answer…" : "Submit for coaching"}</button></>}
        {error && <p className="form-error">{error}</p>}
        {feedback && <div className="feedback-card"><div className="feedback-score"><b>{feedback.score}</b><span>practice score</span></div><div><strong>{done ? "Final coaching" : "Latest feedback"}</strong><p>{done && feedback.summary ? feedback.summary : feedback.feedback}</p></div><section><div><b>What worked</b>{feedback.strengths.map((item) => <p key={item}>✓ {item}</p>)}</div><div><b>Improve next</b>{feedback.improvements.map((item) => <p key={item}>→ {item}</p>)}</div></section>{!done && <p className="next-note">Your next question is ready on the left.</p>}{done && <button className="secondary full-button" onClick={reset}>Practice another interview</button>}</div>}
      </section>
    </div>
    {history.length > 0 && <details className="interview-history"><summary>Review answered questions ({history.length})</summary>{history.map((item, index) => <article key={`${item.question}-${index}`}><b>Q{index + 1} · {item.score}/100</b><p>{item.question}</p><span>{item.answer}</span></article>)}</details>}
  </section>;
}
