from pydantic import BaseModel


class CitedClause(BaseModel):
    doc_id: str
    section: str | None
    quoted_text: str
    similarity_score: float


class PolicyQARequest(BaseModel):
    question: str


class PolicyQAResponse(BaseModel):
    answer: str
    citations: list[CitedClause] = []
    refused: bool = False
    refusal_reason: str | None = None
    top_similarity: float | None = None
