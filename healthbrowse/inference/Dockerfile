FROM python:3.12-slim
ENV USE_TF=0 USE_FLAX=0 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/cache/huggingface
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home model && mkdir /cache && chown model:model /cache
COPY serve.py model_settings.py structured_output.py ./
USER model
EXPOSE 8080
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--workers", "1"]
