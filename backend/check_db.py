#!/usr/bin/env python3
"""Database diagnostic script"""
import asyncio
import sys
import os

# Add backend to path
sys.path.insert(0, '/workspace/app/backend')

from sqlalchemy import text
from core.database import db_manager


async def check_database():
    """Check database contents"""
    try:
        print("Initializing database connection...")
        await db_manager.init_db()
        
        print("\n=== Checking Invitations ===")
        async with db_manager.async_session_maker() as session:
            result = await session.execute(
                text('SELECT id, status, activation_code, attendee_id FROM invitations ORDER BY id DESC LIMIT 5')
            )
            rows = result.fetchall()
            if rows:
                for row in rows:
                    print(f'ID: {row[0]}, Status: {row[1]}, Code: {row[2]}, Attendee: {row[3]}')
            else:
                print("No invitations found")
        
        print("\n=== Checking Attendees ===")
        async with db_manager.async_session_maker() as session:
            result = await session.execute(
                text('SELECT id, email, phone, full_name FROM attendees ORDER BY id DESC LIMIT 5')
            )
            rows = result.fetchall()
            if rows:
                for row in rows:
                    print(f'ID: {row[0]}, Email: {row[1]}, Phone: {row[2]}, Name: {row[3]}')
            else:
                print("No attendees found")
        
        print("\n=== Checking for GENERADO invitations ===")
        async with db_manager.async_session_maker() as session:
            result = await session.execute(
                text("SELECT id, status, activation_code, attendee_id FROM invitations WHERE status = 'GENERADO' ORDER BY id DESC LIMIT 5")
            )
            rows = result.fetchall()
            if rows:
                print(f"Found {len(rows)} invitations with status GENERADO:")
                for row in rows:
                    print(f'  ID: {row[0]}, Code: {row[2]}, Attendee: {row[3]}')
            else:
                print("No GENERADO invitations found")
        
        await db_manager.close_db()
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(check_database())