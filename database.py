import motor.motor_asyncio
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")

if not MONGO_URL:
    raise ValueError("No MONGO_URL found in environment variables. Please check .env file.")

client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
db = client.smart_transport
users_collection = db.get_collection("users")
schedules_collection = db.get_collection("schedules")
