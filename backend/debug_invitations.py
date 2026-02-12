import asyncio
import sys
import os
from dotenv import load_dotenv

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Load env vars
load_dotenv()

from sqlalchemy import select
from core.database import get_db, db_manager
from models.invitations import Invitations
from models.attendees import Attendees

async def list_invitations():
    # Initialize DB
    await db_manager.init_db()
    
    try:
        async for db in get_db():
            result = await db.execute(select(Invitations, Attendees).join(Attendees, Invitations.attendee_id == Attendees.id))
            rows = result.all()
            
            with open("invitations_clean.txt", "w", encoding="utf-8") as f:
                f.write("=== Dumping Invitations ===\n")
                if not rows:
                    f.write("No invitations found.\n")
                
                for inv, attendee in rows:
                    f.write(f"ID: {inv.id}\n")
                    f.write(f"  Attendee: {attendee.full_name} ({attendee.email})\n")
                    f.write(f"  Status: {inv.status}\n")
                    f.write(f"  Activation Code: {inv.activation_code}\n")
                    f.write("-" * 30 + "\n")
            break
    finally:
        await db_manager.close_db()

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(list_invitations())
