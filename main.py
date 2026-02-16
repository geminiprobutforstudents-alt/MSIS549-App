import os
import logging
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, DateTime, JSON, delete
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta

# Setup logging for live demo debugging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("talkalot-backend")

# Database setup using Replit PostgreSQL
DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Models ---

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    last_seen = Column(DateTime, default=datetime.utcnow)
    # Location is simplified for the demo: within 1 mile of demo room or not
    is_nearby = Column(String, default="false") # "true" or "false"
    # Interests stored as a list of tags
    interest_tags = Column(JSON, default=[])
    # Free-text stored but not used in matching logic as requested
    free_text_interests = Column(String, nullable=True)

Base.metadata.create_all(bind=engine)

# --- Schemas ---

class RegisterResponse(BaseModel):
    userID: str

class InterestsRequest(BaseModel):
    userID: str
    tags: List[str]
    free_text: Optional[str] = None

class HeartbeatRequest(BaseModel):
    userID: str
    is_nearby: bool

# --- App ---

app = FastAPI(title="Talkalot Backend Demo")

def cleanup_expired_presence(db: Session):
    """
    Automatically clear expired presence and associated data.
    Presence expires after 180 seconds of no heartbeat.
    """
    expiry_time = datetime.utcnow() - timedelta(seconds=180)
    expired_users_query = delete(User).where(User.last_seen < expiry_time)
    result = db.execute(expired_users_query)
    db.commit()
    if result.rowcount > 0:
        logger.info(f"Cleaned up {result.rowcount} expired users.")

@app.post("/register", response_model=RegisterResponse)
def register():
    """
    Creates a new user and returns a unique ID.
    Privacy: No PII collected. Only an anonymous UUID is generated.
    """
    db = SessionLocal()
    user_id = str(uuid.uuid4())
    new_user = User(id=user_id, last_seen=datetime.utcnow())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    db.close()
    logger.info(f"Registered new user: {user_id}")
    return {"userID": user_id}

@app.post("/interests")
def update_interests(req: InterestsRequest):
    db = SessionLocal()
    user = db.query(User).filter(User.id == req.userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    
    user.interest_tags = req.tags
    user.free_text_interests = req.free_text
    db.commit()
    db.close()
    logger.info(f"Updated interests for user: {req.userID}")
    return {"status": "success"}

@app.post("/heartbeat")
def heartbeat(req: HeartbeatRequest):
    db = SessionLocal()
    cleanup_expired_presence(db)
    
    user = db.query(User).filter(User.id == req.userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User session expired or not found")
    
    user.last_seen = datetime.utcnow()
    user.is_nearby = "true" if req.is_nearby else "false"
    db.commit()
    db.close()
    return {"status": "updated"}

@app.get("/matches")
def get_matches(userID: str):
    db = SessionLocal()
    cleanup_expired_presence(db)
    
    current_user = db.query(User).filter(User.id == userID).first()
    if not current_user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")

    matches = db.query(User).filter(
        User.id != userID,
        User.is_nearby == "true"
    ).all()
    
    result = [m.interest_tags for m in matches if m.interest_tags]
    db.close()
    
    logger.info(f"Fetched {len(result)} matches for user {userID}")
    return {"matches": result}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
