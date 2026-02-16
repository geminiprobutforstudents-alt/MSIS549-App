import os
import logging
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, DateTime, JSON, Boolean, delete
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("talkalot-backend")

DATABASE_URL = os.environ.get("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- Models ---

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, index=True)
    last_seen = Column(DateTime, default=datetime.utcnow)
    is_nearby = Column(String, default="false")
    interest_tags = Column(JSON, default=[])
    free_text_interests = Column(String, nullable=True)
    inside_fair = Column(Boolean, default=False)

class Post(Base):
    __tablename__ = "posts"
    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, index=True)
    content = Column(String)
    tags = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)

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

class JoinFairRequest(BaseModel):
    userID: str

class PostCreate(BaseModel):
    user_id: str
    content: str
    tags: List[str]

class PostResponse(BaseModel):
    id: str
    user_id: str
    content: str
    tags: List[str]
    created_at: str

# --- App ---

app = FastAPI(title="Talkalot Backend Demo")

def get_db():
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise

def cleanup_expired_presence(db: Session):
    expiry_time = datetime.utcnow() - timedelta(seconds=180)
    db.query(User).filter(User.last_seen < expiry_time).delete()
    db.commit()

@app.post("/api/register", response_model=RegisterResponse)
def register():
    db = SessionLocal()
    user_id = str(uuid.uuid4())
    new_user = User(id=user_id, last_seen=datetime.utcnow(), inside_fair=False)
    db.add(new_user)
    db.commit()
    db.close()
    logger.info(f"Registered new user: {user_id}")
    return {"userID": user_id}

@app.post("/api/join-fair")
def join_fair(req: JoinFairRequest):
    db = SessionLocal()
    user = db.query(User).filter(User.id == req.userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    user.inside_fair = True
    db.commit()
    db.close()
    logger.info(f"User {req.userID} joined the fair")
    return {"status": "success", "inside_fair": True}

@app.get("/api/user-status")
def user_status(userID: str):
    db = SessionLocal()
    user = db.query(User).filter(User.id == userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    result = {"inside_fair": user.inside_fair}
    db.close()
    return result

@app.post("/api/interests")
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
    return {"status": "success"}

@app.post("/api/heartbeat")
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

@app.get("/api/matches")
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
    return {"matches": result}

@app.post("/api/posts", response_model=PostResponse)
def create_post(post: PostCreate):
    db = SessionLocal()
    user = db.query(User).filter(User.id == post.user_id).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    if not user.inside_fair:
        db.close()
        raise HTTPException(status_code=403, detail="Must join the fair first to post")
    new_post = Post(
        id=str(uuid.uuid4()),
        user_id=post.user_id,
        content=post.content,
        tags=post.tags,
        created_at=datetime.utcnow()
    )
    db.add(new_post)
    db.commit()
    db.refresh(new_post)
    result = PostResponse(
        id=new_post.id,
        user_id=new_post.user_id,
        content=new_post.content,
        tags=new_post.tags,
        created_at=new_post.created_at.isoformat()
    )
    db.close()
    return result

@app.get("/api/posts", response_model=List[PostResponse])
def get_posts(userID: str):
    db = SessionLocal()
    user = db.query(User).filter(User.id == userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    if not user.inside_fair:
        db.close()
        return []
    posts = db.query(Post).order_by(Post.created_at.desc()).all()
    result = [
        PostResponse(
            id=p.id,
            user_id=p.user_id,
            content=p.content,
            tags=p.tags,
            created_at=p.created_at.isoformat()
        ) for p in posts
    ]
    db.close()
    return result

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html", headers={"Cache-Control": "no-cache"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
