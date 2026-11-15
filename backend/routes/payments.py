"""ponytail: STUB de recuperação — arquivo original perdido na exclusão da pasta.
Router vazio só para a aplicação subir. Reimplementar com o código real quando houver backup."""
from fastapi import APIRouter
router = APIRouter(prefix="/api/payments", tags=["payments"])

@router.get("/credit-config")
async def credit_config():
    return {"credit_value_brl": 0.10, "min_recharge_credits": 10}
