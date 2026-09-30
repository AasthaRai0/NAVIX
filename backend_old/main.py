from fastapi import FastAPI

from navigation.preprocess import preprocess
app = FastAPI(
    title="NAVIX API"
)
@app.get("/")
def home():

    return {
        "message": "NAVIX Backend is running 🚀"
    }
@app.get("/health")
def health_check():

    return {
        "status": "healthy"
    }

@app.post("/navigation/preprocess")
def preprocess_navigation_data():

    data = preprocess()

    return {

        "status": "success",

        "rows": len(data),

        "message":
            "S-S1 and V-S1 preprocessing completed successfully"
    }