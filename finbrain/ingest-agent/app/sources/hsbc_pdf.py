from __future__ import annotations


def build_review_stub(filename: str, extracted_text: str) -> dict:
    return {
        "filename": filename,
        "extracted_text": extracted_text,
        "review_required": True,
        "reason": "OCR-derived source always requires manual confirmation",
    }
