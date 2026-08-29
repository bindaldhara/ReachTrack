from __future__ import annotations

import asyncpg


async def connect(database_url: str) -> asyncpg.Pool:
    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=10)
    async with pool.acquire() as conn:
        await conn.execute("SELECT 1")
    return pool
