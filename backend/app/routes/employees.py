import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.employees import Employee
from app.schemas.employees import EmployeeCreate, EmployeeResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/employees", tags=["employees"])


@router.get("", response_model=list[EmployeeResponse])
async def list_employees(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Employee).order_by(Employee.name))
    return result.scalars().all()


@router.post("", response_model=EmployeeResponse, status_code=201)
async def create_employee(body: EmployeeCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(Employee).where(Employee.employee_ref == body.employee_ref)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Employee ref {body.employee_ref} already exists")

    employee = Employee(**body.model_dump())
    db.add(employee)
    await db.flush()
    logger.info("employee_created", extra={"employee_ref": employee.employee_ref})
    return employee
