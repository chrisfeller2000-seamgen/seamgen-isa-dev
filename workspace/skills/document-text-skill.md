---
name: document-text
purpose: Read the text of a document file, including scanned PDFs, before answering questions about it or scoring it.
audience: This skill is written to be read by ISA, and by a human teammate who wants to know what ISA can and cannot read.
version: 1.0 — October 2026
---

# Document Text Skill

## What this skill does

It turns a file into plain text with one command:

```
node scripts/document-text.mjs "<path to the file>"
```

The text is printed. A final status line says how it was read, for example `extracted | ocr | 14 pages by OCR`.

It reads PDF, Word (`.docx`), Excel (`.xlsx`), HTML, and plain text files. A scanned PDF is read by OCR (Optical Character Recognition), which recognises the letters in the page images.

## When to use it

- Someone asks what a document says and the file is in the workspace.
- A document was reported as having no extractable text.
- You need the wording of an RFP attachment before answering a question about it.

Do not use it to re-run RFP scoring. The weekly RFP job does its own reading.

## Reading the status line

| Status | What it means | What to tell people |
|---|---|---|
| `extracted` | The text was read. | Answer from the text. |
| `needs-ocr` | A scan, and OCR is not installed on this machine. | Say the file is a scan you cannot read yet. |
| `ocr-failed` | OCR ran but could not process the file. | Say the scan could not be read and ask for a clearer copy. |
| `empty` | The file has no text at all. | Say the file appears to be blank. |
| `unsupported-type` | Not a file type listed above. | Say which type it is and ask for a PDF or Word copy. |
| `tool-missing`, `failed` | A reading tool is missing or the file is damaged. | Say the file could not be opened. Do not guess at its contents. |

## Text read by OCR can be wrong

When the status line says `ocr` or `text-layer+ocr`, some or all of the text was recognised from images. Letters and layout are usually right. Small raised characters, digits, and handwriting are where it slips: a real scanned RFQ came back with `October 23"4 2026` where the page said "October 23rd, 2026".

So for a deadline, a dollar amount, or a contract number taken from OCR text:

- Say it came from a scanned document.
- If the characters around it look garbled, give your best reading and say it needs checking against the original.
- Never present an OCR-derived date as confirmed.

## What it does not do

It does not read old-format `.doc`, `.xls`, or `.pptx` files, images, or zip bundles. It does not change or move the original file.
