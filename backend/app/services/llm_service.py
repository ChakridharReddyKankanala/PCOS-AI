import json
import logging
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

from app.core.config import settings

logger = logging.getLogger("pcos_llm")

def get_genai_client() -> Optional[genai.Client]:
    if not settings.GEMINI_API_KEY or not settings.GEMINI_API_KEY.strip():
        return None
    try:
        return genai.Client(api_key=settings.GEMINI_API_KEY.strip())
    except Exception as exc:
        logger.warning("Failed to initialize Google GenAI client: %s", exc)
        return None


def generate_fallback_insights(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Clinically intelligent fallback generator when Gemini API key is missing or quota exceeded."""
    combined = analysis.get("combined", {})
    prob = combined.get("probability")
    is_positive = (prob is not None and prob >= 0.5) or combined.get("prediction") == "PCOS_POSITIVE"
    
    clinical_inputs = analysis.get("clinical_input") or {}
    explainability = analysis.get("explainability") or {}
    raw_importance = explainability.get("top_features") or []

    key_drivers = []
    for item in raw_importance[:4]:
        name = item.get("name") or item.get("feature") or "Clinical Feature"
        val = item.get("value")
        key_drivers.append({
            "feature": str(name).replace("_", " ").title(),
            "impact": "Higher risk contributor" if item.get("shap", 0) > 0 else "Protective/Normalizing indicator",
            "details": f"Recorded value: {val}" if val is not None else "Observed in clinical panel",
        })

    if not key_drivers:
        key_drivers = [
            {"feature": "Hormonal Biomarkers", "impact": "Baseline clinical markers", "details": "LH/FSH ratio and androgen patterns"},
            {"feature": "Metabolic Profile", "impact": "Insulin & weight metrics", "details": "BMI and cycle regularity metrics"}
        ]

    if is_positive:
        headline = "Elevated Risk Patterns Observed for PCOS"
        summary = (
            f"The multimodal screening estimated an elevated likelihood of PCOS (Probability: {int(prob * 100) if prob else 75}%). "
            "Biomarkers and imaging features demonstrate characteristic hormonal or follicular patterns frequently associated with "
            "ovulatory irregularity and metabolic shifts."
        )
        lifestyle = [
            {
                "category": "Diet & Insulin Sensitivity",
                "recommendation": "Adopt a low-glycemic Mediterranean-style nutrition plan rich in fiber, lean proteins, and healthy fats (omega-3s). Limit refined carbohydrates to help stabilize blood glucose and insulin levels."
            },
            {
                "category": "Targeted Physical Activity",
                "recommendation": "Engage in 150 minutes weekly of moderate aerobic exercise combined with 2-3 sessions of progressive resistance training, which enhances muscle glucose uptake and insulin sensitivity."
            },
            {
                "category": "Sleep & Stress Reduction",
                "recommendation": "Aim for 7-9 hours of consistent, restorative sleep. Chronic stress can elevate adrenal androgens and cortisol, exacerbating metabolic and hormonal imbalances."
            }
        ]
        questions = [
            "Would you recommend a comprehensive fasting glucose and lipid panel to assess metabolic risks?",
            "Should we monitor my mid-luteal progesterone or evaluate specific androgen levels (free testosterone, DHEA-S)?",
            "Are insulin-sensitizing supplements (such as myo-inositol) or tailored lifestyle interventions suitable for my phenotype?",
            "What schedule do you recommend for follow-up pelvic ultrasound monitoring?"
        ]
    else:
        headline = "Normal Screening Profile / Low PCOS Likelihood"
        summary = (
            f"The multimodal assessment indicated a low probability of PCOS (Probability: {int(prob * 100) if prob else 15}%). "
            "Your reported clinical parameters and ultrasound markers fall primarily within anticipated physiological ranges."
        )
        lifestyle = [
            {
                "category": "General Menstrual Health",
                "recommendation": "Continue tracking cycle duration and symptoms using a cycle log to detect any subtle rhythm changes early."
            },
            {
                "category": "Balanced Nutrition",
                "recommendation": "Maintain a balanced whole-foods diet emphasizing colorful antioxidants, adequate hydration, and micronutrients like vitamin D and magnesium."
            },
            {
                "category": "Active Lifestyle",
                "recommendation": "Maintain regular daily physical activity and functional fitness to support long-term cardiovascular and metabolic vitality."
            }
        ]
        questions = [
            "Are my baseline hormone levels optimal for my current life stage?",
            "What symptoms or cycle variations should prompt a repeat clinical review?",
            "How often do you recommend routine wellness and gynecological checkups?"
        ]

    return {
        "headline": headline,
        "summary": summary,
        "key_drivers": key_drivers,
        "lifestyle_guidance": lifestyle,
        "questions_for_doctor": questions,
        "medical_disclaimer": "This AI-generated analysis is an educational and clinical decision-support reference. It does not constitute a formal diagnosis or therapeutic prescription. Always consult a licensed healthcare professional for diagnostic confirmation and medical care."
    }


async def generate_clinical_insights(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Generates structured, patient-friendly AI medical interpretation using Gemini."""
    client = get_genai_client()
    if not client:
        return generate_fallback_insights(analysis)

    combined = analysis.get("combined", {})
    prob = combined.get("probability")
    pred = combined.get("prediction")
    clinical_input = analysis.get("clinical_input", {})
    explainability = analysis.get("explainability", {})

    prompt = f"""
You are an expert reproductive endocrinology AI specialist.
Generate a structured, compassionate, and clinically grounded explanation of a patient's PCOS screening results.

Screening Data:
- Combined Prediction: {pred}
- Estimated Probability: {prob}
- Clinical Data Summary: {json.dumps(clinical_input)}
- Top Explanatory Markers (SHAP / Feature weights): {json.dumps(explainability.get('top_features', []))}

Return ONLY a valid JSON object matching this exact schema:
{{
  "headline": "A clear, empathetic 1-sentence title",
  "summary": "2-3 empathetic sentences explaining the result in plain medical terms without being alarmist.",
  "key_drivers": [
    {{"feature": "Feature name", "impact": "How it influenced the assessment", "details": "Practical context of this value"}}
  ],
  "lifestyle_guidance": [
    {{"category": "Diet & Nutrition", "recommendation": "Specific actionable evidence-based advice (e.g. low-GI, inositol, anti-inflammatory)"}},
    {{"category": "Physical Activity", "recommendation": "Tailored exercise advice"}},
    {{"category": "Stress & Sleep", "recommendation": "Hormone-supportive lifestyle practices"}}
  ],
  "questions_for_doctor": [
    "Thoughtful question 1 to ask the doctor",
    "Thoughtful question 2",
    "Thoughtful question 3"
  ],
  "medical_disclaimer": "This AI-generated summary is for informational support only and does not replace professional medical diagnosis."
}}
"""
    try:
        model_name = settings.GEMINI_MODEL or "gemini-1.5-flash"
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            )
        )
        if response.text:
            cleaned = response.text.strip()
            # If wrapped in markdown ```json ... ```
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1]
                if cleaned.endswith("```"):
                    cleaned = cleaned.rsplit("```", 1)[0]
            parsed = json.loads(cleaned.strip())
            return parsed
    except Exception as exc:
        logger.error("Error generating insights with Gemini: %s", exc)

    return generate_fallback_insights(analysis)


