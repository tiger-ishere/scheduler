from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from models import ScheduleRequest, UserCreate, UserLogin, ScheduleSaveRequest, FrequencyRequest
from scheduler import generate_smart_schedule, get_ors_driving_poly_path, generate_frequency_schedule
from optimizer import evaluate_solution
from database import users_collection, schedules_collection
from auth import get_password_hash, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
from datetime import datetime, timedelta
from bson import ObjectId

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/optimize")
def optimize_schedule(request: ScheduleRequest):
    # Call the exact ILP solver. 
    schedule = generate_smart_schedule(request.locations, request.num_vehicles, request.optimize_for)
    
    if not schedule:
        return {"solutions": []}
        
    result = evaluate_solution(request.locations, schedule)

    # Build Polylines natively mapping actual street curves per bus route
    polylines = {}
    
    # Group schedule by bus_id
    buses = {}
    for stop in schedule:
        bid = stop["bus_id"]
        if bid not in buses:
            buses[bid] = []
        buses[bid].append(stop)
        
    for bid, stops in buses.items():
        stops = sorted(stops, key=lambda x: x["start_time"])
        path = []
        for i in range(len(stops) - 1):
            curr_node = next((l for l in request.locations if l.id == stops[i]["location_node_id"]), None)
            next_node = next((l for l in request.locations if l.id == stops[i+1]["location_node_id"]), None)
            if curr_node and next_node:
                segment = get_ors_driving_poly_path(curr_node.lat, curr_node.lng, next_node.lat, next_node.lng)
                path.extend(segment)
        polylines[bid] = path

    solution = {
        "schedule": schedule,
        "polylines": polylines,
        "metrics": result
    }

    return {
        "solutions": [solution]
    }

@app.post("/generate-frequency")
def generate_frequency(request: FrequencyRequest):
    schedule = generate_frequency_schedule(request.locations, request.num_buses, request.start_time_minutes, request.end_time_minutes)
    
    if not schedule:
        return {"solutions": []}
        
    polylines = {}
    
    buses = {}
    for stop in schedule:
        bid = stop["bus_id"]
        if bid not in buses:
            buses[bid] = []
        buses[bid].append(stop)
        
    segment_cache = {}
    for bid, stops in buses.items():
        stops = sorted(stops, key=lambda x: x["start_time"])
        path = []
        for i in range(len(stops) - 1):
            curr_node = next((l for l in request.locations if l.id == stops[i]["location_node_id"]), None)
            next_node = next((l for l in request.locations if l.id == stops[i+1]["location_node_id"]), None)
            if curr_node and next_node:
                cache_key = (curr_node.id, next_node.id)
                if cache_key not in segment_cache:
                    segment_cache[cache_key] = get_ors_driving_poly_path(curr_node.lat, curr_node.lng, next_node.lat, next_node.lng)
                path.extend(segment_cache[cache_key])
        polylines[bid] = path

    result = {
        "buses": request.num_buses,
        "penalty": 0,
        "score": request.num_buses * 200
    }

    solution = {
        "schedule": schedule,
        "polylines": polylines,
        "metrics": result
    }

    return {
        "solutions": [solution]
    }

# --- AUTHENTICATION ENDPOINTS ---

@app.post("/register")
async def register(user: UserCreate):
    existing_user = await users_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed_password = get_password_hash(user.password)
    new_user = {
        "name": user.name,
        "email": user.email,
        "password_hash": hashed_password,
        "created_at": datetime.utcnow()
    }
    
    result = await users_collection.insert_one(new_user)
    return {"message": "User created successfully", "id": str(result.inserted_id)}

@app.post("/login")
async def login(user_credentials: UserLogin):
    user = await users_collection.find_one({"email": user_credentials.email})
    if not user or not verify_password(user_credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user["_id"])}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_name": user["name"],
        "user_email": user["email"]
    }

# --- SCHEDULE/PLAN ENDPOINTS ---

@app.post("/save-schedule")
async def save_schedule(request: ScheduleSaveRequest, current_user: dict = Depends(get_current_user)):
    name = request.name
    if not name or name.strip() == "":
        name = f"Plan - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}"
        
    new_plan = {
        "user_id": str(current_user["_id"]),
        "name": name,
        "summary": request.summary,
        "mode": request.mode,
        "buses": request.buses,
        "penalty": request.penalty,
        "score": request.score,
        "status": request.status,
        "stops": request.stops,
        "solution": request.solution,
        "input_locations": request.input_locations,
        "created_at": datetime.utcnow(),
        "is_favorite": False
    }
    
    result = await schedules_collection.insert_one(new_plan)
    return {"message": "Schedule saved successfully", "id": str(result.inserted_id)}

@app.get("/schedules")
async def get_schedules(current_user: dict = Depends(get_current_user)):
    cursor = schedules_collection.find({"user_id": str(current_user["_id"])}).sort("created_at", -1)
    schedules = await cursor.to_list(length=100)
    
    # Convert ObjectIds to strings
    for s in schedules:
        s["_id"] = str(s["_id"])
        
    return schedules

@app.get("/schedule/{id}")
async def get_schedule(id: str, current_user: dict = Depends(get_current_user)):
    try:
        schedule = await schedules_collection.find_one({"_id": ObjectId(id), "user_id": str(current_user["_id"])})
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")
        
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    schedule["_id"] = str(schedule["_id"])
    return schedule

@app.delete("/schedule/{id}")
async def delete_schedule(id: str, current_user: dict = Depends(get_current_user)):
    try:
        result = await schedules_collection.delete_one({"_id": ObjectId(id), "user_id": str(current_user["_id"])})
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")
        
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    return {"message": "Schedule deleted successfully"}

@app.post("/duplicate/{id}")
async def duplicate_schedule(id: str, current_user: dict = Depends(get_current_user)):
    try:
        schedule = await schedules_collection.find_one({"_id": ObjectId(id), "user_id": str(current_user["_id"])})
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")
        
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    del schedule["_id"]
    schedule["name"] = f"{schedule['name']} (Copy)"
    schedule["created_at"] = datetime.utcnow()
    schedule["is_favorite"] = False
    
    result = await schedules_collection.insert_one(schedule)
    return {"message": "Schedule duplicated", "id": str(result.inserted_id)}

@app.post("/favorite/{id}")
async def favorite_schedule(id: str, current_user: dict = Depends(get_current_user)):
    try:
        schedule = await schedules_collection.find_one({"_id": ObjectId(id), "user_id": str(current_user["_id"])})
    except:
        raise HTTPException(status_code=400, detail="Invalid ID format")
        
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
        
    new_fav_status = not schedule.get("is_favorite", False)
    await schedules_collection.update_one(
        {"_id": ObjectId(id)},
        {"$set": {"is_favorite": new_fav_status}}
    )
    return {"message": "Favorite status updated", "is_favorite": new_fav_status}