from __future__ import annotations

import asyncio
import random
from collections.abc import AsyncIterator

from redshift_backend.schemas.layer import IntegrateDone, IntegrateProgress

_STEP_INTERVAL_S = 0.08
_TAIL_PAUSE_S = 0.4


async def integrate(layer_indices_visible: list[int]) -> AsyncIterator[IntegrateProgress | IntegrateDone]:
    percent = 0.0
    while percent < 100.0:
        await asyncio.sleep(_STEP_INTERVAL_S)
        percent = min(100.0, percent + 4 + random.random() * 4)
        yield IntegrateProgress(percent=percent)
    await asyncio.sleep(_TAIL_PAUSE_S)
    yield IntegrateDone(frames_integrated=len(layer_indices_visible), sigma_clip=True)
