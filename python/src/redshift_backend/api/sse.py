from __future__ import annotations

from collections.abc import AsyncIterator

from pydantic import BaseModel


async def encode_sse(
    events: AsyncIterator[BaseModel],
    *,
    progress_type: type[BaseModel],
    done_type: type[BaseModel],
    error_type: type[BaseModel] | None = None,
) -> AsyncIterator[bytes]:
    async for event in events:
        if error_type is not None and isinstance(event, error_type):
            name = "error"
        elif isinstance(event, done_type):
            name = "done"
        elif isinstance(event, progress_type):
            name = "progress"
        else:
            name = "message"
        payload = event.model_dump_json()
        yield f"event: {name}\ndata: {payload}\n\n".encode()
