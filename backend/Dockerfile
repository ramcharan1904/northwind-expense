FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK punkt tokenizer
RUN python -c "import nltk; nltk.download('punkt_tab', quiet=True)"

COPY . .

EXPOSE 8000
