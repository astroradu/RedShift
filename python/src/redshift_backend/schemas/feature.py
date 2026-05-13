from pydantic import BaseModel


class Feature(BaseModel):
    id: str
    num: str
    name: str
    desc: str
    meta: str
    icon: str
