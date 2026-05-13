from pydantic import BaseModel

PaletteVars = dict[str, str]


class Palette(BaseModel):
    id: str
    name: str
    desc: str
    dark: PaletteVars
    light: PaletteVars