async def chat_with_assistant(messages: List[Dict[str, str]], patient_context: Optional[Dict[str, Any]] = None) -> str:
    """Conversational AI Assistant for PCOS inquiries with patient context support."""
    client = get_genai_client()
    
    # System instructions
    system_prompt = (
        "You are PCOS-XAI Copilot, an empathetic, evidence-based AI assistant specializing in Polycystic Ovary Syndrome (PCOS). "
        "Your mission is to empower patients and clinicians with clear, compassionate, and scientifically accurate knowledge about PCOS. "
        "Topics you master: diagnostic criteria (Rotterdam criteria), hormonal biomarkers (LH/FSH, androgens, fasting insulin, AMH, progesterone), "
        "ultrasound morphology (follicle counts, stromal echogenicity), nutrition (low glycemic load, anti-inflammatory, inositol, spearmint tea), "
        "metabolic considerations (insulin resistance, metabolic syndrome), and cycle tracking. "
        "\nIMPORTANT GUIDELINES:"
        "\n1. Be warm, supportive, and accessible. Avoid medical jargon without explaining it."
        "\n2. Never declare a definitive diagnosis or prescribe medications (metformin, spironolactone, birth control) — explain how they work when asked, but advise consultation with their doctor."
        "\n3. If patient diagnostic context is attached below, use it to personalize explanations gently."
        "\n4. If the user asks urgent or dangerous symptoms (severe acute pelvic pain, heavy hemorrhage), advise immediate emergency care."
    )

    if patient_context:
        system_prompt += f"\n\nCURRENT PATIENT SCREENING CONTEXT:\n{json.dumps(patient_context, default=str)}"

    if not client:
        # Fallback intelligent responder when API key is not configured
        last_user_msg = messages[-1]["content"].lower() if messages else ""
        if "diet" in last_user_msg or "food" in last_user_msg or "eat" in last_user_msg:
            return (
                "🥗 **Nutrition Guidance for PCOS**:\n\n"
                "Diet plays a vital role in balancing hormones and managing insulin resistance:\n"
                "• **Low Glycemic Index (GI) Foods**: Opt for oats, quinoa, lentils, and non-starchy vegetables to prevent rapid insulin spikes.\n"
                "• **Anti-Inflammatory Choices**: Berries, leafy greens, walnuts, and fatty fish (salmon) help reduce chronic low-grade inflammation.\n"
                "• **Lean Protein & Fiber**: Pairing protein with every meal stabilizes blood sugar and supports satiety.\n"
                "• **Targeted Supplements**: Research supports myo-inositol with D-chiro-inositol (40:1 ratio) to support ovarian function and insulin sensitivity. Always discuss supplements with your physician!\n\n"
                "*(Note: To unlock live conversational responses tailored to your data, ensure your GEMINI_API_KEY is configured in backend/.env)*"
            )
        elif "lh" in last_user_msg or "fsh" in last_user_msg or "ratio" in last_user_msg:
            return (
                "🔬 **Understanding the LH/FSH Ratio**:\n\n"
                "In a standard physiological menstrual cycle, Luteinizing Hormone (LH) and Follicle Stimulating Hormone (FSH) are usually in roughly a 1:1 ratio during the early follicular phase.\n"
                "• In individuals with PCOS, LH is frequently elevated relative to FSH, creating a ratio of **2:1 or even 3:1**.\n"
                "• Elevated LH can stimulate the ovarian theca cells to produce higher levels of androgens (like testosterone), while suboptimal FSH can hinder dominant follicle development and timely ovulation.\n\n"
                "*(Note: To unlock live conversational responses tailored to your data, ensure your GEMINI_API_KEY is configured in backend/.env)*"
            )
        elif "ultrasound" in last_user_msg or "follicle" in last_user_msg or "cyst" in last_user_msg:
            return (
                "🩺 **Ultrasound Findings & Follicles**:\n\n"
                "On pelvic or transvaginal ultrasound, polycystic ovaries typically exhibit:\n"
                "• Multiple small antral follicles (often 12 or more per ovary, measuring 2–9 mm in diameter), arranged around the periphery in a classic 'string of pearls' pattern.\n"
                "• Increased ovarian stromal volume (dense tissue in the center of the ovary).\n"
                "Remember: Having polycystic-appearing ovaries on ultrasound is only one of the Rotterdam diagnostic criteria; it must be assessed together with clinical symptoms and cycle history.\n\n"
                "*(Note: To unlock live conversational responses tailored to your data, ensure your GEMINI_API_KEY is configured in backend/.env)*"
            )
        else:
            return (
                "Hello! I am your **PCOS-XAI Copilot**. I can help you understand your screening results, explain hormonal biomarkers (such as LH, FSH, AMH, and insulin), "
                "clarify ultrasound findings, and explore evidence-based nutrition and lifestyle strategies.\n\n"
                "How can I assist you with your PCOS questions today?\n\n"
                "*(Tip: You can add your Google Gemini API Key to `backend/.env` under `GEMINI_API_KEY` for unlimited live contextual answers!)*"
            )

    try:
        model_name = settings.GEMINI_MODEL or "gemini-1.5-flash"
        
        # Build contents from message history
        gemini_contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            gemini_contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )

        response = client.models.generate_content(
            model=model_name,
            contents=gemini_contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.4,
            )
        )
        return response.text or "I apologize, but I could not formulate a response at this moment. Please try asking again."
    except Exception as exc:
        logger.error("Error in chat_with_assistant: %s", exc)
        return f"I encountered a temporary issue connecting to Gemini: {str(exc)}. Please check your API key in backend/.env or try again shortly."
