"""Seed employees from case_study/submissions/*/employee_info.json.
Idempotent — safe to re-run. Maps employee_id → employee_ref, manager_id → manager_ref.
"""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Resolve paths relative to this file so the script can be run from anywhere
_SCRIPT_DIR = Path(__file__).parent.resolve()
_BACKEND_DIR = _SCRIPT_DIR.parent
_PROJECT_ROOT = _BACKEND_DIR.parent.parent  # northwind-expense/../.. = GreenGrowth-case_study

sys.path.insert(0, str(_BACKEND_DIR))

# Point pydantic-settings to the right .env file
os.environ.setdefault("ENV_FILE", str(_BACKEND_DIR.parent / ".env"))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.employees import Employee
from app.logging_config import configure_logging

configure_logging()
logger = logging.getLogger(__name__)

# case_study lives at D:\GreenGrowth-case_study\case_study
SUBMISSIONS_DIR = _PROJECT_ROOT / "case_study" / "submissions"


async def seed() -> None:
    json_files = sorted(SUBMISSIONS_DIR.glob("*/employee_info.json"))
    if not json_files:
        logger.warning("no_employee_json_found", extra={"dir": str(SUBMISSIONS_DIR)})
        return

    async with AsyncSessionLocal() as db:
        seeded = 0
        skipped = 0
        for json_path in json_files:
            data = json.loads(json_path.read_text(encoding="utf-8"))

            # Map JSON field names to DB column names
            employee_ref = data.get("employee_id") or data.get("employee_ref")
            if not employee_ref:
                logger.warning("missing_employee_ref", extra={"file": str(json_path)})
                continue

            existing = await db.execute(
                select(Employee).where(Employee.employee_ref == employee_ref)
            )
            if existing.scalar_one_or_none():
                logger.info("employee_exists_skip", extra={"employee_ref": employee_ref})
                skipped += 1
                continue

            employee = Employee(
                employee_ref=employee_ref,
                name=data.get("name", ""),
                email=data.get("email"),
                grade=int(data.get("grade", 1)),
                title=data.get("title"),
                department=data.get("department"),
                manager_ref=data.get("manager_id") or data.get("manager_ref"),
                home_base=data.get("home_base"),
            )
            db.add(employee)
            seeded += 1
            logger.info("employee_seeded", extra={"employee_ref": employee_ref, "employee_name": employee.name})

        await db.commit()
        logger.info("seed_complete", extra={"seeded": seeded, "skipped": skipped})


if __name__ == "__main__":
    asyncio.run(seed())
