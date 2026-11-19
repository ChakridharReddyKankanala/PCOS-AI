from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    APP_NAME:str="PCOS-XAI"; MONGO_URI:str="mongodb://localhost:27017"; DB_NAME:str="pcos_xai"
    JWT_SECRET:str="pcos_xai_jwt_secret_key_2026_dev"; JWT_ALGORITHM:str="HS256"; ACCESS_TOKEN_MINUTES:int=60*24; REFRESH_TOKEN_DAYS:int=30
    OTP_EXPIRE_MINUTES:int=5; OTP_MAX_ATTEMPTS:int=5
    SMTP_HOST:str=""; SMTP_PORT:int=587; SMTP_USERNAME:str=""; SMTP_PASSWORD:str=""; SMTP_FROM:str=""
    REPORT_DIR:str="generated_reports"; UPLOAD_DIR:str="uploads"; MAX_UPLOAD_MB:int=10
    ULTRASOUND_PCOS_CLASS_INDEX:int=1
    GEMINI_API_KEY:str=""
    GEMINI_MODEL:str="gemini-1.5-flash"
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
settings=Settings()
