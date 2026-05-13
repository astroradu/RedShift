from fastapi import APIRouter

from redshift_backend.data.tools import (
    DEFAULT_TOOL,
    FALLBACK_DEFAULT_TOOL_ID,
    TOOLS_BY_FEATURE,
)
from redshift_backend.schemas.tool import ToolsResponse

router = APIRouter(tags=["tools"])


@router.get("/tools/{feature_id}", response_model=ToolsResponse)
async def list_tools(feature_id: str) -> ToolsResponse:
    tools = TOOLS_BY_FEATURE.get(feature_id, [])
    default = DEFAULT_TOOL.get(feature_id, FALLBACK_DEFAULT_TOOL_ID)
    return ToolsResponse(tools=tools, default_tool_id=default)
