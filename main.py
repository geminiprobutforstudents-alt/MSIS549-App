import os
import logging
import uuid
import random
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, String, DateTime, JSON, Boolean, UniqueConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, Session
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

class Like(Base):
    __tablename__ = "likes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True)
    post_id = Column(String, index=True)
    post_owner_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint('user_id', 'post_id', name='uq_user_post_like'),)

class Match(Base):
    __tablename__ = "matches"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_a_id = Column(String, index=True)
    user_b_id = Column(String, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    proximity_notified = Column(Boolean, default=False)
    user_a_confirmed = Column(Boolean, default=False)
    user_b_confirmed = Column(Boolean, default=False)
    codeword = Column(String, nullable=True)
    __table_args__ = (UniqueConstraint('user_a_id', 'user_b_id', name='uq_match_pair'),)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True)
    notif_type = Column(String)
    message = Column(String)
    related_user_id = Column(String, nullable=True)
    related_post_id = Column(String, nullable=True)
    related_match_id = Column(String, nullable=True)
    extra_data = Column(JSON, nullable=True)
    seen = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# --- Schemas ---

class RegisterResponse(BaseModel):
    userID: str

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
    like_count: int = 0
    liked_by_me: bool = False

class LikeRequest(BaseModel):
    user_id: str

class NotificationResponse(BaseModel):
    id: str
    notif_type: str
    message: str
    seen: bool
    created_at: str
    related_match_id: Optional[str] = None
    extra_data: Optional[dict] = None

class MatchResponse(BaseModel):
    match_id: str
    other_user_id: str
    other_user_tags: List[str]
    both_at_event: bool
    matched_at: str
    user_a_confirmed: bool = False
    user_b_confirmed: bool = False
    i_confirmed: bool = False
    other_confirmed: bool = False
    codeword: Optional[str] = None

class ConfirmTalkRequest(BaseModel):
    user_id: str

CODEWORD_ADJECTIVES = [
    "Swift", "Bold", "Bright", "Calm", "Clever", "Cosmic", "Daring", "Eager",
    "Fierce", "Gentle", "Golden", "Grand", "Happy", "Keen", "Kind", "Lively",
    "Lucky", "Noble", "Proud", "Quick", "Quiet", "Rapid", "Sharp", "Steady",
    "True", "Vivid", "Warm", "Wild", "Wise", "Zesty"
]
CODEWORD_NOUNS = [
    "Falcon", "Phoenix", "Otter", "Panda", "Tiger", "Dolphin", "Hawk",
    "Jaguar", "Koala", "Lion", "Maple", "Oak", "Pine", "River", "Star",
    "Thunder", "Wolf", "Coral", "Ember", "Frost", "Horizon", "Summit",
    "Aurora", "Breeze", "Canyon", "Echo", "Flare", "Glacier", "Harbor", "Ivy"
]

def generate_codeword():
    adj = random.choice(CODEWORD_ADJECTIVES)
    noun = random.choice(CODEWORD_NOUNS)
    num = random.randint(10, 99)
    return f"{adj} {noun} {num}"

# --- Helpers ---

def normalize_match_pair(a: str, b: str):
    return (min(a, b), max(a, b))

def check_and_create_match(db: Session, liker_id: str, post_owner_id: str):
    ua, ub = normalize_match_pair(liker_id, post_owner_id)
    existing = db.query(Match).filter(Match.user_a_id == ua, Match.user_b_id == ub).first()
    if existing:
        return existing

    reciprocal = db.query(Like).join(Post, Like.post_id == Post.id).filter(
        Like.user_id == post_owner_id,
        Post.user_id == liker_id
    ).first()

    if reciprocal:
        new_match = Match(id=str(uuid.uuid4()), user_a_id=ua, user_b_id=ub)
        db.add(new_match)

        for uid in [liker_id, post_owner_id]:
            other = post_owner_id if uid == liker_id else liker_id
            notif = Notification(
                id=str(uuid.uuid4()),
                user_id=uid,
                notif_type="match",
                message="You have a new mutual interest match! You'll be notified when you're nearby.",
                related_user_id=other
            )
            db.add(notif)

        db.commit()
        return new_match
    return None

def get_shared_post_for_match(db: Session, user_id: str, other_id: str):
    liked_post = db.query(Post).join(Like, Like.post_id == Post.id).filter(
        Like.user_id == user_id,
        Post.user_id == other_id
    ).first()
    if liked_post:
        return {"post_id": liked_post.id, "content": liked_post.content, "tags": liked_post.tags or []}
    return None

