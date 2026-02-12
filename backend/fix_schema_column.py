import sqlite3
import os

db_path = 'eventaccess.db'

def fix_schema():
    print(f"Checking database at {db_path}...")
    if not os.path.exists(db_path):
        print(f"Error: {db_path} does not exist.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if the column already exists
        cursor.execute("PRAGMA table_info(invitations)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'activation_code' not in columns:
            print("Adding 'activation_code' column to 'invitations' table...")
            cursor.execute("ALTER TABLE invitations ADD COLUMN activation_code TEXT")
            conn.commit()
            print("Successfully added 'activation_code' column.")
        else:
            print("'activation_code' column already exists.")
            
    except Exception as e:
        print(f"Error while updating schema: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    fix_schema()
