"""Tests for Pydantic schemas — validation logic only, no DB."""
import pytest
from pydantic import ValidationError
import sys
from types import ModuleType
from unittest.mock import patch


def _stub_config():
    cfg = ModuleType("app.config")
    cfg.settings = type("S", (), {})()
    return cfg


class TestOverrideSchema:
    def test_comment_required(self):
        with patch.dict("sys.modules", {"app.config": _stub_config()}):
            if "app.schemas.overrides" in sys.modules:
                del sys.modules["app.schemas.overrides"]
            from app.schemas.overrides import OverrideCreate
            with pytest.raises(ValidationError):
                OverrideCreate(new_verdict="compliant", reviewer_email="a@b.com", comment="")

    def test_valid_override(self):
        with patch.dict("sys.modules", {"app.config": _stub_config()}):
            if "app.schemas.overrides" in sys.modules:
                del sys.modules["app.schemas.overrides"]
            from app.schemas.overrides import OverrideCreate
            o = OverrideCreate(
                new_verdict="compliant",
                reviewer_email="reviewer@example.com",
                comment="Expense is valid — receipt matched booking confirmation.",
            )
            assert o.new_verdict == "compliant"
            assert o.reviewer_email == "reviewer@example.com"


class TestSubmissionStatusTransitions:
    def test_valid_transitions_dict(self):
        with patch.dict("sys.modules", {"app.config": _stub_config()}):
            if "app.schemas.submissions" in sys.modules:
                del sys.modules["app.schemas.submissions"]
            from app.schemas.submissions import VALID_TRANSITIONS
            # draft can go to pending
            assert "pending" in VALID_TRANSITIONS["draft"]
            # pending cannot be manually advanced
            assert VALID_TRANSITIONS["pending"] == []
            # reviewed can go to approved or rejected
            assert "approved" in VALID_TRANSITIONS["reviewed"]
            assert "rejected" in VALID_TRANSITIONS["reviewed"]
            # approved and rejected are terminal
            assert VALID_TRANSITIONS["approved"] == []
            assert VALID_TRANSITIONS["rejected"] == []


class TestVerdictOutput:
    def test_verdict_output_valid(self):
        with patch.dict("sys.modules", {"app.config": _stub_config()}):
            if "app.schemas.verdicts" in sys.modules:
                del sys.modules["app.schemas.verdicts"]
            from app.schemas.verdicts import VerdictOutput
            vo = VerdictOutput(
                verdict="compliant",
                confidence=0.92,
                reasoning="Receipt matches policy requirements.",
                cited_clauses=[{
                    "doc_id": "TEP-005",
                    "section": "§3.1",
                    "quote": "Economy domestic airfare is reimbursable.",
                }],
            )
            assert vo.verdict == "compliant"
            assert vo.confidence == pytest.approx(0.92)

    def test_verdict_output_invalid_verdict(self):
        with patch.dict("sys.modules", {"app.config": _stub_config()}):
            if "app.schemas.verdicts" in sys.modules:
                del sys.modules["app.schemas.verdicts"]
            from app.schemas.verdicts import VerdictOutput
            with pytest.raises(ValidationError):
                VerdictOutput(
                    verdict="maybe",
                    confidence=0.5,
                    reasoning="...",
                    cited_clauses=[],
                )
