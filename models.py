from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

class LocationNode(BaseModel):
    id: int
    lat: float
    lng: float
    target_time: int       # minutes from midnight
    early_tolerance: int
    late_tolerance: int
    service_time: int = 5  # default time spent at stop
    name: Optional[str] = None

class ScheduleRequest(BaseModel):
    locations: List[LocationNode]
    num_vehicles: int = 20 # maximum buses we are allowed to use
    optimize_for: Optional[str] = "punctuality" # 'punctuality' or 'utilization'
    depot_lat: Optional[float] = None
    depot_lng: Optional[float] = None

class FrequencyRequest(BaseModel):
    locations: List[LocationNode]
    num_buses: int = 5
    start_time_minutes: int = 480 # e.g. 8:00 AM in minutes
    end_time_minutes: int = 1080  # e.g. 6:00 PM in minutes

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_name: str
    user_email: str

class ScheduleSaveRequest(BaseModel):
    name: Optional[str] = None
    summary: str
    mode: str
    buses: int
    penalty: float
    score: float
    status: str
    stops: int
    solution: Any
    input_locations: Optional[List[dict]] = None