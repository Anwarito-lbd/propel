# Propel - SEG2105 Submission Pack

Prepared for Anwar Issaoui on July 22, 2026.

## Included deliverables

1. `Propel_Source_Repository.bundle` - portable sanitized Git repository.
2. `Propel_Final_Source_Code.zip` - convenient source-code archive.
3. `Propel_Requirements_Specification.docx` and `.pdf`.
4. `Propel_Project_Report.docx` and `.pdf`.
5. `Propel_Test_Plan_and_Results.docx` and `.pdf`.
6. `Propel_Prompt_Engineering_Log.docx` and `.pdf`.
7. `Propel_SEG2105_Final_Presentation_v3.pptx`.
8. `Propel_Demo_Quick_Reference.docx` and `.pdf`.
9. `DEMO_VIDEO_REQUIRED_BEFORE_SUBMISSION.txt` - the only remaining external deliverable.

## Run the source locally

1. Extract `Propel_Final_Source_Code.zip`.
2. Open a terminal in the extracted folder.
3. Run `npm ci`.
4. Copy `.env.example` to `.env.local` and add your own runtime keys.
5. Run `npm run dev`.
6. Open `http://localhost:5173`.

Run the complete local verification with `npm run test:local`.

## Restore the portable Git repository

Use a Git installation and run:

```text
git clone Propel_Source_Repository.bundle Propel
```

The bundle contains a single sanitized submission commit and no local secret file.

## Hosted backup

The verified hosted build is available at:

https://propel-careerops.issaouianwar2020.chatgpt.site/

For the graded demonstration, show the executable local source first and use the hosted build only as a backup.

## Important security note

The submission pack excludes `.env.local`, dependency folders, generated build folders, and API secrets. Any key previously pasted into a chat should be rotated after the demonstration.
