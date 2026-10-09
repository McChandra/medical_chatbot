
from fastapi import FastAPI

app = FastAPI(
    title="MedQuad AI API",
    description="Backend API for the MedQuad AI research project",
    version="0.1.0"
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MedQuad AI Backend"
    }
