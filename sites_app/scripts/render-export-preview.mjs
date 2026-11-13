import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPdf } from "../app/api/documents/export/route.ts";

const content = `# Anwar Issaoui
(514) 945-8595 | aissa.050@uottawa.ca | linkedin.com/in/anwarissaoui | github.com/Anwarito-lbd

## Education
### University of Ottawa | Ottawa, ON
*Bachelor of Applied Science in Software Engineering | Expected May 2028*
- Relevant Coursework: Introduction to Software Engineering, Web Development, Principles of Artificial Intelligence, Computational Problem Solving, Discrete Mathematics

## Technical Skills
### Languages | Python, Java, C++, JavaScript, HTML, CSS
### Frameworks and AI | n8n, ComfyUI, GitHub API, Node.js
### Developer Tools | Git, Linux, VS Code, Figma, Bash, Docker

## Experience
### CRAiEDL Lab, University of Ottawa | Ottawa, ON
*Research Volunteer (Frontend Developer) | Sep 2025 - Present*
- Developed a responsive user interface for a research data platform, improving accessibility for lab researchers.
- Implemented secure file handling features for parsing, viewing, and downloading structured JSON datasets.
- Collaborated with the research team to translate complex data requirements into a user-friendly web experience.

## Projects
### Propel - AI Career Platform | React, Node.js, AI APIs, Firebase
*AI-powered career acceleration platform*
- Built an AI career assistant that analyzes resumes, creates mock interviews, and provides personalized training.
- Developed resume parsing and candidate profiling workflows to match users with relevant opportunities.

### NAV CANADA Challenge (uOttaHack 2026) | Ottawa, ON
*Technical Lead / 3rd Place Winner | Jan 2026*
- Engineered a real-time visualization dashboard integrating flight telemetry and OpenWeather API data.
- Developed a conflict detection algorithm during a 36-hour high-pressure sprint.`;

const outputDir = path.resolve("output/pdf");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "Propel_Tailored_CV_Preview.pdf");
await writeFile(outputPath, Buffer.from(await createPdf(content)));
console.log(outputPath);
