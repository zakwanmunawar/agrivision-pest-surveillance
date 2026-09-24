import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pest_surveillance.db")

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id INTEGER NOT NULL,
                pest_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                sensor_id TEXT NOT NULL,
                timestamp REAL NOT NULL
            )
        """)
        await db.commit()

async def insert_detection(track_id: int, pest_type: str, confidence: float, sensor_id: str, timestamp: float):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO detections (track_id, pest_type, confidence, sensor_id, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (track_id, pest_type, confidence, sensor_id, timestamp))
        await db.commit()

async def fetch_recent_detections(limit: int = 50):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT id, track_id, pest_type, confidence, sensor_id, timestamp 
            FROM detections 
            ORDER BY id DESC 
            LIMIT ?
        """, (limit,)) as cursor:
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

async def fetch_stats():
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT COUNT(DISTINCT track_id) FROM detections") as cursor:
            total_pests = (await cursor.fetchone())[0]

        async with db.execute("""
            SELECT pest_type, COUNT(*) as count 
            FROM detections 
            GROUP BY pest_type 
            ORDER BY count DESC
        """) as cursor:
            species_breakdown = [dict(pest_type=row[0], count=row[1]) for row in await cursor.fetchall()]

        return {
            "total_pests_logged": total_pests if total_pests else 0,
            "species_breakdown": species_breakdown
        }
