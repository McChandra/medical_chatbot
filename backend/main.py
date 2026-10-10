from fastapi import FastAPI
from backend.auth.main import router as auth_router

app = FastAPI(
    title="MedQuad AI API",
    version="0.1.0"
)

app.include_router(auth_router)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MedQuad AI Backend"
    }