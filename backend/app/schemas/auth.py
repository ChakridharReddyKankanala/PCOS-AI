from pydantic import BaseModel,EmailStr,Field
from typing import Literal
class RegisterRequest(BaseModel):
    email:EmailStr; phone:str|None=None; password:str=Field(min_length=8); full_name:str=Field(min_length=2); role:Literal["patient","doctor"]
class VerifyOTPRequest(BaseModel): user_id:str; otp:str=Field(min_length=6,max_length=6)
class LoginRequest(BaseModel): email:EmailStr; password:str
class VerifyLoginOTPRequest(BaseModel): user_id:str; otp:str=Field(min_length=6,max_length=6)
class RefreshRequest(BaseModel): refresh_token:str
