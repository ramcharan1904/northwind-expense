-- current_verdicts: resolves the effective verdict for every receipt.
-- Latest override if one exists, otherwise the original AI verdict.
-- API always queries this view — never verdicts directly.
CREATE OR REPLACE VIEW current_verdicts AS
SELECT
    v.id                                        AS verdict_id,
    v.submission_id,
    v.receipt_id,
    v.verdict                                   AS ai_verdict,
    v.confidence                                AS ai_confidence,
    v.reasoning                                 AS ai_reasoning,
    v.retrieval_score,
    v.prompt_version,
    v.model_used,
    COALESCE(ov.new_verdict, v.verdict)         AS current_verdict,
    CASE WHEN ov.id IS NOT NULL
         THEN TRUE ELSE FALSE END               AS is_overridden,
    ov.new_verdict                              AS override_verdict,
    ov.comment                                  AS override_comment,
    ov.reviewer_email,
    ov.reviewer_name,
    ov.created_at                               AS overridden_at,
    v.created_at                                AS reviewed_at
FROM verdicts v
LEFT JOIN LATERAL (
    SELECT * FROM overrides o
    WHERE o.verdict_id = v.id
    ORDER BY o.created_at DESC
    LIMIT 1
) ov ON TRUE;


-- submission_summary: rolled-up verdict counts per submission.
-- Used by the history/browse screen.
CREATE OR REPLACE VIEW submission_summary AS
SELECT
    s.id                        AS submission_id,
    s.status,
    s.trip_purpose,
    s.trip_start,
    s.trip_end,
    s.destination,
    s.created_at,
    s.updated_at,
    e.id                        AS employee_id,
    e.employee_ref,
    e.name                      AS employee_name,
    e.grade,
    e.department,
    COUNT(r.id)                 AS receipt_count,
    COUNT(cv.verdict_id)        AS reviewed_count,
    SUM(CASE WHEN cv.current_verdict = 'compliant'  THEN 1 ELSE 0 END) AS compliant_count,
    SUM(CASE WHEN cv.current_verdict = 'flagged'    THEN 1 ELSE 0 END) AS flagged_count,
    SUM(CASE WHEN cv.current_verdict = 'rejected'   THEN 1 ELSE 0 END) AS rejected_count,
    SUM(CASE WHEN cv.current_verdict = 'ambiguous'  THEN 1 ELSE 0 END) AS ambiguous_count,
    SUM(CASE WHEN cv.is_overridden = TRUE           THEN 1 ELSE 0 END) AS override_count,
    SUM(COALESCE(re.amount, 0))                                         AS total_amount
FROM submissions s
JOIN employees e ON e.id = s.employee_id
LEFT JOIN receipts r ON r.submission_id = s.id
LEFT JOIN current_verdicts cv ON cv.receipt_id = r.id
LEFT JOIN receipt_extractions re ON re.receipt_id = r.id
GROUP BY s.id, e.id;
