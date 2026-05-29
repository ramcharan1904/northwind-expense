from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

# asyncpg requires ssl passed via connect_args when using Neon/cloud Postgres.
# The ?ssl=require URL param is not always parsed correctly on Linux asyncpg builds.
_connect_args = {}
if "neon.tech" in settings.database_url or "ssl=require" in settings.database_url:
    _connect_args = {"ssl": "require"}

_db_url = settings.database_url.replace("?ssl=require", "").replace("&ssl=require", "")

engine = create_async_engine(
    _db_url,
    pool_size=10,
    max_overflow=20,
    echo=False,
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