def check_proximity_notifications(db: Session, user_id: str):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.inside_fair:
        return

    matches = db.query(Match).filter(
        Match.proximity_notified == False,
        ((Match.user_a_id == user_id) | (Match.user_b_id == user_id))
    ).all()

    for m in matches:
        other_id = m.user_b_id if m.user_a_id == user_id else m.user_a_id
        other_user = db.query(User).filter(User.id == other_id).first()
        if other_user and other_user.inside_fair:
            m.proximity_notified = True
            for uid in [user_id, other_id]:
                target_other = other_id if uid == user_id else user_id
                liked_post_info = get_shared_post_for_match(db, uid, target_other)
                if liked_post_info and liked_post_info.get("tags"):
                    tag_str = ", ".join(liked_post_info["tags"])
                    msg = f"Somebody who's interested in '{tag_str}' is nearby!"
                else:
                    msg = "Someone who shares your interests is nearby!"
                notif = Notification(
                    id=str(uuid.uuid4()),
                    user_id=uid,
                    notif_type="proximity",
                    message=msg,
                    related_user_id=target_other,
                    related_match_id=m.id,
                    extra_data=liked_post_info
                )
                db.add(notif)
    db.commit()

# --- App ---

app = FastAPI(title="Talkalot")

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
    user.last_seen = datetime.utcnow()
    db.commit()
    check_proximity_notifications(db, req.userID)
    db.close()
    logger.info(f"User {req.userID} joined the fair")
    return {"status": "success", "inside_fair": True}

