import sys
sys.path.insert(0, '.')

from routers.auth_simple import _DEMO_PASSWORDS, DEMO_USERS, verify_password
import time

print("=== Testing Password Hashing ===")
print(f"Pre-hashed passwords count: {len(_DEMO_PASSWORDS)}")

for email, hash_val in _DEMO_PASSWORDS.items():
    print(f"\n{email}:")
    print(f"  Hash exists: {bool(hash_val)}")
    print(f"  Hash length: {len(hash_val) if hash_val else 0}")
    
    # Test verification speed
    start = time.time()
    result = verify_password("demo123", hash_val)
    elapsed = time.time() - start
    print(f"  Verification result: {result}")
    print(f"  Verification time: {elapsed:.3f}s")

print("\n=== Demo Users ===")
for email, user in DEMO_USERS.items():
    print(f"{email}: has_hash={bool(user.get('hashed_password'))}")
