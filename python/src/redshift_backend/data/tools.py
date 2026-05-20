from redshift_backend.schemas.tool import Tool

PLANNER_TOOLS: list[Tool] = [
    Tool(id="constellation", label="Constellation Planner", icon="constellation"),
    Tool(id="galaxy", label="Galaxy Planner", icon="galaxy"),
]

SKY_TOOLS: list[Tool] = [
    Tool(id="sky-view", label="Sky View", icon="globe-grid"),
]

TOOLS_BY_FEATURE: dict[str, list[Tool]] = {
    "planner": PLANNER_TOOLS,
    "sky": SKY_TOOLS,
}

DEFAULT_TOOL: dict[str, str] = {
    "planner": "constellation",
    "sky": "sky-view",
}

FALLBACK_DEFAULT_TOOL_ID = "constellation"
