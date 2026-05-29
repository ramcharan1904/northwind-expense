import os
import uuid
import logging
from pathlib import Path
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class StorageService:
    """Abstracted file storage. Local backend for dev, R2 for production.
    Always stores and returns relative paths — never file:/// URLs.
    """

    async def upload(self, file_bytes: bytes, filename: str) -> str:
        """Upload file and return relative path for DB storage."""
        if settings.storage_backend == "r2":
            return await self._upload_r2(file_bytes, filename)
        return await self._upload_local(file_bytes, filename)

    async def get_file_bytes(self, relative_path: str) -> bytes:
        """Retrieve file bytes by relative path."""
        if settings.storage_backend == "r2":
            return await self._download_r2(relative_path)
        return await self._download_local(relative_path)

    async def _upload_local(self, file_bytes: bytes, filename: str) -> str:
        upload_dir = Path(settings.local_upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(filename).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = upload_dir / unique_name
        dest.write_bytes(file_bytes)
        relative_path = f"{settings.local_upload_dir}/{unique_name}"
        logger.info("file_uploaded_local", extra={"path": relative_path, "bytes": len(file_bytes)})
        return relative_path

    async def _download_local(self, relative_path: str) -> bytes:
        path = Path(relative_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {relative_path}")
        return path.read_bytes()

    async def _upload_r2(self, file_bytes: bytes, filename: str) -> str:
        import boto3
        from botocore.config import Config
        ext = Path(filename).suffix
        key = f"receipts/{uuid.uuid4().hex}{ext}"
        client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            config=Config(signature_version="s3v4"),
        )
        client.put_object(Bucket=settings.r2_bucket, Key=key, Body=file_bytes)
        logger.info("file_uploaded_r2", extra={"key": key, "bytes": len(file_bytes)})
        return key

    async def _download_r2(self, key: str) -> bytes:
        import boto3
        from botocore.config import Config
        client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            config=Config(signature_version="s3v4"),
        )
        response = client.get_object(Bucket=settings.r2_bucket, Key=key)
        return response["Body"].read()


storage_service = StorageService()
