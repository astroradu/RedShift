from pydantic import BaseModel


class Tool(BaseModel):
    id: str
    label: str
    icon: str


class ToolsResponse(BaseModel):
    tools: list[Tool]
    default_tool_id: str