@app.post("/api/leave-fair")
def leave_fair(req: JoinFairRequest):
    db = SessionLocal()
    user = db.query(User).filter(User.id == req.userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    user.inside_fair = False
    db.commit()
    db.close()
    return {"status": "success", "inside_fair": False}

@app.get("/api/user-status")
def user_status(userID: str):
    db = SessionLocal()
    user = db.query(User).filter(User.id == userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    user.last_seen = datetime.utcnow()
    db.commit()
    check_proximity_notifications(db, userID)
    unread = db.query(Notification).filter(
        Notification.user_id == userID,
        Notification.seen == False
    ).count()
    result = {"inside_fair": user.inside_fair, "unread_notifications": unread}
    db.close()
    return result

@app.post("/api/posts", response_model=PostResponse)
def create_post(post: PostCreate):
    db = SessionLocal()
    user = db.query(User).filter(User.id == post.user_id).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
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
        created_at=new_post.created_at.isoformat(),
        like_count=0,
        liked_by_me=False
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
    posts = db.query(Post).order_by(Post.created_at.desc()).all()
    result = []
    for p in posts:
        like_count = db.query(Like).filter(Like.post_id == p.id).count()
        liked_by_me = db.query(Like).filter(
            Like.post_id == p.id, Like.user_id == userID
        ).first() is not None
        result.append(PostResponse(
            id=p.id,
            user_id=p.user_id,
            content=p.content,
            tags=p.tags,
            created_at=p.created_at.isoformat(),
            like_count=like_count,
            liked_by_me=liked_by_me
        ))
    db.close()
    return result

@app.post("/api/posts/{post_id}/like")
def like_post(post_id: str, req: LikeRequest):
    db = SessionLocal()
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")
    post = db.query(Post).filter(Post.id == post_id).first()
    if not post:
        db.close()
        raise HTTPException(status_code=404, detail="Post not found")
    if post.user_id == req.user_id:
        db.close()
        raise HTTPException(status_code=400, detail="Cannot like your own post")

    existing = db.query(Like).filter(
        Like.user_id == req.user_id, Like.post_id == post_id
    ).first()
    if existing:
        db.close()
        return {"status": "already_liked"}

    new_like = Like(
        id=str(uuid.uuid4()),
        user_id=req.user_id,
        post_id=post_id,
        post_owner_id=post.user_id
    )
    db.add(new_like)
    db.commit()

    post_owner = db.query(User).filter(User.id == post.user_id).first()
    if post_owner and post_owner.inside_fair:
        notif = Notification(
            id=str(uuid.uuid4()),
            user_id=post.user_id,
            notif_type="like",
            message="Someone liked your interest post!",
            related_user_id=req.user_id,
            related_post_id=post_id
        )
        db.add(notif)
        db.commit()

    match = check_and_create_match(db, req.user_id, post.user_id)

    if match:
        check_proximity_notifications(db, req.user_id)

    db.close()
    return {"status": "liked", "matched": match is not None}

@app.post("/api/posts/{post_id}/unlike")
def unlike_post(post_id: str, req: LikeRequest):
    db = SessionLocal()
    existing = db.query(Like).filter(
        Like.user_id == req.user_id, Like.post_id == post_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
    db.close()
    return {"status": "unliked"}

@app.get("/api/notifications", response_model=List[NotificationResponse])
def get_notifications(userID: str):
    db = SessionLocal()
    notifs = db.query(Notification).filter(
        Notification.user_id == userID
    ).order_by(Notification.created_at.desc()).limit(50).all()
    result = [
        NotificationResponse(
            id=n.id,
            notif_type=n.notif_type,
            message=n.message,
            seen=n.seen,
            created_at=n.created_at.isoformat(),
            related_match_id=n.related_match_id,
            extra_data=n.extra_data
        ) for n in notifs
    ]
    db.close()
    return result

@app.post("/api/notifications/mark-seen")
def mark_notifications_seen(req: JoinFairRequest):
    db = SessionLocal()
    db.query(Notification).filter(
        Notification.user_id == req.userID,
        Notification.seen == False
    ).update({"seen": True})
    db.commit()
    db.close()
    return {"status": "success"}

@app.get("/api/matches", response_model=List[MatchResponse])
def get_matches(userID: str):
    db = SessionLocal()
    user = db.query(User).filter(User.id == userID).first()
    if not user:
        db.close()
        raise HTTPException(status_code=404, detail="User not found")

    matches = db.query(Match).filter(
        (Match.user_a_id == userID) | (Match.user_b_id == userID)
    ).order_by(Match.created_at.desc()).all()

    result = []
    for m in matches:
        other_id = m.user_b_id if m.user_a_id == userID else m.user_a_id
        other_user = db.query(User).filter(User.id == other_id).first()
        other_tags = other_user.interest_tags if other_user and other_user.interest_tags else []
        both_at_event = (user.inside_fair and other_user.inside_fair) if other_user else False
        i_am_a = (m.user_a_id == userID)
        i_confirmed = m.user_a_confirmed if i_am_a else m.user_b_confirmed
        other_confirmed = m.user_b_confirmed if i_am_a else m.user_a_confirmed
        show_codeword = m.codeword if (m.user_a_confirmed and m.user_b_confirmed) else None
        result.append(MatchResponse(
            match_id=m.id,
            other_user_id=other_id,
            other_user_tags=other_tags,
            both_at_event=both_at_event,
            matched_at=m.created_at.isoformat(),
            user_a_confirmed=m.user_a_confirmed,
            user_b_confirmed=m.user_b_confirmed,
            i_confirmed=i_confirmed,
            other_confirmed=other_confirmed,
            codeword=show_codeword
        ))
    db.close()
    return result

@app.post("/api/matches/{match_id}/confirm")
def confirm_talk(match_id: str, req: ConfirmTalkRequest):
    db = SessionLocal()
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        db.close()
        raise HTTPException(status_code=404, detail="Match not found")

    if req.user_id not in [match.user_a_id, match.user_b_id]:
        db.close()
        raise HTTPException(status_code=403, detail="Not part of this match")

    if req.user_id == match.user_a_id:
        match.user_a_confirmed = True
    else:
        match.user_b_confirmed = True

    if match.user_a_confirmed and match.user_b_confirmed and not match.codeword:
        match.codeword = generate_codeword()
        for uid in [match.user_a_id, match.user_b_id]:
            notif = Notification(
                id=str(uuid.uuid4()),
                user_id=uid,
                notif_type="codeword",
                message=f"You both want to talk! Your codeword is: {match.codeword}",
                related_match_id=match.id,
                extra_data={"codeword": match.codeword}
            )
            db.add(notif)

    db.commit()

    both_confirmed = match.user_a_confirmed and match.user_b_confirmed
    result = {
        "status": "confirmed",
        "both_confirmed": both_confirmed,
        "codeword": match.codeword if both_confirmed else None
    }
    db.close()
    return result

@app.get("/api/matches/{match_id}/status")
def match_status(match_id: str, userID: str):
    db = SessionLocal()
    match = db.query(Match).filter(Match.id == match_id).first()
    if not match:
        db.close()
        raise HTTPException(status_code=404, detail="Match not found")
    both_confirmed = match.user_a_confirmed and match.user_b_confirmed
    i_am_a = (match.user_a_id == userID)
    result = {
        "i_confirmed": match.user_a_confirmed if i_am_a else match.user_b_confirmed,
        "other_confirmed": match.user_b_confirmed if i_am_a else match.user_a_confirmed,
        "both_confirmed": both_confirmed,
        "codeword": match.codeword if both_confirmed else None
    }
    db.close()
    return result

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html", headers={"Cache-Control": "no-cache"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
